import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { getProvider } from "@/lib/providers/factory";
import { encryptToken } from "@/lib/encryption";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const providerName = params.provider as any;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    console.error(`OAuth error for ${providerName}: ${error} - ${errorDescription}`);
    return NextResponse.redirect(
      new URL(`/dashboard/connections?error=${encodeURIComponent(error)}&desc=${encodeURIComponent(errorDescription || "")}`, req.url)
    );
  }

  if (!code || !state) {
    console.error(`Missing code or state for ${providerName}`);
    return NextResponse.redirect(new URL("/dashboard/connections?error=missing_code_or_state", req.url));
  }

  try {
    // Validate state - server-side identity is authoritative
    let decoded: any;
    try {
      decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    } catch (parseErr) {
      console.error(`Invalid state format in callback for ${providerName}: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
      return NextResponse.redirect(new URL("/dashboard/connections?error=invalid_state_format", req.url));
    }

    if (!decoded.userId) {
      console.error(`State missing userId in callback for ${providerName}`);
      return NextResponse.redirect(new URL("/dashboard/connections?error=invalid_state_no_user", req.url));
    }

    if (decoded.userId !== session.user.id) {
      console.error("State user mismatch", { expected: session.user.id, got: decoded.userId });
      return NextResponse.redirect(new URL("/dashboard/connections?error=invalid_state_user_mismatch", req.url));
    }

    // Check timestamp to prevent replay (10 min window - increased from 5 for better UX)
    if (decoded.timestamp && Date.now() - decoded.timestamp > 10 * 60 * 1000) {
      console.warn(`State expired for ${providerName}, age: ${Date.now() - decoded.timestamp}ms`);
      return NextResponse.redirect(new URL("/dashboard/connections?error=state_expired", req.url));
    }

    // Validate provider matches state
    if (decoded.provider && decoded.provider !== providerName) {
      console.error(`State provider mismatch: expected ${providerName}, got ${decoded.provider}`);
      return NextResponse.redirect(new URL("/dashboard/connections?error=provider_mismatch", req.url));
    }

    const provider = getProvider(providerName);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/connected-accounts/callback/${providerName}`;

    console.log(`Exchanging code for tokens for ${providerName}, user ${session.user.id}, redirectUri: ${redirectUri}`);

    // Exchange code for tokens - tokens are secrets, never log
    let tokens;
    try {
      tokens = await provider.exchangeCodeForTokens(code, redirectUri);
    } catch (tokenErr) {
      console.error(`Token exchange failed for ${providerName}`, tokenErr instanceof Error ? tokenErr.message : tokenErr);
      return NextResponse.redirect(
        new URL(`/dashboard/connections?error=token_exchange_failed&provider=${providerName}`, req.url)
      );
    }

    // Get provider user info
    let providerUser;
    try {
      providerUser = await provider.getCurrentUser(tokens.accessToken);
    } catch (userErr) {
      console.error(`Failed to get provider user for ${providerName}`, userErr instanceof Error ? userErr.message : userErr);
      return NextResponse.redirect(new URL(`/dashboard/connections?error=failed_to_get_user&provider=${providerName}`, req.url));
    }

    // Encrypt tokens at rest
    const accessTokenEncrypted = encryptToken(tokens.accessToken);
    const refreshTokenEncrypted = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

    // Check if account already exists for this user
    const existing = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, session.user.id),
          eq(connectedAccounts.provider, providerName),
          eq(connectedAccounts.providerAccountId, providerUser.providerAccountId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(connectedAccounts)
        .set({
          accessTokenEncrypted,
          refreshTokenEncrypted,
          tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
          displayName: providerUser.displayName,
          providerAccountEmail: providerUser.email,
          avatarUrl: providerUser.imageUrl,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing[0].id));

      console.log(`Updated existing connected account ${existing[0].id} for user ${session.user.id}`);
    } else {
      // Create new
      const [newAccount] = await db
        .insert(connectedAccounts)
        .values({
          userId: session.user.id,
          provider: providerName,
          providerAccountId: providerUser.providerAccountId,
          providerAccountEmail: providerUser.email,
          displayName: providerUser.displayName,
          accessTokenEncrypted,
          refreshTokenEncrypted,
          tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
          avatarUrl: providerUser.imageUrl,
          country: providerUser.country,
          product: providerUser.product,
          isActive: true,
        })
        .returning();

      console.log(`Created new connected account ${newAccount.id} for user ${session.user.id}, provider ${providerName}`);
    }

    return NextResponse.redirect(new URL("/dashboard/connections?success=connected", req.url));
  } catch (err) {
    // Safe error - don't expose tokens or secrets
    console.error(`Failed to complete OAuth for ${providerName}`, err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "");
    return NextResponse.redirect(new URL(`/dashboard/connections?error=oauth_failed&provider=${providerName}`, req.url));
  }
}

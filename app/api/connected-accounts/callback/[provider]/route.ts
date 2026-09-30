import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { getProvider } from "@/lib/providers/factory";
import { encryptToken } from "@/lib/encryption";
import { eq, and } from "drizzle-orm";
import { getRedirectUri, getAppUrl } from "@/lib/url";

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

    if (decoded.timestamp && Date.now() - decoded.timestamp > 10 * 60 * 1000) {
      console.warn(`State expired for ${providerName}, age: ${Date.now() - decoded.timestamp}ms`);
      return NextResponse.redirect(new URL("/dashboard/connections?error=state_expired", req.url));
    }

    if (decoded.provider && decoded.provider !== providerName) {
      console.error(`State provider mismatch: expected ${providerName}, got ${decoded.provider}`);
      return NextResponse.redirect(new URL("/dashboard/connections?error=provider_mismatch", req.url));
    }

    const provider = getProvider(providerName);
    
    // Use helper that prioritizes NEXTAUTH_URL - must match exactly the URI used in authorize step
    // Fixes bug where localhost was used even when NEXTAUTH_URL set to ngrok, causing Spotify to reject
    const redirectUri = getRedirectUri(req, providerName);
    const appUrl = getAppUrl(req);

    console.log(`[Callback] Exchanging code for ${providerName}, user ${session.user.id}, appUrl: ${appUrl}, redirectUri: ${redirectUri}, NEXTAUTH_URL: ${process.env.NEXTAUTH_URL}`);

    let tokens;
    try {
      tokens = await provider.exchangeCodeForTokens(code, redirectUri);
    } catch (tokenErr) {
      console.error(`Token exchange failed for ${providerName}, redirectUri: ${redirectUri}`, tokenErr instanceof Error ? tokenErr.message : tokenErr);
      return NextResponse.redirect(
        new URL(`/dashboard/connections?error=token_exchange_failed&provider=${providerName}&redirectUri=${encodeURIComponent(redirectUri)}`, req.url)
      );
    }

    let providerUser;
    try {
      providerUser = await provider.getCurrentUser(tokens.accessToken);
    } catch (userErr) {
      console.error(`Failed to get provider user for ${providerName}`, userErr instanceof Error ? userErr.message : userErr);
      return NextResponse.redirect(new URL(`/dashboard/connections?error=failed_to_get_user&provider=${providerName}`, req.url));
    }

    const accessTokenEncrypted = encryptToken(tokens.accessToken);
    const refreshTokenEncrypted = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

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
    console.error(`Failed to complete OAuth for ${providerName}`, err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "");
    return NextResponse.redirect(new URL(`/dashboard/connections?error=oauth_failed&provider=${providerName}`, req.url));
  }
}

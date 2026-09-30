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

  if (error) {
    console.error(`OAuth error for ${providerName}: ${error}`);
    return NextResponse.redirect(new URL(`/dashboard/connections?error=${encodeURIComponent(error)}`, req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=missing_code_or_state", req.url));
  }

  try {
    // Validate state - server-side identity is authoritative
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    if (decoded.userId !== session.user.id) {
      console.error("State user mismatch", { expected: session.user.id, got: decoded.userId });
      return NextResponse.redirect(new URL("/dashboard/connections?error=invalid_state", req.url));
    }

    // Check timestamp to prevent replay (5 min window)
    if (Date.now() - decoded.timestamp > 5 * 60 * 1000) {
      return NextResponse.redirect(new URL("/dashboard/connections?error=state_expired", req.url));
    }

    const provider = getProvider(providerName);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/connected-accounts/callback/${providerName}`;

    // Exchange code for tokens - tokens are secrets, never log
    const tokens = await provider.exchangeCodeForTokens(code, redirectUri);

    // Get provider user info
    const providerUser = await provider.getCurrentUser(tokens.accessToken);

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
    } else {
      // Create new
      await db.insert(connectedAccounts).values({
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
      });
    }

    return NextResponse.redirect(new URL("/dashboard/connections?success=connected", req.url));
  } catch (err) {
    // Safe error - don't expose tokens or secrets
    console.error(`Failed to complete OAuth for ${providerName}`, err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/dashboard/connections?error=oauth_failed", req.url));
  }
}

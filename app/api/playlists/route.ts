import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getProvider } from "@/lib/providers/factory";
import { decryptToken, encryptToken } from "@/lib/encryption";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const cursor = searchParams.get("cursor") || undefined;

  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  try {
    // Ownership check: account must belong to authenticated user
    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "Account not found or not owned by user" }, { status: 404 });
    }

    const provider = getProvider(account.provider as any);
    let accessToken = decryptToken(account.accessTokenEncrypted);

    // Try to list playlists, handle token refresh if needed
    try {
      const result = await provider.listPlaylists(accessToken, cursor, 50);
      return NextResponse.json({ data: result });
    } catch (err: any) {
      // If authentication error and we have refresh token, try refresh
      if (err.code === "AUTHENTICATION_ERROR" && account.refreshTokenEncrypted) {
        try {
          const refreshToken = decryptToken(account.refreshTokenEncrypted);
          const newTokens = await provider.refreshAccessToken(refreshToken);
          accessToken = newTokens.accessToken;

          // Update encrypted tokens
          await db
            .update(connectedAccounts)
            .set({
              accessTokenEncrypted: encryptToken(newTokens.accessToken),
              refreshTokenEncrypted: newTokens.refreshToken ? encryptToken(newTokens.refreshToken) : account.refreshTokenEncrypted,
              tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1000),
              updatedAt: new Date(),
            })
            .where(eq(connectedAccounts.id, account.id));

          // Retry
          const result = await provider.listPlaylists(accessToken, cursor, 50);
          return NextResponse.json({ data: result });
        } catch (refreshErr) {
          console.error("Failed to refresh token", refreshErr);
          return NextResponse.json({ error: "Authentication failed, please reconnect account" }, { status: 401 });
        }
      }
      throw err;
    }
  } catch (err) {
    console.error("Error listing playlists", err instanceof Error ? err.message : err);
    // Safe error - don't expose tokens
    return NextResponse.json({ error: "Failed to list playlists" }, { status: 500 });
  }
}

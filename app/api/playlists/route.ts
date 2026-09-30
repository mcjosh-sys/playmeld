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

    if (!account.isActive) {
      return NextResponse.json({ error: "Account is disconnected, please reconnect. Tokens were cleared on disconnect." }, { status: 400 });
    }

    // Check if tokens are marked as disconnected
    if (account.accessTokenEncrypted === "DISCONNECTED") {
      return NextResponse.json({ error: "Account disconnected, tokens cleared. Please reconnect." }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(account.accessTokenEncrypted);
    } catch (decryptErr) {
      console.error(`Failed to decrypt token for account ${accountId}`, decryptErr instanceof Error ? decryptErr.message : decryptErr);
      return NextResponse.json({ error: "Failed to decrypt token, please reconnect account" }, { status: 401 });
    }

    const provider = getProvider(account.provider as any);

    // Try to list playlists, handle token refresh if needed
    try {
      const result = await provider.listPlaylists(accessToken, cursor, 50);
      return NextResponse.json({ data: result });
    } catch (err: any) {
      console.error(`Provider listPlaylists error for ${account.provider} account ${accountId}:`, err.message, err.code, err.stack?.slice(0, 500));

      // If authentication error and we have refresh token, try refresh
      if (err.code === "AUTHENTICATION_ERROR" && account.refreshTokenEncrypted && account.refreshTokenEncrypted !== "DISCONNECTED") {
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
          console.error("Failed to refresh token", refreshErr instanceof Error ? refreshErr.message : refreshErr);
          return NextResponse.json({ error: "Authentication failed, please reconnect account" }, { status: 401 });
        }
      }

      // Handle specific provider errors with better messages
      if (err.code === "NOT_FOUND") {
        return NextResponse.json({ error: "Resource not found" }, { status: 404 });
      }
      if (err.code === "PERMISSION_ERROR") {
        return NextResponse.json({ error: "Permission denied, check scopes" }, { status: 403 });
      }
      if (err.code === "RATE_LIMIT") {
        return NextResponse.json({ error: `Rate limited, retry after ${err.retryAfterMs || "unknown"}ms` }, { status: 429 });
      }

      // For unexpected errors like reading total of undefined, return detailed message for debugging (without secrets)
      return NextResponse.json({ error: `Provider error: ${err.message?.slice(0, 300) || "Unknown"}` }, { status: 500 });
    }
  } catch (err) {
    console.error("Error listing playlists", err instanceof Error ? err.message : err, err instanceof Error ? err.stack?.slice(0, 1000) : "");
    // Safe error - don't expose tokens, but include message for debugging
    const message = err instanceof Error ? err.message : "Failed to list playlists";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}

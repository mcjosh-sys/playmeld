import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getProvider } from "@/lib/providers/factory";
import { decryptToken, encryptToken } from "@/lib/encryption";

export const runtime = "nodejs";

/**
 * GET /api/playlists/[playlistId]/tracks?accountId=xxx&cursor=yyy
 * Gets tracks for a playlist with ownership check, pagination, token refresh
 * Handles empty, one-page, multi-page, error on later page per music-provider skill
 */

export async function GET(req: NextRequest, { params }: { params: { playlistId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlistId = params.playlistId;
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const cursor = searchParams.get("cursor") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  if (!accountId) {
    return NextResponse.json({ error: "accountId query param required" }, { status: 400 });
  }

  if (!playlistId) {
    return NextResponse.json({ error: "playlistId required" }, { status: 400 });
  }

  try {
    // Ownership check: account must belong to authenticated user
    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "Account not found or not owned" }, { status: 404 });
    }

    if (!account.isActive) {
      return NextResponse.json({ error: "Account is disconnected, please reconnect" }, { status: 400 });
    }

    if (account.accessTokenEncrypted === "DISCONNECTED") {
      return NextResponse.json({ error: "Account disconnected, tokens cleared. Please reconnect." }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(account.accessTokenEncrypted);
    } catch (decryptErr) {
      console.error(`Failed to decrypt token for account ${accountId}`, decryptErr instanceof Error ? decryptErr.message : decryptErr);
      return NextResponse.json({ error: "Failed to decrypt token, please reconnect" }, { status: 401 });
    }

    const provider = getProvider(account.provider as any);

    // Helper to handle token refresh
    const fetchWithRefresh = async (token: string, attempt = 0): Promise<any> => {
      try {
        const result = await provider.getPlaylistTracks(token, playlistId, cursor, limit);
        return result;
      } catch (err: any) {
        if (err.code === "AUTHENTICATION_ERROR" && attempt === 0 && account.refreshTokenEncrypted) {
          console.log(`Refreshing token for account ${accountId}, provider ${account.provider}`);
          try {
            const refreshToken = decryptToken(account.refreshTokenEncrypted);
            const newTokens = await provider.refreshAccessToken(refreshToken);
            
            await db
              .update(connectedAccounts)
              .set({
                accessTokenEncrypted: encryptToken(newTokens.accessToken),
                refreshTokenEncrypted: newTokens.refreshToken ? encryptToken(newTokens.refreshToken) : account.refreshTokenEncrypted,
                tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1000),
                updatedAt: new Date(),
              })
              .where(eq(connectedAccounts.id, account.id));

            return fetchWithRefresh(newTokens.accessToken, attempt + 1);
          } catch (refreshErr) {
            console.error("Failed to refresh token", refreshErr);
            throw new Error("Authentication failed, please reconnect account");
          }
        }
        throw err;
      }
    };

    const result = await fetchWithRefresh(accessToken);

    return NextResponse.json({ data: result });
  } catch (err: any) {
    console.error("Error getting playlist tracks", err instanceof Error ? err.message : err, `code: ${err.code}, provider: ${err.provider}`);

    // Handle specific provider errors with proper status codes and helpful messages
    if (err.code === "NOT_FOUND" || err.message?.includes("not found") || err.message?.includes("Not found")) {
      return NextResponse.json({ error: "Playlist not found - it may have been deleted or is private" }, { status: 404 });
    }

    if (err.code === "PERMISSION_ERROR" || err.message?.includes("Forbidden") || err.message?.includes("403")) {
      return NextResponse.json(
        {
          error: "Forbidden: You don't have permission to access this playlist",
          details: "Possible causes: playlist is private and not owned by connected account, missing scopes (need playlist-read-private, playlist-read-collaborative), or market restriction. Try with a playlist you own or a public playlist.",
          provider: err.provider,
          code: err.code,
          help: "For Spotify: Ensure playlist is owned by connected account or is public/collaborative. Check scopes in Spotify Dashboard. For YouTube: Ensure playlist is owned by connected YouTube account (mine=true).",
        },
        { status: 403 }
      );
    }

    if (err.code === "AUTHENTICATION_ERROR") {
      return NextResponse.json({ error: "Authentication failed, please reconnect account" }, { status: 401 });
    }

    if (err.code === "RATE_LIMIT") {
      return NextResponse.json(
        { error: `Rate limited, retry after ${err.retryAfterMs || "unknown"}ms`, retryAfterMs: err.retryAfterMs },
        { status: 429 }
      );
    }

    // Safe error - no tokens, but include message for debugging
    const message = err instanceof Error ? err.message : "Failed to get playlist tracks";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getProvider } from "@/lib/providers/factory";
import { decryptToken, encryptToken } from "@/lib/encryption";

export const runtime = "nodejs";

/**
 * GET /api/playlists/[playlistId]?accountId=xxx
 * Gets single playlist details with ownership check
 */

export async function GET(req: NextRequest, { params }: { params: { playlistId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlistId = params.playlistId;
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json({ error: "accountId query param required" }, { status: 400 });
  }

  try {
    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "Account not found or not owned" }, { status: 404 });
    }

    if (!account.isActive) {
      return NextResponse.json({ error: "Account disconnected" }, { status: 400 });
    }

    const provider = getProvider(account.provider as any);
    let accessToken = decryptToken(account.accessTokenEncrypted);

    const fetchWithRefresh = async (token: string, attempt = 0): Promise<any> => {
      try {
        return await provider.getPlaylist(token, playlistId);
      } catch (err: any) {
        if (err.code === "AUTHENTICATION_ERROR" && attempt === 0 && account.refreshTokenEncrypted) {
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
        }
        throw err;
      }
    };

    const playlist = await fetchWithRefresh(accessToken);

    return NextResponse.json({ data: playlist });
  } catch (err) {
    console.error("Error getting playlist", err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : "Failed to get playlist";
    if (message.includes("not found") || message.includes("Not found")) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message.slice(0, 200) }, { status: 500 });
  }
}

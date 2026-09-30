import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAppUrl } from "@/lib/url";

export const runtime = "nodejs";

// List connected accounts - with ownership check
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await db
    .select({
      id: connectedAccounts.id,
      provider: connectedAccounts.provider,
      providerAccountId: connectedAccounts.providerAccountId,
      displayName: connectedAccounts.displayName,
      avatarUrl: connectedAccounts.avatarUrl,
      isActive: connectedAccounts.isActive,
      createdAt: connectedAccounts.createdAt,
      lastSyncedAt: connectedAccounts.lastSyncedAt,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, session.user.id));

  // Never return tokens
  return NextResponse.json({ data: accounts });
}

// Initiate OAuth flow - generates secure state
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { provider } = body;

    if (!provider || !["spotify", "apple_music", "youtube_music", "tidal", "deezer"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    // Generate state for OAuth security
    const state = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        provider,
        nonce: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
      })
    ).toString("base64url");

    // Use helper that prioritizes NEXTAUTH_URL over NEXT_PUBLIC_APP_URL
    // Fixes bug where localhost was used even when NEXTAUTH_URL set to ngrok
    const appUrl = getAppUrl(req);
    
    console.log(`[Initiate] User ${session.user.id} -> ${provider}, appUrl: ${appUrl}, NEXTAUTH_URL: ${process.env.NEXTAUTH_URL}, NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);
    
    return NextResponse.json({
      data: {
        provider,
        state,
        authorizationUrl: `${appUrl}/api/connected-accounts/${provider}/authorize?state=${state}`,
      },
    });
  } catch (err) {
    console.error("Error initiating provider connection", err);
    return NextResponse.json({ error: "Failed to initiate connection" }, { status: 500 });
  }
}

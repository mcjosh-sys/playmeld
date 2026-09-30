import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// List connected accounts - with ownership check
export async function GET() {
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

// For future: initiate OAuth flow
export async function POST(req: Request) {
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

    // Build authorization URL - will be handled by provider-specific route
    // For now return state and indicate next step
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
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

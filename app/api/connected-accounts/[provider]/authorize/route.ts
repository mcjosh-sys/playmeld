import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getProvider } from "@/lib/providers/factory";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerName = params.provider as any;
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state");

  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }

  try {
    // Validate state contains correct userId (server-side identity check)
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    if (decoded.userId !== session.user.id) {
      return NextResponse.json({ error: "Invalid state - user mismatch" }, { status: 403 });
    }

    const provider = getProvider(providerName);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/connected-accounts/callback/${providerName}`;

    const authUrl = provider.getAuthorizationUrl(state, redirectUri);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("Error in provider authorize", err);
    return NextResponse.json({ error: "Failed to generate authorization URL" }, { status: 500 });
  }
}

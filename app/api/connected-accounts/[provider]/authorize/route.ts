import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getProvider } from "@/lib/providers/factory";
import { getAppUrl, getRedirectUri } from "@/lib/url";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerName = params.provider as any;
  const { searchParams } = new URL(req.url);
  let state = searchParams.get("state");

  try {
    let finalState = state;

    // If state is missing or invalid, generate a new secure state server-side
    if (!state) {
      console.log(`No state provided for ${providerName}, generating new state for user ${session.user.id}`);
      finalState = Buffer.from(
        JSON.stringify({
          userId: session.user.id,
          provider: providerName,
          nonce: Math.random().toString(36).substring(2, 15),
          timestamp: Date.now(),
        })
      ).toString("base64url");
    } else {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
        
        if (decoded.userId && decoded.userId !== session.user.id) {
          console.error(`State user mismatch: expected ${session.user.id}, got ${decoded.userId}`);
          return NextResponse.json({ error: "Invalid state - user mismatch" }, { status: 403 });
        }

        if (!decoded.userId) {
          console.log(`State missing userId, generating new state for user ${session.user.id}`);
          finalState = Buffer.from(
            JSON.stringify({
              userId: session.user.id,
              provider: providerName,
              nonce: decoded.nonce || Math.random().toString(36).substring(2, 15),
              timestamp: Date.now(),
            })
          ).toString("base64url");
        } else {
          finalState = state;
        }
      } catch (parseErr) {
        console.log(`Invalid state format, generating new state for user ${session.user.id}: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
        finalState = Buffer.from(
          JSON.stringify({
            userId: session.user.id,
            provider: providerName,
            nonce: Math.random().toString(36).substring(2, 15),
            timestamp: Date.now(),
          })
        ).toString("base64url");
      }
    }

    const provider = getProvider(providerName);
    
    // Use new helper that prioritizes NEXTAUTH_URL over NEXT_PUBLIC_APP_URL and respects request origin
    // Fixes bug where localhost was used even when NEXTAUTH_URL set to ngrok
    const redirectUri = getRedirectUri(req, providerName);
    const appUrl = getAppUrl(req);

    console.log(`[Authorize] User ${session.user.id} -> ${providerName}, appUrl: ${appUrl}, redirectUri: ${redirectUri}, NEXTAUTH_URL: ${process.env.NEXTAUTH_URL}, NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);

    const authUrl = provider.getAuthorizationUrl(finalState!, redirectUri);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("Error in provider authorize", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to generate authorization URL. Check SPOTIFY_CLIENT_ID/SECRET env vars." }, { status: 500 });
  }
}

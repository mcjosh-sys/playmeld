/**
 * Get canonical app URL for OAuth redirects and callbacks
 * Fixes bug where localhost was used even when accessed via ngrok or NEXTAUTH_URL set to ngrok
 * 
 * Priority for ngrok awareness:
 * 1. Request host if it's canonical ngrok hostname (intensely-actual-chipmunk.ngrok-free.app) - always use ngrok if accessed via ngrok
 * 2. Request origin if not localhost (for Vercel and ngrok)
 * 3. NEXTAUTH_URL (server canonical)
 * 4. NEXT_PUBLIC_APP_URL
 * 5. VERCEL_URL
 * 6. Fallback localhost
 */

const CANONICAL_NGROK_HOST = "intensely-actual-chipmunk.ngrok-free.app";

export function getAppUrl(req?: Request | { headers: { get: (name: string) => string | null }; nextUrl?: { origin: string } } | any): string {
  // Priority 1: If request is via canonical ngrok hostname, always use it - fixes localhost redirect bug
  if (req) {
    try {
      const host = req.headers?.get?.("host") || req.headers?.get?.("x-forwarded-host") || "";
      const proto = req.headers?.get?.("x-forwarded-proto") || req.headers?.get?.("x-forwarded-protocol") || "https";

      // If host is canonical ngrok, use it regardless of env
      if (host.includes(CANONICAL_NGROK_HOST)) {
        const url = `https://${CANONICAL_NGROK_HOST}`.replace(/\/$/, "");
        console.log(`[URL] Using canonical ngrok host from request: ${url}, host header: ${host}`);
        return url;
      }

      // If host is not localhost, use request origin (for Vercel and ngrok custom domains)
      if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
        const protocol = proto || "https";
        const url = `${protocol}://${host}`.replace(/\/$/, "");
        console.log(`[URL] Using request host (non-localhost): ${url}`);
        return url;
      }

      // Try nextUrl.origin
      if (req.nextUrl?.origin) {
        const origin = req.nextUrl.origin.replace(/\/$/, "");
        // If origin is not localhost, use it
        if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
          console.log(`[URL] Using nextUrl.origin (non-localhost): ${origin}`);
          return origin;
        }
        // If origin is localhost but host header was ngrok, we already handled above
        // Otherwise, continue to env vars
      }

      // Try URL origin from req.url
      if (req.url) {
        try {
          const urlObj = new URL(req.url);
          const origin = urlObj.origin.replace(/\/$/, "");
          if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
            console.log(`[URL] Using req.url origin (non-localhost): ${origin}`);
            return origin;
          }
        } catch {}
      }
    } catch (err) {
      console.warn("Failed to get app URL from request", err);
    }
  }

  // Priority 2: NEXTAUTH_URL - server canonical (should be set to ngrok for local OAuth testing)
  if (process.env.NEXTAUTH_URL) {
    const url = process.env.NEXTAUTH_URL.replace(/\/$/, "");
    // If NEXTAUTH_URL is localhost but we are in production or have ngrok host, prefer non-localhost?
    // But respect env if explicitly set - user should set NEXTAUTH_URL to ngrok for local testing
    console.log(`[URL] Using NEXTAUTH_URL: ${url}`);
    return url;
  }

  // Priority 3: NEXT_PUBLIC_APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const url = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    console.log(`[URL] Using NEXT_PUBLIC_APP_URL: ${url}`);
    return url;
  }

  // Priority 4: Vercel URL
  if (process.env.VERCEL_URL) {
    const url = `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
    console.log(`[URL] Using VERCEL_URL: ${url}`);
    return url;
  }

  // Priority 5: Request origin as fallback even if localhost (for local dev without env)
  if (req) {
    try {
      if (req.nextUrl?.origin) {
        return req.nextUrl.origin.replace(/\/$/, "");
      }
      if (req.url) {
        const urlObj = new URL(req.url);
        return urlObj.origin.replace(/\/$/, "");
      }
    } catch {}
  }

  // Fallback: localhost
  console.log(`[URL] Fallback to localhost:3000`);
  return "http://localhost:3000";
}

export function getRedirectUri(req: Request | any, provider: string): string {
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/connected-accounts/callback/${provider}`;
  
  console.log(`[URL] Resolved appUrl: ${appUrl}, redirectUri: ${redirectUri}, NEXTAUTH_URL: ${process.env.NEXTAUTH_URL}, NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}, host: ${req?.headers?.get?.("host")}`);
  
  return redirectUri;
}

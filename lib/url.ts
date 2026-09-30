/**
 * Get canonical app URL for OAuth redirects and callbacks
 * Prioritizes NEXTAUTH_URL (server canonical) over NEXT_PUBLIC_APP_URL
 * Falls back to request origin for ngrok/local dev awareness
 * 
 * Fixes bug where NEXT_PUBLIC_APP_URL=localhost caused Spotify redirect_uri to be localhost
 * even when NEXTAUTH_URL was set to ngrok hostname
 */

export function getAppUrl(req?: Request | { headers: { get: (name: string) => string | null }; nextUrl?: { origin: string } } | any): string {
  // Priority 1: NEXTAUTH_URL - server canonical (set to ngrok for local OAuth testing)
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }

  // Priority 2: Request origin (for ngrok awareness - uses actual host user is accessing)
  if (req) {
    try {
      // Try nextUrl.origin (NextRequest)
      if (req.nextUrl?.origin) {
        return req.nextUrl.origin.replace(/\/$/, "");
      }

      // Try headers: host + x-forwarded-proto
      const host = req.headers?.get?.("host") || req.headers?.get?.("x-forwarded-host");
      const proto = req.headers?.get?.("x-forwarded-proto") || req.headers?.get?.("x-forwarded-protocol") || "https";

      if (host) {
        // If host is localhost, use http, else https
        const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : proto;
        const url = `${protocol}://${host}`.replace(/\/$/, "");
        
        // Only use request host if it's not localhost when NEXTAUTH_URL is set to ngrok?
        // Actually, we already checked NEXTAUTH_URL first, so this is fallback
        // For ngrok, host will be intensely-actual-chipmunk.ngrok-free.app
        return url;
      }

      // Try URL origin from req.url
      if (req.url) {
        const url = new URL(req.url);
        return url.origin.replace(/\/$/, "");
      }
    } catch (err) {
      console.warn("Failed to get app URL from request", err);
    }
  }

  // Priority 3: NEXT_PUBLIC_APP_URL (client accessible, but can be localhost)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  // Priority 4: Vercel URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }

  // Fallback: localhost
  return "http://localhost:3000";
}

export function getRedirectUri(req: Request | any, provider: string): string {
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/connected-accounts/callback/${provider}`;
  
  console.log(`[URL] Resolved appUrl: ${appUrl}, redirectUri: ${redirectUri}, NEXTAUTH_URL: ${process.env.NEXTAUTH_URL}, NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);
  
  return redirectUri;
}

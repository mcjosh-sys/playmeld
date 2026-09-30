import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Music, Link2, Shield, AlertCircle, CheckCircle, Youtube } from "lucide-react";
import { ConnectButton } from "@/components/connections/connect-button";
import { DisconnectButton } from "@/components/connections/disconnect-button";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string; desc?: string; provider?: string; redirectUri?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, session.user.id));

  const spotifyAccounts = accounts.filter((a) => a.provider === "spotify");
  const youtubeAccounts = accounts.filter((a) => a.provider === "youtube_music");

  return (
    <div className="space-y-8">
      <div className="space-y-2 animate-enter">
        <h1 className="hierarchy-1">Connected Accounts</h1>
        <p className="text-muted-foreground leading-relaxed">Link your music platforms to start syncing with BullMQ background jobs. Now supports Spotify + YouTube Music.</p>
      </div>

      {/* Success/Error Messages */}
      {searchParams.success === "connected" && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950 animate-enter">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">Successfully connected!</p>
                <p className="text-sm text-green-700 dark:text-green-300">Your {searchParams.provider || ""} account is now linked and tokens are encrypted at rest.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {searchParams.error && (
        <Card className="border-destructive/50 bg-destructive/10 animate-enter">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" aria-hidden="true" />
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">Connection failed: {searchParams.error}</p>
                {searchParams.desc && <p className="text-xs text-muted-foreground break-words">{searchParams.desc}</p>}
                {searchParams.provider && <p className="text-xs text-muted-foreground">Provider: {searchParams.provider}</p>}
                {searchParams.redirectUri && (
                  <p className="text-xs text-muted-foreground break-all">
                    Redirect URI used: {decodeURIComponent(searchParams.redirectUri)}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-3 space-y-1 border-t pt-3">
                  <p className="font-medium">Common fixes:</p>
                  <p>• Check {searchParams.provider === "youtube_music" ? "YOUTUBE_CLIENT_ID/SECRET or GOOGLE_CLIENT_ID/SECRET" : "SPOTIFY_CLIENT_ID/SECRET"} env vars are set</p>
                  <p>• Verify redirect URIs in provider dashboards match your current URL (ngrok or Vercel)</p>
                  <p className="font-mono text-[11px] bg-muted p-1 rounded break-all">Spotify: https://intensely-actual-chipmunk.ngrok-free.app/api/connected-accounts/callback/spotify</p>
                  <p className="font-mono text-[11px] bg-muted p-1 rounded break-all">YouTube: https://intensely-actual-chipmunk.ngrok-free.app/api/connected-accounts/callback/youtube_music</p>
                  <p>• For local dev, ensure ngrok is running with canonical hostname</p>
                  <p>• Check NEXTAUTH_URL is set to https://intensely-actual-chipmunk.ngrok-free.app (prioritized over NEXT_PUBLIC_APP_URL)</p>
                  <p>• For YouTube: Enable YouTube Data API v3 in Google Cloud Console, add YouTube scopes to OAuth consent screen</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4 animate-enter stagger-1">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{accounts.length}</div>
                <div className="text-xs text-muted-foreground">Connected</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1DB954]/10 flex items-center justify-center">
                <Music className="w-5 h-5 text-[#1DB954]" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{spotifyAccounts.length}</div>
                <div className="text-xs text-muted-foreground">Spotify</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF0000]/10 flex items-center justify-center">
                <Youtube className="w-5 h-5 text-[#FF0000]" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{youtubeAccounts.length}</div>
                <div className="text-xs text-muted-foreground">YouTube Music</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                <Shield className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <div className="text-sm font-medium">Encrypted</div>
                <div className="text-xs text-muted-foreground">AES-256-GCM</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Spotify - Supported */}
        <Card className="animate-enter stagger-2 hover:shadow-glow transition-all duration-300 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1DB954] flex items-center justify-center text-white">
                  <Music className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-base">Spotify</CardTitle>
                  <CardDescription className="text-xs">Connect your Spotify account</CardDescription>
                </div>
              </div>
              <Badge variant={spotifyAccounts.length > 0 ? "success" : "outline"}>
                {spotifyAccounts.length > 0 ? `${spotifyAccounts.length} connected` : "Not connected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {spotifyAccounts.length === 0 ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted/50 border border-dashed text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Music className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No Spotify account connected</p>
                    <p className="text-xs text-muted-foreground mt-1">Connect to start syncing playlists with smart matching (ISRC + metadata)</p>
                  </div>
                  <ConnectButton provider="spotify" label="Connect Spotify" size="default" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {spotifyAccounts.map((acc) => (
                  <div key={acc.id} className="border p-4 rounded-xl space-y-3 hover:bg-accent/30 transition-colors">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center flex-shrink-0">
                          <Music className="w-5 h-5 text-[#1DB954]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate flex items-center gap-2">
                            {acc.displayName || acc.providerAccountId}
                            {acc.isActive && <CheckCircle className="w-4 h-4 text-accent" aria-hidden="true" />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{acc.providerAccountEmail || acc.providerAccountId}</div>
                          <div className="flex gap-2 mt-1">
                            <Badge variant={acc.isActive ? "success" : "secondary"} className="text-[10px]">
                              {acc.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {acc.product && <Badge variant="outline" className="text-[10px]">{acc.product}</Badge>}
                          </div>
                        </div>
                      </div>
                      <DisconnectButton
                        accountId={acc.id}
                        displayName={acc.displayName || acc.providerAccountId}
                        provider={acc.provider}
                        variant="outline"
                        size="sm"
                        className="ml-2 flex-shrink-0"
                      />
                    </div>
                  </div>
                ))}
                <ConnectButton provider="spotify" label="Connect another Spotify account" variant="outline" size="sm" className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* YouTube Music - Newly Supported */}
        <Card className="animate-enter stagger-3 hover:shadow-glow-accent transition-all duration-300 border-[#FF0000]/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FF0000] flex items-center justify-center text-white">
                  <Youtube className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-base">YouTube Music</CardTitle>
                  <CardDescription className="text-xs">Via YouTube Data API v3</CardDescription>
                </div>
              </div>
              <Badge variant={youtubeAccounts.length > 0 ? "success" : "outline"}>
                {youtubeAccounts.length > 0 ? `${youtubeAccounts.length} connected` : "Not connected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {youtubeAccounts.length === 0 ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted/50 border border-dashed text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-[#FF0000]/10 flex items-center justify-center">
                    <Youtube className="w-6 h-6 text-[#FF0000]" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No YouTube account connected</p>
                    <p className="text-xs text-muted-foreground mt-1">Connect YouTube to sync playlists. Uses YouTube Data API - playlists appear in YouTube Music.</p>
                  </div>
                  <ConnectButton provider="youtube_music" label="Connect YouTube" size="default" />
                </div>

                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 space-y-2">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-red-900 dark:text-red-100">YouTube Music setup:</p>
                      <p className="text-red-700 dark:text-red-300">• Enable YouTube Data API v3 in Google Cloud Console</p>
                      <p className="text-red-700 dark:text-red-300">• Add YouTube scopes to OAuth consent screen: youtube, youtube.readonly</p>
                      <p className="text-red-700 dark:text-red-300">• Redirect URI:</p>
                      <p className="font-mono text-[11px] bg-white/50 dark:bg-black/20 p-1 rounded break-all">https://intensely-actual-chipmunk.ngrok-free.app/api/connected-accounts/callback/youtube_music</p>
                      <p className="text-red-700 dark:text-red-300 mt-1">• Env: YOUTUBE_CLIENT_ID/SECRET or uses GOOGLE_CLIENT_ID/SECRET fallback</p>
                      <p className="text-red-700 dark:text-red-300">• Quota: 10k units/day default, 1 insert = 50 units, search = 100 units</p>
                      <p className="text-red-700 dark:text-red-300">• Note: Search returns videos, not ISRC - confidence lower, no ISRC matching</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {youtubeAccounts.map((acc) => (
                  <div key={acc.id} className="border p-4 rounded-xl space-y-3 hover:bg-accent/30 transition-colors">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
                          <Youtube className="w-5 h-5 text-[#FF0000]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate flex items-center gap-2">
                            {acc.displayName || acc.providerAccountId}
                            {acc.isActive && <CheckCircle className="w-4 h-4 text-accent" aria-hidden="true" />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{acc.providerAccountEmail || acc.providerAccountId}</div>
                          <div className="flex gap-2 mt-1">
                            <Badge variant={acc.isActive ? "success" : "secondary"} className="text-[10px]">
                              {acc.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">YouTube</Badge>
                          </div>
                        </div>
                      </div>
                      <DisconnectButton
                        accountId={acc.id}
                        displayName={acc.displayName || acc.providerAccountId}
                        provider={acc.provider}
                        variant="outline"
                        size="sm"
                        className="ml-2 flex-shrink-0"
                      />
                    </div>
                  </div>
                ))}
                <ConnectButton provider="youtube_music" label="Connect another YouTube account" variant="outline" size="sm" className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coming soon */}
        {[
          { name: "Apple Music", desc: "MusicKit + JWT - requires Apple Dev Program", icon: Music },
          { name: "Tidal", desc: "Tidal API - requires partnership approval", icon: Music },
          { name: "Deezer", desc: "Deezer API - App ID/Secret needed", icon: Music },
        ].map((provider, idx) => {
          const Icon = provider.icon;
          return (
            <Card key={provider.name} className={`animate-enter stagger-${idx + 4} opacity-75 border-dashed`}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <Icon className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {provider.name}
                      <Badge variant="outline" className="text-[10px]">Soon</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">{provider.desc}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground">Coming soon - architecture supports pluggable providers via MusicProvider interface</p>
                  <Button variant="ghost" size="sm" disabled className="mt-2 opacity-50">
                    Connect {provider.name}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Security */}
      <Card className="animate-enter stagger-5 border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" aria-hidden="true" />
            Security & Privacy
          </CardTitle>
          <CardDescription>How we protect your music provider credentials</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">OAuth tokens AES-256-GCM encrypted at rest with key from env</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">Tokens never appear in logs, URLs, client responses, or analytics</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">YouTube: Google OAuth with youtube scope, refresh_token with offline access + consent prompt</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">Every account access checks ownership: connected_accounts.userId == session.user.id</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">YouTube quota handling: 403 quotaExceeded throws RateLimitError retryable to BullMQ</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">Pagination: Spotify offset, YouTube pageToken, both handle empty/one-page/multi-page/error</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

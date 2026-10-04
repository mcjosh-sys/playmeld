import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Music, Link2, Shield, AlertCircle, CheckCircle, Youtube, XCircle } from "lucide-react";
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
                <div className="text-2xl font-bold tabular-nums">{accounts.filter(a => a.isActive).length}</div>
                <div className="text-xs text-muted-foreground">Active Connected</div>
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
                <div className="text-2xl font-bold tabular-nums">{spotifyAccounts.filter(a => a.isActive).length}</div>
                <div className="text-xs text-muted-foreground">Spotify Active</div>
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
                <div className="text-2xl font-bold tabular-nums">{youtubeAccounts.filter(a => a.isActive).length}</div>
                <div className="text-xs text-muted-foreground">YouTube Active</div>
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
                <div className="text-xs text-muted-foreground">AES-256-GCM at rest</div>
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
              <Badge variant={spotifyAccounts.filter(a => a.isActive).length > 0 ? "success" : "outline"}>
                {spotifyAccounts.filter(a => a.isActive).length > 0 ? `${spotifyAccounts.filter(a => a.isActive).length} active` : "Not connected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {spotifyAccounts.filter(a => a.isActive).length === 0 ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted/50 border border-dashed text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Music className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No active Spotify account</p>
                    <p className="text-xs text-muted-foreground mt-1">Connect to start syncing playlists with smart matching (ISRC + metadata)</p>
                  </div>
                  <ConnectButton provider="spotify" label="Connect Spotify" size="default" />
                </div>
                {spotifyAccounts.filter(a => !a.isActive).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Inactive/Disconnected accounts:</p>
                    {spotifyAccounts.filter(a => !a.isActive).map((acc) => (
                      <div key={acc.id} className="border border-dashed p-3 rounded-xl flex justify-between items-center bg-muted/20">
                        <div className="flex gap-2 min-w-0 flex-1">
                          <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{acc.displayName || acc.providerAccountId}</div>
                            <div className="text-xs text-muted-foreground">Disconnected • Tokens cleared • {acc.providerAccountEmail || ""}</div>
                            <Badge variant="secondary" className="text-[10px] mt-1">Inactive</Badge>
                          </div>
                        </div>
                        <ConnectButton provider="spotify" label="Reconnect" variant="outline" size="sm" className="ml-2" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {spotifyAccounts.filter(a => a.isActive).map((acc) => (
                  <div key={acc.id} className="border p-4 rounded-xl space-y-3 hover:bg-accent/30 transition-colors">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center flex-shrink-0">
                          <Music className="w-5 h-5 text-[#1DB954]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate flex items-center gap-2">
                            {acc.displayName || acc.providerAccountId}
                            <CheckCircle className="w-4 h-4 text-accent" aria-hidden="true" />
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{acc.providerAccountEmail || acc.providerAccountId}</div>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="success" className="text-[10px]">Active</Badge>
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
                {spotifyAccounts.filter(a => !a.isActive).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show {spotifyAccounts.filter(a => !a.isActive).length} inactive account(s)</summary>
                    <div className="mt-2 space-y-2">
                      {spotifyAccounts.filter(a => !a.isActive).map((acc) => (
                        <div key={acc.id} className="border border-dashed p-3 rounded-xl flex justify-between items-center bg-muted/20">
                          <div className="flex gap-2">
                            <XCircle className="w-4 h-4 text-muted-foreground mt-1" aria-hidden="true" />
                            <div>
                              <div className="font-medium text-sm">{acc.displayName || acc.providerAccountId}</div>
                              <div className="text-xs text-muted-foreground">Inactive • Tokens cleared</div>
                            </div>
                          </div>
                          <ConnectButton provider="spotify" label="Reconnect" variant="outline" size="sm" />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <ConnectButton provider="spotify" label="Connect another Spotify account" variant="outline" size="sm" className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* YouTube Music */}
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
              <Badge variant={youtubeAccounts.filter(a => a.isActive).length > 0 ? "success" : "outline"}>
                {youtubeAccounts.filter(a => a.isActive).length > 0 ? `${youtubeAccounts.filter(a => a.isActive).length} active` : "Not connected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {youtubeAccounts.filter(a => a.isActive).length === 0 ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted/50 border border-dashed text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-[#FF0000]/10 flex items-center justify-center">
                    <Youtube className="w-6 h-6 text-[#FF0000]" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No active YouTube account</p>
                    <p className="text-xs text-muted-foreground mt-1">Connect YouTube to sync playlists. Playlists appear in YouTube Music.</p>
                  </div>
                  <ConnectButton provider="youtube_music" label="Connect YouTube" size="default" />
                </div>
                {youtubeAccounts.filter(a => !a.isActive).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Inactive accounts:</p>
                    {youtubeAccounts.filter(a => !a.isActive).map((acc) => (
                      <div key={acc.id} className="border border-dashed p-3 rounded-xl flex justify-between items-center bg-muted/20">
                        <div className="flex gap-2">
                          <XCircle className="w-4 h-4 text-muted-foreground mt-1" aria-hidden="true" />
                          <div>
                            <div className="font-medium text-sm">{acc.displayName || acc.providerAccountId}</div>
                            <div className="text-xs text-muted-foreground">Inactive • Tokens cleared</div>
                          </div>
                        </div>
                        <ConnectButton provider="youtube_music" label="Reconnect" variant="outline" size="sm" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {youtubeAccounts.filter(a => a.isActive).map((acc) => (
                  <div key={acc.id} className="border p-4 rounded-xl space-y-3 hover:bg-accent/30 transition-colors">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
                          <Youtube className="w-5 h-5 text-[#FF0000]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate flex items-center gap-2">
                            {acc.displayName || acc.providerAccountId}
                            <CheckCircle className="w-4 h-4 text-accent" aria-hidden="true" />
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{acc.providerAccountEmail || acc.providerAccountId}</div>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="success" className="text-[10px]">Active</Badge>
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
                {youtubeAccounts.filter(a => !a.isActive).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Show {youtubeAccounts.filter(a => !a.isActive).length} inactive</summary>
                    <div className="mt-2 space-y-2">
                      {youtubeAccounts.filter(a => !a.isActive).map((acc) => (
                        <div key={acc.id} className="border border-dashed p-3 rounded-xl flex justify-between items-center bg-muted/20">
                          <div className="flex gap-2">
                            <XCircle className="w-4 h-4 text-muted-foreground mt-1" aria-hidden="true" />
                            <div>
                              <div className="font-medium text-sm">{acc.displayName || acc.providerAccountId}</div>
                              <div className="text-xs text-muted-foreground">Inactive</div>
                            </div>
                          </div>
                          <ConnectButton provider="youtube_music" label="Reconnect" variant="outline" size="sm" />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
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
              <span className="text-xs">Disconnect marks inactive and clears tokens (DISCONNECTED), preserves history, no background bleed via modal</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">Inactive accounts show Reconnect button, not Disconnect - fixed UI</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

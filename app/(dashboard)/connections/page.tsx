import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Music, Link2, Shield, AlertCircle, CheckCircle } from "lucide-react";
import { ConnectButton } from "@/components/connections/connect-button";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string; desc?: string; provider?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, session.user.id));

  const spotifyAccounts = accounts.filter((a) => a.provider === "spotify");

  return (
    <div className="space-y-8">
      <div className="space-y-2 animate-enter">
        <h1 className="hierarchy-1">Connected Accounts</h1>
        <p className="text-muted-foreground leading-relaxed">Link your music platforms to start syncing with BullMQ background jobs</p>
      </div>

      {/* Success/Error Messages */}
      {searchParams.success === "connected" && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950 animate-enter">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">Successfully connected!</p>
                <p className="text-sm text-green-700 dark:text-green-300">Your account is now linked and tokens are encrypted at rest.</p>
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
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Connection failed: {searchParams.error}</p>
                {searchParams.desc && <p className="text-xs text-muted-foreground">{searchParams.desc}</p>}
                {searchParams.provider && <p className="text-xs text-muted-foreground">Provider: {searchParams.provider}</p>}
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  <p>Common fixes:</p>
                  <p>• Check SPOTIFY_CLIENT_ID/SECRET env vars are set</p>
                  <p>• Verify redirect URI in Spotify Dashboard matches: https://intensely-actual-chipmunk.ngrok-free.app/api/connected-accounts/callback/spotify</p>
                  <p>• For local dev, ensure ngrok is running with canonical hostname</p>
                  <p>• Check NEXT_PUBLIC_APP_URL and NEXTAUTH_URL match your current URL</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 animate-enter stagger-1">
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
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Music className="w-5 h-5 text-accent" aria-hidden="true" />
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
                    <p className="text-xs text-muted-foreground mt-1">Connect to start syncing playlists with smart matching</p>
                  </div>
                  <ConnectButton provider="spotify" label="Connect Spotify" size="default" />
                </div>

                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 space-y-2">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-blue-900 dark:text-blue-100">Local dev requires ngrok:</p>
                      <p className="text-blue-700 dark:text-blue-300 font-mono text-[11px]">https://intensely-actual-chipmunk.ngrok-free.app</p>
                      <p className="text-blue-700 dark:text-blue-300">Configure redirect URI in Spotify Dashboard:</p>
                      <p className="font-mono text-[11px] bg-white/50 dark:bg-black/20 p-1 rounded break-all">
                        https://intensely-actual-chipmunk.ngrok-free.app/api/connected-accounts/callback/spotify
                      </p>
                      <p className="text-blue-700 dark:text-blue-300 mt-2">Also add to Google OAuth if using Google login:</p>
                      <p className="font-mono text-[11px] bg-white/50 dark:bg-black/20 p-1 rounded break-all">
                        https://intensely-actual-chipmunk.ngrok-free.app/api/auth/callback/google
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {spotifyAccounts.map((acc) => (
                  <div key={acc.id} className="border p-4 rounded-xl flex justify-between items-center hover:bg-accent/50 transition-colors">
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
                    <Button variant="outline" size="sm" className="ml-2 flex-shrink-0" aria-label={`Disconnect ${acc.displayName || acc.providerAccountId}`}>
                      Disconnect
                    </Button>
                  </div>
                ))}
                <ConnectButton provider="spotify" label="Connect another Spotify account" variant="outline" size="sm" className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coming soon - with disabled state clarity */}
        {[
          { name: "Apple Music", desc: "MusicKit integration planned", icon: Music },
          { name: "YouTube Music", desc: "YouTube Data API planned", icon: Music },
          { name: "Tidal", desc: "Tidal API planned", icon: Music },
        ].map((provider, idx) => {
          const Icon = provider.icon;
          return (
            <Card key={provider.name} className={`animate-enter stagger-${idx + 3} opacity-75 border-dashed`}>
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

      {/* Security - progressive disclosure */}
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
              <span className="text-xs">Refresh tokens stored securely, used server-side only</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">Every account access checks ownership: connected_accounts.userId == session.user.id</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">Disconnect removes tokens from DB immediately</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs">OAuth state validation with userId + timestamp prevents replay - fixed invalid state handling</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

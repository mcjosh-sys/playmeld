import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function ConnectionsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, session.user.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Connected Accounts</h1>
        <p className="text-muted-foreground">Link your music platforms to start syncing</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Spotify</CardTitle>
            <CardDescription>Connect your Spotify account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.filter((a) => a.provider === "spotify").length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground">No Spotify account connected</p>
                <Button>Connect Spotify</Button>
                <p className="text-xs text-muted-foreground">
                  Requires ngrok for local dev: https://intensely-actual-chipmunk.ngrok-free.app
                  <br />
                  Configure redirect URI in Spotify Dashboard to use ngrok hostname + /api/connected-accounts/callback/spotify
                </p>
              </>
            ) : (
              accounts
                .filter((a) => a.provider === "spotify")
                .map((acc) => (
                  <div key={acc.id} className="border p-3 rounded flex justify-between items-center">
                    <div>
                      <div className="font-medium">{acc.displayName || acc.providerAccountId}</div>
                      <div className="text-xs text-muted-foreground">{acc.providerAccountEmail}</div>
                      <Badge variant={acc.isActive ? "default" : "secondary"} className="mt-1">
                        {acc.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm">
                      Disconnect
                    </Button>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle>Apple Music</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Apple Music integration planned</p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle>YouTube Music</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">YouTube Music integration planned</p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle>Tidal</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Tidal integration planned</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• OAuth tokens are encrypted at rest using AES-256-GCM</p>
          <p>• Tokens never appear in logs, URLs, or client responses</p>
          <p>• Refresh tokens are stored securely and used server-side only</p>
          <p>• Disconnecting removes tokens from database</p>
          <p>• Every account access checks ownership: connected_accounts.userId == session.user.id</p>
        </CardContent>
      </Card>
    </div>
  );
}

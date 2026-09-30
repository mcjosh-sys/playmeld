import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PlaylistsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Playlists</h1>
        <p className="text-muted-foreground">Browse playlists from your connected accounts</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Playlist browsing will list playlists from all connected providers via the provider abstraction.
            <br />
            <br />
            Implementation will use:
            <br />- GET /api/playlists?accountId=xxx
            <br />- Provider: listPlaylists with pagination (empty, one-page, multi-page, error on later page)
            <br />- Normalized playlist model
            <br />- Ownership check: account belongs to user
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

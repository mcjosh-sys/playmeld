import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PlaylistBrowser } from "@/components/playlists/playlist-browser";

export default async function PlaylistsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const accounts = await db
    .select({
      id: connectedAccounts.id,
      provider: connectedAccounts.provider,
      providerAccountId: connectedAccounts.providerAccountId,
      displayName: connectedAccounts.displayName,
      avatarUrl: connectedAccounts.avatarUrl,
      isActive: connectedAccounts.isActive,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, session.user.id));

  return (
    <div className="space-y-8">
      <div className="space-y-2 animate-enter">
        <h1 className="hierarchy-1">Playlists</h1>
        <p className="text-muted-foreground leading-relaxed">
          Browse playlists from your connected accounts (Spotify + YouTube Music) via provider abstraction. Pagination handles empty, one-page, multi-page, error on later page. Improved YouTube matching with duration.
        </p>
      </div>

      <div className="animate-enter stagger-1">
        <PlaylistBrowser accounts={accounts as any} />
      </div>
    </div>
  );
}

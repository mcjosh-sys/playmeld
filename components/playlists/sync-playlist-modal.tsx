"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Music, Repeat, CheckCircle, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

interface Account {
  id: string;
  provider: string;
  displayName?: string;
}

interface Playlist {
  providerPlaylistId: string;
  name: string;
  provider: string;
}

interface SyncPlaylistModalProps {
  sourceAccountId: string;
  sourcePlaylist: Playlist;
  accounts: Account[];
  onClose: () => void;
}

export function SyncPlaylistModal({ sourceAccountId, sourcePlaylist, accounts, onClose }: SyncPlaylistModalProps) {
  const [destinationAccountId, setDestinationAccountId] = useState<string>("");
  const [createNewPlaylist, setCreateNewPlaylist] = useState(true);
  const [preserveOrder, setPreserveOrder] = useState(true);
  const [preserveDuplicates, setPreserveDuplicates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any>(null);
  const router = useRouter();

  const destinationAccounts = accounts.filter((a) => a.id !== sourceAccountId);

  const handleSync = async () => {
    if (!destinationAccountId) {
      setError("Select destination account");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sync-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAccountId,
          destinationAccountId,
          sourcePlaylistId: sourcePlaylist.providerPlaylistId,
          createNewPlaylist,
          destinationPlaylistName: sourcePlaylist.name,
          preserveOrder,
          preserveDuplicates,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create sync job");
      }

      setSuccess(data.data);
      // Refresh after short delay and redirect to syncs
      setTimeout(() => {
        router.push("/dashboard/syncs");
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sync job");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <Card className="relative w-full max-w-md shadow-2xl animate-enter max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="w-5 h-5" aria-hidden="true" />
                Sync Playlist
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Transfer {sourcePlaylist.name} from {sourcePlaylist.provider} via BullMQ
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 -mr-2" aria-label="Close">
              <X className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-xl bg-muted/50 border">
            <div className="text-xs text-muted-foreground">Source</div>
            <div className="font-medium text-sm flex items-center gap-2">
              <Music className="w-4 h-4" aria-hidden="true" />
              {sourcePlaylist.name}
            </div>
            <div className="text-xs text-muted-foreground">{sourcePlaylist.providerPlaylistId} • {sourcePlaylist.provider}</div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Destination Account</label>
            {destinationAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other accounts connected. Connect at least 2 accounts.</p>
            ) : (
              <div className="space-y-2">
                {destinationAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setDestinationAccountId(acc.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors focus-ring ${destinationAccountId === acc.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">{acc.displayName?.[0] || acc.provider[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{acc.displayName || acc.provider}</div>
                      <div className="text-xs text-muted-foreground capitalize">{acc.provider.replace("_", " ")}</div>
                    </div>
                    {destinationAccountId === acc.id && <CheckCircle className="w-4 h-4 text-primary" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <label className="text-sm">Create new playlist</label>
              <input type="checkbox" checked={createNewPlaylist} onChange={(e) => setCreateNewPlaylist(e.target.checked)} className="rounded" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm">Preserve order (Starter+)</label>
              <input type="checkbox" checked={preserveOrder} onChange={(e) => setPreserveOrder(e.target.checked)} className="rounded" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm">Preserve duplicates (Pro)</label>
              <input type="checkbox" checked={preserveDuplicates} onChange={(e) => setPreserveDuplicates(e.target.checked)} className="rounded" />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-2 text-xs" role="alert">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" aria-hidden="true" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 flex gap-2 text-xs">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">Sync job created: {success.id}</p>
                <p className="text-green-700 dark:text-green-300">Status: {success.status} • Queued via BullMQ • Redirecting to syncs...</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSync} disabled={loading || !destinationAccountId || destinationAccounts.length === 0} className="flex-1 gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Creating...</> : <><Repeat className="w-4 h-4" aria-hidden="true" /> Start Sync</>}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
              Cancel
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Uses BullMQ with 5 concurrency, 10/sec limiter, exponential backoff. Improved YouTube matching: cleaned titles, duration tolerance 15s, official audio boost, threshold 60.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

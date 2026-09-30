import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs, connectedAccounts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function SyncsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const jobs = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, session.user.id))
    .orderBy(desc(syncJobs.createdAt))
    .limit(20);

  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, session.user.id));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sync Jobs</h1>
          <p className="text-muted-foreground">Transfer playlists between your connected accounts</p>
        </div>
        <Button disabled={accounts.length < 2}>New Sync</Button>
      </div>

      {accounts.length < 2 && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-6">
            <p className="text-sm">You need at least 2 connected accounts to create a sync job. Connect Spotify and another provider.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync jobs yet.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="border rounded p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{job.sourcePlaylistName || job.sourcePlaylistId}</div>
                      <div className="text-xs text-muted-foreground">
                        {job.sourcePlaylistId} → {job.destinationPlaylistName || job.destinationPlaylistId || "New playlist"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Created {new Date(job.createdAt).toLocaleString()}
                        {job.startedAt && ` • Started ${new Date(job.startedAt).toLocaleString()}`}
                        {job.completedAt && ` • Completed ${new Date(job.completedAt).toLocaleString()}`}
                      </div>
                    </div>
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "default"
                          : job.status === "failed"
                          ? "destructive"
                          : job.status === "completed_with_errors"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-2 text-xs">
                    <div>Total: {job.totalTracks ?? 0}</div>
                    <div>Matched: {job.matchedTracks ?? 0}</div>
                    <div>Added: {job.progress ? (job.progress as any).addedTracks ?? 0 : 0}</div>
                    <div>Unmatched: {job.unmatchedTracks ?? 0}</div>
                    <div>Failed: {job.failedTracks ?? 0}</div>
                  </div>
                  {job.errorMessage && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">Error: {job.errorMessage}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Sync Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Read all source tracks (paginated, handles empty, single-page, multi-page)</p>
          <p>2. Normalize tracks (unicode, case, whitespace, featuring, version)</p>
          <p>3. Search destination provider for each track (ISRC priority, then metadata)</p>
          <p>4. Confidence scoring - low-confidence matches marked unmatched, not silently added</p>
          <p>5. Plan: deduplicate if configured, check existing destination for idempotency</p>
          <p>6. Apply: create playlist if needed, add tracks in batches (max 100 for Spotify)</p>
          <p>7. Record per-track results: matched, unmatched, added, skipped, failed</p>
          <p>• Partial failures preserved, not erased</p>
          <p>• Retries safe and idempotent</p>
          <p>• Progress observable: total, processed, matched, unmatched, failed</p>
        </CardContent>
      </Card>
    </div>
  );
}

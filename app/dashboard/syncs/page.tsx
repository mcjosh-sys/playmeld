import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs, connectedAccounts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Music, Repeat, Clock, CheckCircle, AlertTriangle, XCircle, Plus, AlertCircle, BarChart3 } from "lucide-react";
import Link from "next/link";
import { ProcessButton } from "@/components/syncs/process-button";

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

  const canCreate = accounts.length >= 2;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between gap-4 animate-enter">
        <div className="space-y-2">
          <h1 className="hierarchy-1">Sync Jobs</h1>
          <p className="text-muted-foreground leading-relaxed">Transfer playlists between your connected accounts via BullMQ</p>
        </div>
        <div className="flex-shrink-0">
          <Button disabled={!canCreate} size="lg" className="gap-2 min-h-[44px]">
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Sync
          </Button>
        </div>
      </div>

      {!canCreate && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950 animate-enter stagger-1">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Need at least 2 connected accounts</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">You have {accounts.length} connected. Connect Spotify and another provider to create a sync job.</p>
                <Link href="/dashboard/connections">
                  <Button size="sm" variant="outline" className="mt-2 gap-2 border-yellow-600 text-yellow-700 hover:bg-yellow-100">
                    <Music className="w-4 h-4" aria-hidden="true" />
                    Connect Accounts
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue metrics */}
      <Card className="animate-enter stagger-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5" aria-hidden="true" />
            Queue Status - BullMQ + Redis
          </CardTitle>
          <CardDescription>Background job processing with 5 concurrency, 10/sec limiter, exponential backoff</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="p-3 rounded-xl bg-muted/50">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-xl font-bold tabular-nums">{jobs.filter((j) => j.status === "pending").length}</div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950">
            <div className="text-xs text-muted-foreground">Running</div>
            <div className="text-xl font-bold tabular-nums text-blue-600">{jobs.filter((j) => j.status === "running").length}</div>
          </div>
          <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-xl font-bold tabular-nums text-green-600">{jobs.filter((j) => j.status === "completed").length}</div>
          </div>
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950">
            <div className="text-xs text-muted-foreground">Failed</div>
            <div className="text-xl font-bold tabular-nums text-red-600">{jobs.filter((j) => j.status === "failed").length}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-enter stagger-3">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" aria-hidden="true" />
                Recent Jobs
              </CardTitle>
              <CardDescription>Latest transfers with partial failure handling and idempotency</CardDescription>
            </div>
            <Badge variant="outline" className="tabular-nums">{jobs.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <div className="mx-auto w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
                <Repeat className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="font-semibold">No sync jobs yet</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create your first sync to transfer a playlist. We handle pagination (empty, one-page, multi-page), smart matching (ISRC 100% confidence), and partial failures.
                </p>
              </div>
              <Link href="/dashboard/connections">
                <Button size="lg" className="gap-2 mt-4">
                  <Music className="w-4 h-4" aria-hidden="true" />
                  Connect Spotify to Start
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job, idx) => (
                <div
                  key={job.id}
                  className={`border rounded-xl p-4 sm:p-5 hover:bg-accent/30 transition-all duration-200 animate-enter stagger-${Math.min(idx + 1, 5)}`}
                >
                  <div className="flex flex-col sm:flex-row justify-between gap-3">
                    <div className="flex gap-3 min-w-0 flex-1">
                      <div className="hidden sm:flex w-11 h-11 rounded-xl bg-primary/10 items-center justify-center flex-shrink-0">
                        <Music className="w-5 h-5 text-primary" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-medium truncate flex items-center gap-2" title={job.sourcePlaylistName || job.sourcePlaylistId}>
                          {job.sourcePlaylistName || job.sourcePlaylistId}
                          {job.status === "completed" && <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" aria-hidden="true" />}
                          {job.status === "completed_with_errors" && <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" aria-hidden="true" />}
                          {job.status === "failed" && <XCircle className="w-4 h-4 text-destructive flex-shrink-0" aria-hidden="true" />}
                          {job.status === "running" && <Clock className="w-4 h-4 animate-spin text-primary flex-shrink-0" aria-hidden="true" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1 flex-wrap">
                          <span className="truncate">{job.sourcePlaylistId}</span>
                          <span aria-hidden="true">→</span>
                          <span className="truncate">{job.destinationPlaylistName || job.destinationPlaylistId || "New playlist"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:ml-4">
                      <Badge
                        variant={
                          job.status === "completed"
                            ? "success"
                            : job.status === "failed"
                            ? "destructive"
                            : job.status === "completed_with_errors"
                            ? "secondary"
                            : job.status === "running"
                            ? "default"
                            : "outline"
                        }
                        className="capitalize text-xs"
                      >
                        {job.status.replace("_", " ")}
                      </Badge>
                      <div className="text-xs text-muted-foreground sm:text-right">
                        <div className="tabular-nums">{new Date(job.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-3 text-xs p-3 rounded-xl bg-muted/30">
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">Total</div>
                      <div className="font-bold tabular-nums text-sm">{job.totalTracks ?? 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">Matched</div>
                      <div className="font-bold tabular-nums text-sm text-green-600">{job.matchedTracks ?? 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">Added</div>
                      <div className="font-bold tabular-nums text-sm text-primary">{job.progress ? (job.progress as any).addedTracks ?? 0 : 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">Unmatched</div>
                      <div className="font-bold tabular-nums text-sm text-yellow-600">{job.unmatchedTracks ?? 0}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">Failed</div>
                      <div className="font-bold tabular-nums text-sm text-destructive">{job.failedTracks ?? 0}</div>
                    </div>
                  </div>

                  {job.errorMessage && (
                    <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl flex gap-2">
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="break-words">{job.errorMessage}</span>
                    </div>
                  )}

                  {job.progress && (
                    <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      Phase: <span className="font-medium">{(job.progress as any).phase || "unknown"}</span> • Processed {job.processedTracks ?? 0}/{job.totalTracks ?? 0}
                    </div>
                  )}

                  {/* Fix for Pending stuck: Show Process button for pending/failed jobs */}
                  {(job.status === "pending" || job.status === "failed") && (
                    <div className="mt-4 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 flex flex-col sm:flex-row justify-between gap-3">
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-yellow-900 dark:text-yellow-100 flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" aria-hidden="true" />
                          Job stuck in {job.status}? {job.status === "pending" ? "BullMQ worker may not be running" : "Previous attempt failed"}
                        </p>
                        <p className="text-yellow-700 dark:text-yellow-300">
                          {job.status === "pending"
                            ? "BullMQ enqueued but worker not processing. Click Process to run directly via fallback processor, or run npm run worker, or wait for cron fallback (every 5 min processes pending >60s old)."
                            : "Previous run failed. Click Process to retry directly."}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Logs: BullMQ sync queue initialized, Redis connected, Enqueued with BullMQ job id - but stuck Pending means worker not running. Fallback processing now auto-triggers after 3s if still pending.</p>
                      </div>
                      <div className="flex-shrink-0">
                        <ProcessButton jobId={job.id} size="default" variant="default" className="gap-2 shadow-glow" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="animate-enter stagger-5 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">How Sync Works - Resilient by Design</CardTitle>
          <CardDescription>BullMQ powered with partial failure, idempotency, and observability</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-6 text-sm">
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</div>
                Read & Normalize
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 ml-8">
                <li>• Read all source tracks paginated (empty, one-page, multi-page, error on later page)</li>
                <li>• Normalize: unicode NFKD, case folding, whitespace, featuring, version Live/Remix/Acoustic</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs">2</div>
                Match & Plan
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 ml-8">
                <li>• Search dest provider per track (ISRC priority, then metadata)</li>
                <li>• Confidence scoring 70% threshold, low-confidence unmatched not silent</li>
                <li>• Plan: dedup if configured, check existing dest for idempotency</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs">3</div>
                Apply & Record
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 ml-8">
                <li>• Create playlist if needed, add tracks batched max 100 Spotify</li>
                <li>• Record per-track: matched, unmatched, added, skipped, failed with confidence</li>
                <li>• Partial failures preserved, not erased</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">4</div>
                Queue & Retry
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 ml-8">
                <li>• BullMQ: 5 concurrency, 10/sec limiter, exponential backoff 5s/25s/125s</li>
                <li>• Retries only transient (rate limit, network, 5xx), bounded 3 attempts</li>
                <li>• Progress observable: total, processed, matched, unmatched, failed, phase</li>
                <li>• Cancellation defined semantics, usage tracked for billing</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

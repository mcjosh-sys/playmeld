import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts, syncJobs, usageRecords } from "@/db/schema";
import { eq, desc, count, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Music, Link2, Repeat, Clock, CheckCircle, AlertTriangle, XCircle, TrendingUp, Zap } from "lucide-react";
import { PLANS } from "@/lib/billing/plans";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [accountsCount] = await db.select({ count: count() }).from(connectedAccounts).where(eq(connectedAccounts.userId, userId));
  const [jobsCount] = await db.select({ count: count() }).from(syncJobs).where(eq(syncJobs.userId, userId));
  const [usage] = await db
    .select()
    .from(usageRecords)
    .where(and(eq(usageRecords.userId, userId), eq(usageRecords.month, currentMonth)))
    .limit(1);

  const recentJobs = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, userId))
    .orderBy(desc(syncJobs.createdAt))
    .limit(5);

  const accounts = await db.select().from(connectedAccounts).where(eq(connectedAccounts.userId, userId));

  return (
    <div className="space-y-8">
      {/* Header with visual hierarchy */}
      <div className="space-y-2 animate-enter">
        <h1 className="hierarchy-1 whitespace-balance">Dashboard</h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Welcome back, <span className="font-medium text-foreground">{session.user.name || session.user.email}</span> • {currentMonth} usage: {usage?.syncCount || 0} syncs
        </p>
      </div>

      {/* Stats - Executive Dashboard style, data-dense, glassmorphism */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="animate-enter stagger-1 hover:shadow-glow transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" aria-hidden="true" />
              Connected Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold tabular-nums">{accountsCount?.count ?? 0}</div>
            <div className="flex gap-2 flex-wrap">
              {accounts.slice(0, 3).map((acc) => (
                <Badge key={acc.id} variant="secondary" className="text-xs">
                  {acc.provider}
                </Badge>
              ))}
              {accounts.length > 3 && <Badge variant="outline">+{accounts.length - 3}</Badge>}
            </div>
            <Link href="/dashboard/connections" className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-ring rounded">
              Manage connections <TrendingUp className="w-3 h-3" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>

        <Card className="animate-enter stagger-2 hover:shadow-glow-accent transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Repeat className="w-4 h-4 text-accent" aria-hidden="true" />
              Total Syncs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold tabular-nums">{jobsCount?.count ?? 0}</div>
            <div className="text-xs text-muted-foreground">
              This month: <span className="font-medium tabular-nums">{usage?.syncCount || 0}</span> • Free limit 3, Starter 30, Pro ∞
            </div>
            <Link href="/dashboard/syncs" className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-ring rounded">
              View history <Clock className="w-3 h-3" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>

        <Card className="animate-enter stagger-3 bg-primary text-primary-foreground border-primary shadow-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary-foreground">
              <Zap className="w-4 h-4" aria-hidden="true" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/dashboard/connections" className="block">
              <Button variant="secondary" size="default" className="w-full justify-start gap-2 bg-white text-primary hover:bg-white/90">
                <Music className="w-4 h-4" aria-hidden="true" />
                Connect Spotify
              </Button>
            </Link>
            <Link href="/dashboard/syncs" className="block">
              <Button variant="outline" size="default" className="w-full justify-start gap-2 bg-transparent border-white/20 text-primary-foreground hover:bg-white/10">
                <Repeat className="w-4 h-4" aria-hidden="true" />
                New Sync
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Syncs - with empty state, accessible colors, not color alone */}
      <Card className="animate-enter stagger-4">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" aria-hidden="true" />
                Recent Syncs
              </CardTitle>
              <CardDescription>Latest playlist transfers with BullMQ background jobs</CardDescription>
            </div>
            <Link href="/dashboard/syncs">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <Repeat className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h3 className="font-medium">No syncs yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Connect at least 2 music accounts and create your first sync. We&apos;ll handle pagination, matching, retries, and partial failures.
                </p>
              </div>
              <div className="flex gap-2 justify-center pt-2">
                <Link href="/dashboard/connections">
                  <Button size="default">Connect Accounts</Button>
                </Link>
                <Link href="/dashboard/syncs">
                  <Button variant="outline" size="default">Learn How Sync Works</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job, idx) => (
                <div
                  key={job.id}
                  className={`flex justify-between items-center border p-4 rounded-xl hover:bg-accent/50 transition-colors duration-200 animate-enter stagger-${Math.min(idx + 1, 5)}`}
                >
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className="hidden sm:flex w-10 h-10 rounded-xl bg-primary/10 items-center justify-center flex-shrink-0">
                      <Music className="w-5 h-5 text-primary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate" title={job.sourcePlaylistName || job.sourcePlaylistId}>
                        {job.sourcePlaylistName || job.sourcePlaylistId}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          {job.status === "completed" && <CheckCircle className="w-3 h-3 text-accent" aria-hidden="true" />}
                          {job.status === "completed_with_errors" && <AlertTriangle className="w-3 h-3 text-yellow-500" aria-hidden="true" />}
                          {job.status === "failed" && <XCircle className="w-3 h-3 text-destructive" aria-hidden="true" />}
                          {job.status === "running" && <Clock className="w-3 h-3 animate-spin" aria-hidden="true" />}
                          {job.status}
                        </span>
                        <span aria-hidden="true">•</span>
                        <span className="tabular-nums">{job.totalTracks ?? 0} tracks</span>
                        <span aria-hidden="true">•</span>
                        <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <div className="text-sm text-right hidden sm:block">
                      <div className="font-medium tabular-nums">{job.matchedTracks ?? 0}/{job.totalTracks ?? 0} matched</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{job.failedTracks ?? 0} failed</div>
                    </div>
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
                      className="capitalize"
                    >
                      {job.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Architecture - progressive disclosure, not overwhelm upfront */}
      <Card className="animate-enter stagger-5 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">How It Works - Secure & Resilient</CardTitle>
          <CardDescription>BullMQ + Redis + Encrypted tokens + Plan limits enforced server-side</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">1</div>
              <div>
                <div className="font-medium">Provider Abstraction</div>
                <div className="text-muted-foreground text-xs">Spotify adapter behind MusicProvider interface, normalized Track/Playlist models</div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-accent">2</div>
              <div>
                <div className="font-medium">BullMQ Background Jobs</div>
                <div className="text-muted-foreground text-xs">5 concurrency, 10/sec limiter, exponential backoff 5s/25s/125s, idempotent</div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-xs font-bold">3</div>
              <div>
                <div className="font-medium">Smart Matching</div>
                <div className="text-muted-foreground text-xs">ISRC 100% confidence, metadata 95%, threshold 70%, never silent low-confidence</div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">4</div>
              <div>
                <div className="font-medium">Security First</div>
                <div className="text-muted-foreground text-xs">Tokens AES-256-GCM encrypted at rest, ownership checks, no secrets in logs</div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-accent">5</div>
              <div>
                <div className="font-medium">Competitive Pricing</div>
                <div className="text-muted-foreground text-xs">Free 2 accounts 3 syncs, Starter ₦1.5k 4 accounts 30 syncs, Pro ₦3.5k unlimited, yearly 28-33% off</div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-xs font-bold">6</div>
              <div>
                <div className="font-medium">Vercel + Docker Ready</div>
                <div className="text-muted-foreground text-xs">Deployed on Vercel with cron fallback, docker-compose with Postgres+Redis+App+Worker</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

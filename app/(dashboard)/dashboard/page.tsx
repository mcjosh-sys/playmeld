import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts, syncJobs } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [accounts] = await db.select({ count: count() }).from(connectedAccounts).where(eq(connectedAccounts.userId, userId));
  const [jobs] = await db.select({ count: count() }).from(syncJobs).where(eq(syncJobs.userId, userId));
  const recentJobs = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, userId))
    .orderBy(desc(syncJobs.createdAt))
    .limit(5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {session.user.name || session.user.email}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts?.count ?? 0}</div>
            <Link href="/dashboard/connections" className="text-sm text-primary underline">
              Manage connections
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Syncs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobs?.count ?? 0}</div>
            <Link href="/dashboard/syncs" className="text-sm text-primary underline">
              View history
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/dashboard/connections">
              <Button size="sm" className="w-full">Connect Spotify</Button>
            </Link>
            <Link href="/dashboard/syncs">
              <Button size="sm" variant="outline" className="w-full">New Sync</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Syncs</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No syncs yet. Create your first sync to get started.</p>
          ) : (
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex justify-between items-center border p-3 rounded">
                  <div>
                    <div className="font-medium">{job.sourcePlaylistName || job.sourcePlaylistId}</div>
                    <div className="text-sm text-muted-foreground">
                      {job.status} • {job.totalTracks ?? 0} tracks • {new Date(job.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-sm">
                    {job.matchedTracks}/{job.totalTracks} matched
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Architecture Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Provider abstraction: Spotify adapter behind MusicProvider interface</p>
          <p>• Sync engine: async jobs, partial failure, idempotent retries</p>
          <p>• Security: tokens encrypted at rest, ownership checks on every resource</p>
          <p>• Billing: Paystack integration with webhook signature verification</p>
          <p>• ngrok: Use https://intensely-actual-chipmunk.ngrok-free.app for local OAuth callbacks</p>
        </CardContent>
      </Card>
    </div>
  );
}

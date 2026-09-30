import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces, usageRecords, plans } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLANS_USD } from "@/lib/billing/plans";
import Link from "next/link";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, session.user.id))
    .limit(1);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [usage] = await db
    .select()
    .from(usageRecords)
    .where(and(eq(usageRecords.userId, session.user.id), eq(usageRecords.month, currentMonth)))
    .limit(1);

  const allPlans = await db.select().from(plans).where(eq(plans.isActive, true));

  const currentPlanId = workspace?.plan || "free";
  const currentPlan = PLANS[currentPlanId as keyof typeof PLANS] || PLANS.free;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account, billing, and usage</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Email: {session.user.email}</div>
          <div>Name: {session.user.name || "Not set"}</div>
          <div>User ID: {session.user.id}</div>
          <div>Workspace: {workspace?.name || "Not created yet"} ({workspace?.slug || "—"})</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Plan & Usage</CardTitle>
          <CardDescription>Paystack integration with competitive pricing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">Current Plan:</span>
            <Badge variant={currentPlanId === "free" ? "secondary" : "default"}>{currentPlan.name}</Badge>
            <span className="text-sm text-muted-foreground">
              {currentPlan.pricing.monthly.display}/mo • {PLANS_USD[currentPlanId as keyof typeof PLANS_USD]?.monthly || "$0"}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="border p-3 rounded">
              <div className="font-medium">Monthly Syncs</div>
              <div className="text-2xl font-bold">
                {usage?.syncCount || 0} / {currentPlan.limits.maxSyncsPerMonth === -1 ? "∞" : currentPlan.limits.maxSyncsPerMonth}
              </div>
              <div className="text-xs text-muted-foreground">Resets monthly • {currentMonth}</div>
            </div>
            <div className="border p-3 rounded">
              <div className="font-medium">Connected Accounts</div>
              <div className="text-2xl font-bold">
                {currentPlan.limits.maxConnectedAccounts === -1 ? "∞" : currentPlan.limits.maxConnectedAccounts} max
              </div>
              <div className="text-xs text-muted-foreground">
                {currentPlan.limits.canAutoSync ? `Auto-sync every ${currentPlan.limits.autoSyncIntervalHours}h` : "Manual only"}
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1 border-t pt-4">
            <p className="font-medium text-foreground">Plan Limits (enforced server-side):</p>
            <p>• Max accounts: {currentPlan.limits.maxConnectedAccounts === -1 ? "Unlimited" : currentPlan.limits.maxConnectedAccounts}</p>
            <p>• Max syncs/month: {currentPlan.limits.maxSyncsPerMonth === -1 ? "Unlimited" : currentPlan.limits.maxSyncsPerMonth}</p>
            <p>• Max tracks/sync: {currentPlan.limits.maxTracksPerSync === -1 ? "Unlimited" : currentPlan.limits.maxTracksPerSync}</p>
            <p>• Preserve order: {currentPlan.limits.canPreserveOrder ? "Yes" : "No (Starter+)"}</p>
            <p>• Preserve duplicates: {currentPlan.limits.canPreserveDuplicates ? "Yes" : "No (Pro)"}</p>
            <p>• Advanced matching: {currentPlan.limits.canUseAdvancedMatching ? "Yes" : "Basic only"}</p>
            <p>• Auto-sync: {currentPlan.limits.canAutoSync ? `Yes every ${currentPlan.limits.autoSyncIntervalHours}h` : "No"}</p>
          </div>

          <div className="text-sm text-muted-foreground space-y-1 border-t pt-4">
            <p className="font-medium text-foreground">Paystack:</p>
            <p>• Public key: {process.env.PAYSTACK_PUBLIC_KEY ? "configured" : "missing"}</p>
            <p>• Secret key: server-side only, never exposed</p>
            <p>• Webhook HMAC SHA512 verification</p>
            <p>• Idempotent via paystack_events</p>
            <p>• Plans in DB: {allPlans.length} active</p>
          </div>

          <div className="flex gap-2">
            <Button>Upgrade Plan</Button>
            <Link href="/#pricing">
              <Button variant="outline">View Pricing</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Plans - Competitive Pricing</CardTitle>
          <CardDescription>Cheaper than Soundiiz ($4.5/mo) and TuneMyMusic ($4.5/mo)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {Object.values(PLANS).map((plan) => (
              <div key={plan.id} className={`border rounded p-4 ${plan.popular ? "border-primary" : ""}`}>
                {plan.popular && <Badge className="mb-2">Popular</Badge>}
                <div className="font-bold">{plan.name}</div>
                <div className="text-sm text-muted-foreground">{plan.description}</div>
                <div className="mt-2">
                  <div className="font-bold">{plan.pricing.monthly.display}/mo</div>
                  <div className="text-xs text-muted-foreground">
                    {PLANS_USD[plan.id as keyof typeof PLANS_USD].monthly} • {plan.pricing.yearly.display}/year {plan.pricing.yearly.discountPercent > 0 ? `(${plan.pricing.yearly.discountPercent}% off)` : ""}
                  </div>
                </div>
                <ul className="text-xs mt-3 space-y-1">
                  {plan.features.slice(0, 5).map((f, i) => (
                    <li key={i}>✓ {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security & Infrastructure</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• Server-side identity authoritative (session.user.id)</p>
          <p>• Ownership checks on every resource</p>
          <p>• Tokens AES-256-GCM encrypted at rest</p>
          <p>• No tokens in logs, URLs, errors</p>
          <p>• OAuth state validation + timestamp</p>
          <p>• Webhook HMAC verification + idempotency</p>
          <p>• Billing limits enforced server-side via BullMQ worker</p>
          <p>• BullMQ: Redis, 5 concurrency, 10/sec limiter, exponential backoff</p>
          <p>• Vercel: cron fallback every 5 min, dynamic containerizable via Docker</p>
          <p>• Dockerfile multi-stage (app + worker), docker-compose with Postgres + Redis</p>
        </CardContent>
      </Card>
    </div>
  );
}

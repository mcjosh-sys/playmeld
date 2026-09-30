import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces, usageRecords, plans } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLANS_USD } from "@/lib/billing/plans";
import Link from "next/link";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { CheckCircle, AlertCircle, Crown, CreditCard } from "lucide-react";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { paystack?: string; plan?: string; interval?: string; reference?: string; trxref?: string };
}) {
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

  const isPaystackCallback = searchParams.paystack === "callback";
  const paystackReference = searchParams.reference || searchParams.trxref;

  return (
    <div className="space-y-8">
      <div className="space-y-2 animate-enter">
        <h1 className="hierarchy-1">Settings</h1>
        <p className="text-muted-foreground leading-relaxed">Manage your account, billing, and usage. Upgrade plans via Paystack with competitive pricing.</p>
      </div>

      {/* Paystack Callback Handling */}
      {isPaystackCallback && (
        <Card className="border-blue-500/50 bg-blue-50 dark:bg-blue-950 animate-enter">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" aria-hidden="true" />
              <div className="space-y-2 flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Paystack callback received</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">Plan: {searchParams.plan} • Interval: {searchParams.interval} • Reference: {paystackReference}</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">Verifying transaction... If successful, your plan will be upgraded via webhook and DB update.</p>
                {paystackReference && (
                  <div className="pt-2">
                    <Link href={`/api/billing/paystack/verify?reference=${encodeURIComponent(paystackReference)}`} target="_blank">
                      <Button size="sm" variant="outline" className="gap-2 border-blue-600 text-blue-700">
                        Verify Transaction {paystackReference.slice(0, 20)}...
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="animate-enter stagger-1">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription className="text-xs">Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Email:</span> <span className="font-medium">{session.user.email}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Name:</span> <span>{session.user.name || "Not set"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">User ID:</span> <span className="font-mono text-xs">{session.user.id.slice(0, 12)}...</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Workspace:</span> <span>{workspace?.name || "Not created yet"} ({workspace?.slug || "—"})</span></div>
        </CardContent>
      </Card>

      <Card className="animate-enter stagger-2 border-primary/20">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" aria-hidden="true" />
                Current Plan & Usage
              </CardTitle>
              <CardDescription className="text-xs">Paystack integration with competitive pricing, server-side enforcement via BullMQ worker</CardDescription>
            </div>
            <Badge variant={currentPlanId === "free" ? "secondary" : "default"} className="capitalize">{currentPlan.name}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shadow-glow">
              {currentPlan.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold flex items-center gap-2">
                {currentPlan.name}
                {currentPlan.popular && <Badge variant="success" className="text-[10px]">Popular</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentPlan.pricing.monthly.display}/mo • {PLANS_USD[currentPlanId as keyof typeof PLANS_USD]?.monthly || "$0"} • {currentPlan.description}
              </div>
              {workspace?.subscriptionStatus && (
                <div className="flex gap-2 mt-1">
                  <Badge variant={workspace.subscriptionStatus === "active" ? "success" : "secondary"} className="text-[10px] capitalize">{workspace.subscriptionStatus}</Badge>
                  {workspace.subscriptionCurrentPeriodEnd && <span className="text-[11px] text-muted-foreground">Renews {new Date(workspace.subscriptionCurrentPeriodEnd).toLocaleDateString()}</span>}
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border p-4 rounded-xl space-y-2 hover:shadow-md transition-shadow">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Syncs</div>
              <div className="text-3xl font-bold tabular-nums">
                {usage?.syncCount || 0} / <span className="text-muted-foreground">{currentPlan.limits.maxSyncsPerMonth === -1 ? "∞" : currentPlan.limits.maxSyncsPerMonth}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${currentPlan.limits.maxSyncsPerMonth === -1 ? 20 : Math.min(100, ((usage?.syncCount || 0) / currentPlan.limits.maxSyncsPerMonth) * 100)}%`,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground">Resets monthly • {currentMonth} • {currentPlan.limits.maxSyncsPerMonth === -1 ? "Unlimited" : `${currentPlan.limits.maxSyncsPerMonth - (usage?.syncCount || 0)} left`}</div>
            </div>
            <div className="border p-4 rounded-xl space-y-2 hover:shadow-md transition-shadow">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Connected Accounts</div>
              <div className="text-3xl font-bold tabular-nums">
                {currentPlan.limits.maxConnectedAccounts === -1 ? "∞" : currentPlan.limits.maxConnectedAccounts} <span className="text-muted-foreground text-lg">max</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {currentPlan.limits.canAutoSync ? `Auto-sync every ${currentPlan.limits.autoSyncIntervalHours}h • ${currentPlan.limits.canPreserveOrder ? "Preserve order" : ""} ${currentPlan.limits.canPreserveDuplicates ? "• Duplicates" : ""}` : "Manual sync only"}
              </div>
              <div className="flex gap-1 flex-wrap">
                {currentPlan.limits.canUseAdvancedMatching && <Badge variant="success" className="text-[10px]">Advanced Matching</Badge>}
                {currentPlan.limits.canAutoSync && <Badge variant="secondary" className="text-[10px]">Auto-sync</Badge>}
                {currentPlan.limits.hasPrioritySupport && <Badge variant="outline" className="text-[10px]">Priority Support</Badge>}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2 p-3 rounded-xl bg-muted/30">
              <p className="font-medium text-foreground text-sm">Plan Limits (server-side enforced):</p>
              <p>• Accounts: {currentPlan.limits.maxConnectedAccounts === -1 ? "Unlimited" : currentPlan.limits.maxConnectedAccounts}</p>
              <p>• Syncs/month: {currentPlan.limits.maxSyncsPerMonth === -1 ? "Unlimited" : currentPlan.limits.maxSyncsPerMonth}</p>
              <p>• Tracks/sync: {currentPlan.limits.maxTracksPerSync === -1 ? "Unlimited" : currentPlan.limits.maxTracksPerSync}</p>
              <p>• Playlists bulk: {currentPlan.limits.maxPlaylistsPerSync === -1 ? "Unlimited" : currentPlan.limits.maxPlaylistsPerSync}</p>
              <p>• Preserve order: {currentPlan.limits.canPreserveOrder ? "Yes" : "No (Starter+)"}</p>
              <p>• Preserve duplicates: {currentPlan.limits.canPreserveDuplicates ? "Yes" : "No (Pro)"}</p>
              <p>• Advanced matching: {currentPlan.limits.canUseAdvancedMatching ? "Yes (ISRC + metadata, YouTube duration)" : "Basic only"}</p>
              <p>• Auto-sync: {currentPlan.limits.canAutoSync ? `Yes every ${currentPlan.limits.autoSyncIntervalHours}h` : "No (manual only)"}</p>
            </div>
            <div className="space-y-2 p-3 rounded-xl bg-muted/30">
              <p className="font-medium text-foreground text-sm">Paystack & Billing:</p>
              <p>• Public key: {process.env.PAYSTACK_PUBLIC_KEY ? "configured" : "missing"} • {process.env.PAYSTACK_PUBLIC_KEY?.slice(0, 15)}...</p>
              <p>• Secret key: server-side only, never exposed to client</p>
              <p>• Webhook HMAC SHA512 verification + idempotency via paystack_events</p>
              <p>• Plans in DB: {allPlans.length} active (free, starter, pro, enterprise)</p>
              <p>• Current workspace plan: {workspace?.plan || "free"} • Status: {workspace?.subscriptionStatus || "none"}</p>
              <p>• Customer code: {workspace?.paystackCustomerCode || "none"} • Sub code: {workspace?.paystackSubscriptionCode?.slice(0, 15) || "none"}</p>
              <p>• Pricing: Free ₦0, Starter ₦1.5k/mo ($2.99), Pro ₦3.5k/mo ($6.99) - cheaper than Soundiiz $4.5/mo</p>
              <p>• Yearly 28-33% off, Paystack test card 4242 4242 4242 4242</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <UpgradeButton currentPlanId={currentPlanId} userEmail={session?.user?.email || ""} variant="default" size="lg" label={currentPlanId === "free" ? "Upgrade to Pro" : "Change Plan"} className="gap-2 shadow-glow" />
            <Link href="/#pricing">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">View Pricing</Button>
            </Link>
            <Link href="/dashboard/connections">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto">Manage Connections</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-enter stagger-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5" aria-hidden="true" />
            All Plans - Competitive Pricing
          </CardTitle>
          <CardDescription>Cheaper than Soundiiz ($4.5/mo) and TuneMyMusic ($4.5/mo) • Yearly 28-33% off • Dark mode included • BullMQ powered</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {Object.values(PLANS).map((plan) => (
              <div key={plan.id} className={`border rounded-xl p-4 space-y-3 hover:shadow-md transition-all ${plan.popular ? "border-primary shadow-glow" : ""} ${plan.id === currentPlanId ? "bg-primary/5 border-primary/50" : ""}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      {plan.name}
                      {plan.popular && <Badge className="text-[10px]">Popular</Badge>}
                      {plan.id === currentPlanId && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{plan.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold tabular-nums">{plan.pricing.monthly.display}/mo</div>
                    <div className="text-[11px] text-muted-foreground">{PLANS_USD[plan.id as keyof typeof PLANS_USD].monthly}</div>
                  </div>
                </div>
                <div className="text-xs">
                  <div className="text-muted-foreground">Yearly: {plan.pricing.yearly.display}/year {plan.pricing.yearly.discountPercent > 0 ? `(${plan.pricing.yearly.discountPercent}% off)` : ""}</div>
                </div>
                <ul className="text-xs space-y-1">
                  {plan.features.slice(0, 5).map((f, i) => (
                    <li key={i} className="flex gap-1"><CheckCircle className="w-3 h-3 text-accent mt-0.5 flex-shrink-0" aria-hidden="true" /> {f}</li>
                  ))}
                </ul>
                {plan.id === currentPlanId ? (
                  <Badge variant="secondary" className="w-full justify-center">Current Plan</Badge>
                ) : (
                  <UpgradeButton currentPlanId={currentPlanId} userEmail={session?.user?.email || ""} variant={plan.popular ? "default" : "outline"} size="sm" label={`Upgrade to ${plan.name}`} className="w-full" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="animate-enter stagger-4 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Security & Infrastructure</CardTitle>
          <CardDescription>Multi-tenant SaaS security + BullMQ + Vercel + Docker</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <p>• Server-side identity authoritative (session.user.id)</p>
            <p>• Ownership checks on every resource</p>
            <p>• Tokens AES-256-GCM encrypted at rest</p>
            <p>• No tokens in logs, URLs, errors</p>
            <p>• OAuth state validation + timestamp 10 min</p>
            <p>• Webhook HMAC verification + idempotency</p>
          </div>
          <div className="space-y-1">
            <p>• Billing limits enforced server-side via API + BullMQ worker</p>
            <p>• BullMQ: Redis, 5 concurrency, 10/sec limiter, exponential backoff 5s/25s/125s</p>
            <p>• Usage tracked in usage_records (userId, month YYYY-MM, syncCount)</p>
            <p>• Vercel: cron fallback every 5 min, dynamic containerizable via Docker</p>
            <p>• Dockerfile multi-stage (app runner + worker), docker-compose with Postgres + Redis</p>
            <p>• Dark mode: next-themes system preference, persisted, no hydration mismatch</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

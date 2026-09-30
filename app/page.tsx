import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLANS_USD } from "@/lib/billing/plans";

export default function Home() {
  const freePlan = PLANS.free;
  const starterPlan = PLANS.starter;
  const proPlan = PLANS.pro;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold">
              P
            </div>
            <span className="font-bold text-xl">PlayMeld</span>
            <Badge variant="secondary" className="ml-2">Beta</Badge>
          </div>
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/login">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <Badge variant="outline" className="mb-4">Now supporting Spotify • BullMQ powered</Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl mx-auto">
          Sync playlists across <span className="text-primary">all your music platforms</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Connect Spotify, Apple Music, YouTube Music, Tidal and more. Transfer playlists in seconds, keep them in sync with BullMQ background jobs, never lose your music.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login">
            <Button size="lg">Start Syncing Free</Button>
          </Link>
          <Link href="#features">
            <Button variant="outline" size="lg">Learn More</Button>
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto text-sm">
          <div className="p-4 border rounded-lg">
            <div className="font-semibold">Spotify</div>
            <div className="text-muted-foreground">✓ Supported</div>
          </div>
          <div className="p-4 border rounded-lg opacity-60">
            <div className="font-semibold">Apple Music</div>
            <div className="text-muted-foreground">Coming soon</div>
          </div>
          <div className="p-4 border rounded-lg opacity-60">
            <div className="font-semibold">YouTube Music</div>
            <div className="text-muted-foreground">Coming soon</div>
          </div>
          <div className="p-4 border rounded-lg opacity-60">
            <div className="font-semibold">Tidal</div>
            <div className="text-muted-foreground">Coming soon</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Built for music lovers who use multiple platforms</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Provider Agnostic</CardTitle>
                <CardDescription>Abstracted integrations keep your data portable</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No vendor lock-in. Our provider adapter architecture isolates Spotify, Apple Music and others behind a clean interface. Add new services without rewriting sync logic.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Smart Matching</CardTitle>
                <CardDescription>Confidence-based track matching</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Uses ISRC, title, artist, album and duration to find the right track. Low-confidence matches are marked unmatched rather than silently adding wrong songs. 70% threshold, advanced matching for paid plans.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Resilient Sync with BullMQ</CardTitle>
                <CardDescription>Partial failure, retries, idempotency, background jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  82 matched, 10 unmatched, 5 failed? We show breakdown, not just &quot;failed&quot;. BullMQ with Redis: 5 concurrency, 10/sec limiter, exponential backoff 5s/25s/125s, idempotent retries - no duplicate playlists. Vercel-ready with fallback cron.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Competitive Pricing</CardTitle>
                <CardDescription>Free tier + reasonable NGN pricing</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Free: 2 accounts, 3 syncs/month, 100 tracks. Starter ₦1,500/mo (4 accounts, 30 syncs, unlimited tracks, daily auto-sync). Pro ₦3,500/mo unlimited. Yearly 28-33% off. Paystack powered, server-side enforcement.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Vercel + Docker Ready</CardTitle>
                <CardDescription>Dynamic deployment</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Deployed on Vercel with cron fallback. Containerized via Dockerfile multi-stage (app + worker), docker-compose with Postgres + Redis + App + Worker. Works locally, on Vercel, or self-hosted.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Secure by Design</CardTitle>
                <CardDescription>Multi-tenant SaaS security</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Server-side identity authoritative, ownership checks every resource, tokens AES-256-GCM encrypted at rest, no secrets in logs, OAuth state validation, webhook HMAC verification, billing enforced server-side, IDOR tested.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing - Competitive */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">Simple, competitive pricing</h2>
        <p className="text-center text-muted-foreground mb-2">Pay with Paystack. Cancel anytime. Free tier included.</p>
        <p className="text-center text-sm text-muted-foreground mb-12">Cheaper than Soundiiz ($4.5/mo) and TuneMyMusic ($4.5/mo) - built for Africa with global reach</p>
        
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Free */}
          <Card>
            <CardHeader>
              <CardTitle>{freePlan.name}</CardTitle>
              <CardDescription>{freePlan.description}</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold">{freePlan.pricing.monthly.display}<span className="text-sm font-normal">/month</span></div>
                <div className="text-sm text-muted-foreground">{PLANS_USD.free.monthly} • Forever free</div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {freePlan.features.map((f, i) => (
                  <li key={i}>✓ {f}</li>
                ))}
              </ul>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-6">{freePlan.cta}</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-3 text-center">No credit card required</p>
            </CardContent>
          </Card>

          {/* Starter - Popular */}
          <Card className="border-primary shadow-lg relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle className="mt-2">{starterPlan.name}</CardTitle>
              <CardDescription>{starterPlan.description}</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold">{starterPlan.pricing.monthly.display}<span className="text-sm font-normal">/month</span></div>
                <div className="text-sm text-muted-foreground">{PLANS_USD.starter.monthly} • {starterPlan.pricing.yearly.display}/year ({starterPlan.pricing.yearly.discountPercent}% off)</div>
                <div className="text-xs text-muted-foreground mt-1">Yearly: {starterPlan.pricing.yearly.display} (₦12k)</div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {starterPlan.features.map((f, i) => (
                  <li key={i}>✓ {f}</li>
                ))}
              </ul>
              <Link href="/login">
                <Button className="w-full mt-6">{starterPlan.cta}</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-3 text-center">Paystack • Cancel anytime</p>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card>
            <CardHeader>
              <CardTitle>{proPlan.name}</CardTitle>
              <CardDescription>{proPlan.description}</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold">{proPlan.pricing.monthly.display}<span className="text-sm font-normal">/month</span></div>
                <div className="text-sm text-muted-foreground">{PLANS_USD.pro.monthly} • {proPlan.pricing.yearly.display}/year ({proPlan.pricing.yearly.discountPercent}% off)</div>
                <div className="text-xs text-muted-foreground mt-1">Yearly: {proPlan.pricing.yearly.display} (₦30k)</div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {proPlan.features.slice(0, 8).map((f, i) => (
                  <li key={i}>✓ {f}</li>
                ))}
              </ul>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-6">{proPlan.cta}</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-3 text-center">Paystack • Priority support</p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-12 text-sm text-muted-foreground">
          <p>All plans include: Secure token encryption, BullMQ background jobs, partial failure handling, idempotent retries</p>
          <p className="mt-2">Free tier: 2 accounts so you can actually try syncing between Spotify and another provider</p>
          <p className="mt-2">
            <Link href="/dashboard/settings" className="underline">View billing in dashboard</Link> • 
            Enterprise: ₦15k/month for teams, API access, SLA - <a href="mailto:sales@playmeld.com" className="underline">Contact Sales</a>
          </p>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 PlayMeld. Licensed under AGPL-3.0. Source available.</p>
          <p className="mt-2">
            <a href="https://github.com/mcjosh-sys/playmeld" className="underline">GitHub</a> · 
            Built with Next.js, Drizzle, Neon, Paystack, BullMQ, Redis, ngrok • 
            Deployed on Vercel • Docker ready
          </p>
          <p className="mt-2 text-xs">
            Pricing: Free ₦0, Starter ₦1.5k/mo ($2.99), Pro ₦3.5k/mo ($6.99) - cheaper than Soundiiz/TuneMyMusic • Yearly 28-33% off
          </p>
        </div>
      </footer>
    </div>
  );
}

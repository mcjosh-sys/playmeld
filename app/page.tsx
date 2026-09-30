import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLANS_USD } from "@/lib/billing/plans";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Music } from "lucide-react";

export default function Home() {
  const freePlan = PLANS.free;
  const starterPlan = PLANS.starter;
  const proPlan = PLANS.pro;

  return (
    <div className="min-h-screen">
      {/* Header with theme toggle */}
      <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold shadow-glow">
              <Music className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-bold text-xl" style={{ fontFamily: 'Righteous, sans-serif' }}>PlayMeld</span>
            <Badge variant="secondary" className="ml-2">Beta</Badge>
          </div>
          <div className="flex gap-2 items-center">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" size="default">Login</Button>
            </Link>
            <Link href="/login">
              <Button size="default">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <Badge variant="outline" className="mb-4 animate-enter">Now supporting Spotify • BullMQ powered • Dark mode</Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl mx-auto whitespace-balance animate-enter stagger-1" style={{ fontFamily: 'Righteous, sans-serif' }}>
          Sync playlists across <span className="text-primary">all your music platforms</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed animate-enter stagger-2">
          Connect Spotify, Apple Music, YouTube Music, Tidal and more. Transfer playlists in seconds, keep them in sync with BullMQ background jobs, never lose your music. Now with dark mode.
        </p>
        <div className="flex gap-4 justify-center animate-enter stagger-3">
          <Link href="/login">
            <Button size="lg" className="gap-2 shadow-glow">Start Syncing Free</Button>
          </Link>
          <Link href="#features">
            <Button variant="outline" size="lg">Learn More</Button>
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto text-sm animate-enter stagger-4">
          <div className="p-4 border rounded-xl hover:shadow-md transition-shadow">
            <div className="font-semibold">Spotify</div>
            <div className="text-muted-foreground flex items-center justify-center gap-1">
              <span className="w-2 h-2 bg-accent rounded-full" aria-hidden="true"></span> Supported
            </div>
          </div>
          <div className="p-4 border rounded-xl opacity-60 border-dashed">
            <div className="font-semibold">Apple Music</div>
            <div className="text-muted-foreground">Coming soon</div>
          </div>
          <div className="p-4 border rounded-xl opacity-60 border-dashed">
            <div className="font-semibold">YouTube Music</div>
            <div className="text-muted-foreground">Coming soon</div>
          </div>
          <div className="p-4 border rounded-xl opacity-60 border-dashed">
            <div className="font-semibold">Tidal</div>
            <div className="text-muted-foreground">Coming soon</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4 whitespace-balance" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Built for music lovers who use multiple platforms</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">Provider agnostic, smart matching, resilient sync with BullMQ, competitive pricing, Vercel + Docker ready, secure by design, now with dark mode</p>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="hover:shadow-glow transition-all duration-300">
              <CardHeader>
                <CardTitle>Provider Agnostic</CardTitle>
                <CardDescription>Abstracted integrations keep your data portable</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  No vendor lock-in. Our provider adapter architecture isolates Spotify, Apple Music and others behind a clean interface. Add new services without rewriting sync logic.
                </p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-glow-accent transition-all duration-300">
              <CardHeader>
                <CardTitle>Smart Matching</CardTitle>
                <CardDescription>Confidence-based track matching</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Uses ISRC, title, artist, album and duration to find the right track. Low-confidence matches are marked unmatched rather than silently adding wrong songs. 70% threshold, advanced matching for paid plans.
                </p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <CardTitle>Resilient Sync with BullMQ</CardTitle>
                <CardDescription>Partial failure, retries, idempotency, background jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
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
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Free: 2 accounts, 3 syncs/month, 100 tracks. Starter ₦1,500/mo (4 accounts, 30 syncs, unlimited tracks, daily auto-sync). Pro ₦3,500/mo unlimited. Yearly 28-33% off. Paystack powered, server-side enforcement.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dark Mode + Vercel + Docker</CardTitle>
                <CardDescription>Dynamic deployment with theme support</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Full dark mode with system preference, persisted via next-themes. Deployed on Vercel with cron fallback. Containerized via Dockerfile multi-stage (app + worker), docker-compose with Postgres + Redis + App + Worker. Works locally, on Vercel, or self-hosted.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Secure by Design</CardTitle>
                <CardDescription>Multi-tenant SaaS security</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Server-side identity authoritative, ownership checks every resource, tokens AES-256-GCM encrypted at rest, no secrets in logs, OAuth state validation, webhook HMAC verification, billing enforced server-side, IDOR tested.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing - Competitive */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Simple, competitive pricing</h2>
        <p className="text-center text-muted-foreground mb-2">Pay with Paystack. Cancel anytime. Free tier included. Dark mode included.</p>
        <p className="text-center text-sm text-muted-foreground mb-12">Cheaper than Soundiiz ($4.5/mo) and TuneMyMusic ($4.5/mo) - built for Africa with global reach</p>
        
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Free */}
          <Card className="hover:shadow-md transition-all">
            <CardHeader>
              <CardTitle>{freePlan.name}</CardTitle>
              <CardDescription>{freePlan.description}</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold tabular-nums">{freePlan.pricing.monthly.display}<span className="text-sm font-normal">/month</span></div>
                <div className="text-sm text-muted-foreground">{PLANS_USD.free.monthly} • Forever free</div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {freePlan.features.map((f, i) => (
                  <li key={i} className="flex gap-2"><span className="text-accent">✓</span> {f}</li>
                ))}
              </ul>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-6">{freePlan.cta}</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-3 text-center">No credit card required • Dark mode included</p>
            </CardContent>
          </Card>

          {/* Starter - Popular */}
          <Card className="border-primary shadow-lg relative hover:shadow-glow transition-all">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary shadow-glow">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle className="mt-2">{starterPlan.name}</CardTitle>
              <CardDescription>{starterPlan.description}</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold tabular-nums">{starterPlan.pricing.monthly.display}<span className="text-sm font-normal">/month</span></div>
                <div className="text-sm text-muted-foreground">{PLANS_USD.starter.monthly} • {starterPlan.pricing.yearly.display}/year ({starterPlan.pricing.yearly.discountPercent}% off)</div>
                <div className="text-xs text-muted-foreground mt-1">Yearly: {starterPlan.pricing.yearly.display} (₦12k)</div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {starterPlan.features.map((f, i) => (
                  <li key={i} className="flex gap-2"><span className="text-accent">✓</span> {f}</li>
                ))}
              </ul>
              <Link href="/login">
                <Button className="w-full mt-6 shadow-glow">{starterPlan.cta}</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-3 text-center">Paystack • Cancel anytime • Dark mode</p>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className="hover:shadow-md transition-all">
            <CardHeader>
              <CardTitle>{proPlan.name}</CardTitle>
              <CardDescription>{proPlan.description}</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold tabular-nums">{proPlan.pricing.monthly.display}<span className="text-sm font-normal">/month</span></div>
                <div className="text-sm text-muted-foreground">{PLANS_USD.pro.monthly} • {proPlan.pricing.yearly.display}/year ({proPlan.pricing.yearly.discountPercent}% off)</div>
                <div className="text-xs text-muted-foreground mt-1">Yearly: {proPlan.pricing.yearly.display} (₦30k)</div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {proPlan.features.slice(0, 8).map((f, i) => (
                  <li key={i} className="flex gap-2"><span className="text-accent">✓</span> {f}</li>
                ))}
              </ul>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-6">{proPlan.cta}</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-3 text-center">Paystack • Priority support • Dark mode</p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-12 text-sm text-muted-foreground space-y-1">
          <p>All plans include: Secure token encryption, BullMQ background jobs, partial failure handling, idempotent retries, dark mode</p>
          <p>Free tier: 2 accounts so you can actually try syncing between Spotify and another provider</p>
          <p>
            <Link href="/dashboard/settings" className="underline focus-ring rounded">View billing in dashboard</Link> • 
            Enterprise: ₦15k/month for teams, API access, SLA - <a href="mailto:sales@playmeld.com" className="underline focus-ring rounded">Contact Sales</a>
          </p>
        </div>
      </section>

      <footer className="border-t py-8 bg-muted/20">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 PlayMeld. Licensed under AGPL-3.0. Source available.</p>
          <p className="mt-2">
            <a href="https://github.com/mcjosh-sys/playmeld" className="underline focus-ring rounded">GitHub</a> · 
            Built with Next.js, Drizzle, Neon, Paystack, BullMQ, Redis, ngrok, next-themes • 
            Deployed on Vercel • Docker ready • Dark mode
          </p>
          <p className="mt-2 text-xs">
            Pricing: Free ₦0, Starter ₦1.5k/mo ($2.99), Pro ₦3.5k/mo ($6.99) - cheaper than Soundiiz/TuneMyMusic • Yearly 28-33% off • Dark mode system preference
          </p>
        </div>
      </footer>
    </div>
  );
}

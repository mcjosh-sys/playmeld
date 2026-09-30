import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
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
        <Badge variant="outline" className="mb-4">Now supporting Spotify</Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl mx-auto">
          Sync playlists across <span className="text-primary">all your music platforms</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Connect Spotify, Apple Music, YouTube Music, Tidal and more. Transfer playlists in seconds, keep them in sync, never lose your music.
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
                  Uses ISRC, title, artist, album and duration to find the right track. Low-confidence matches are marked unmatched rather than silently adding wrong songs.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Resilient Sync</CardTitle>
                <CardDescription>Partial failure, retries, idempotency</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  82 matched, 10 unmatched, 5 failed? We show the breakdown, not just &quot;failed&quot;. Retries are safe and idempotent - no duplicate playlists.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">Simple pricing</h2>
        <p className="text-center text-muted-foreground mb-12">Pay with Paystack. Cancel anytime.</p>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <CardDescription>For casual syncing</CardDescription>
              <div className="text-3xl font-bold mt-4">₦0<span className="text-sm font-normal">/month</span></div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                <li>✓ 1 connected account</li>
                <li>✓ 3 syncs per month</li>
                <li>✓ Basic support</li>
              </ul>
              <Button variant="outline" className="w-full mt-6">Get Started</Button>
            </CardContent>
          </Card>
          <Card className="border-primary">
            <CardHeader>
              <Badge className="w-fit">Popular</Badge>
              <CardTitle className="mt-2">Starter</CardTitle>
              <CardDescription>For regular listeners</CardDescription>
              <div className="text-3xl font-bold mt-4">₦2,500<span className="text-sm font-normal">/month</span></div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                <li>✓ 3 connected accounts</li>
                <li>✓ 50 syncs per month</li>
                <li>✓ Preserve order</li>
                <li>✓ Standard support</li>
              </ul>
              <Button className="w-full mt-6">Choose Starter</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pro</CardTitle>
              <CardDescription>For power users</CardDescription>
              <div className="text-3xl font-bold mt-4">₦5,000<span className="text-sm font-normal">/month</span></div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                <li>✓ Unlimited accounts</li>
                <li>✓ Unlimited syncs</li>
                <li>✓ Preserve duplicates</li>
                <li>✓ Advanced matching</li>
                <li>✓ Priority support</li>
              </ul>
              <Button variant="outline" className="w-full mt-6">Choose Pro</Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 PlayMeld. Licensed under AGPL-3.0. Source available.</p>
          <p className="mt-2">
            <a href="https://github.com/mcjosh-sys/playmeld" className="underline">GitHub</a> · Built with Next.js, Drizzle, Neon, Paystack, ngrok
          </p>
        </div>
      </footer>
    </div>
  );
}

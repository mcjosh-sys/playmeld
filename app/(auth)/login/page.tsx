import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Music, Shield, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4 safe-top safe-bottom relative">
      {/* Theme toggle top right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Skip link */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <div className="w-full max-w-md space-y-6 animate-enter">
        {/* Logo with visual hierarchy */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-bold text-xl shadow-glow">
            <Music className="w-7 h-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Righteous, sans-serif' }}>PlayMeld</h1>
          <p className="text-sm text-muted-foreground">Sync playlists across music platforms • Dark mode supported</p>
        </div>

        <Card className="shadow-xl border-0 glass-card dark:bg-card/80">
          <CardHeader className="text-center space-y-2 pb-4">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription className="text-sm leading-relaxed">Sign in to sync your playlists securely with BullMQ background jobs. Respects system theme preference.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <Button type="submit" variant="outline" size="lg" className="w-full justify-center gap-3 h-12">
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
            </form>

            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
            >
              <Button type="submit" variant="outline" size="lg" className="w-full justify-center gap-3 h-12">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Continue with GitHub
              </Button>
            </form>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Secure & Encrypted • Dark Mode</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
                <Shield className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
                <span className="leading-tight">Tokens AES-256-GCM encrypted at rest</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
                <Zap className="w-4 h-4 text-accent flex-shrink-0" aria-hidden="true" />
                <span className="leading-tight">BullMQ background jobs with retries</span>
              </div>
            </div>

            <div id="main-content" className="text-center text-xs text-muted-foreground pt-2 leading-relaxed">
              <p>
                By signing in, you agree to our Terms and Privacy Policy. Your music provider tokens are encrypted and never logged. Server-side identity authoritative. Theme respects system preference.
              </p>
              <Link href="/" className="underline mt-3 inline-block focus-ring rounded px-1">
                Back to home
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © 2026 PlayMeld • AGPL-3.0 • Free tier: 2 accounts, 3 syncs • Starter ₦1.5k/mo • Dark mode
        </p>
      </div>
    </div>
  );
}

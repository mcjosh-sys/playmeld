import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { Music, LayoutDashboard, Link2, ListMusic, Repeat, Settings, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/connections", label: "Connections", icon: Link2 },
    { href: "/dashboard/playlists", label: "Playlists", icon: ListMusic },
    { href: "/dashboard/syncs", label: "Sync Jobs", icon: Repeat },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sidebar - Desktop - Fixed, not scrolling with main */}
      <aside className="w-72 border-r bg-card/80 backdrop-blur-xl p-6 hidden lg:flex flex-col flex-shrink-0 h-screen overflow-y-auto safe-top safe-bottom">
        <div className="flex items-center justify-between gap-3 mb-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold shadow-glow">
              <Music className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <span className="font-bold text-lg" style={{ fontFamily: 'Righteous, sans-serif' }}>PlayMeld</span>
              <div className="text-xs text-muted-foreground">Playlist Sync</div>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <nav className="space-y-2 flex-1 overflow-y-auto" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-all duration-200 focus-ring clickable touch-target justify-start"
                aria-label={`Go to ${item.label}`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-8 border-t space-y-4 flex-shrink-0">
          <div className="px-4 py-3 rounded-xl bg-muted/50">
            <div className="text-sm font-medium truncate" title={session.user.name || session.user.email || ""}>
              {session.user.name || "User"}
            </div>
            <div className="text-xs text-muted-foreground truncate" title={session.user.email || ""}>
              {session.user.email}
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button variant="outline" size="default" className="w-full justify-start gap-3">
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign Out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main - Scrollable independently, sidebar stays fixed */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile header - sticky within main scroll */}
        <header className="lg:hidden border-b bg-card/90 backdrop-blur-xl sticky top-0 z-40 safe-top flex-shrink-0">
          <div className="flex justify-between items-center p-4">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold focus-ring rounded-xl p-2 -m-2" aria-label="Go to dashboard">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
                <Music className="w-4 h-4" aria-hidden="true" />
              </div>
              <span style={{ fontFamily: 'Righteous, sans-serif' }}>PlayMeld</span>
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium" aria-label={`User ${session.user.name || session.user.email}`}>
                {(session.user.name || session.user.email || "U")[0].toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 container-playmeld animate-enter" tabIndex={-1}>
          {children}
          {/* Spacer for mobile bottom nav */}
          <div className="lg:hidden h-24" aria-hidden="true" />
        </main>

        {/* Mobile bottom nav - fixed, not scrolling with content */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t z-50 safe-bottom" aria-label="Mobile navigation">
          <div className="flex justify-around items-center py-2 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-accent text-xs font-medium transition-colors min-w-[60px] min-h-[56px] justify-center focus-ring"
                  aria-label={item.label}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span className="text-[10px] leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/20 p-4 hidden md:block">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold">
            P
          </div>
          <span className="font-bold">PlayMeld</span>
        </div>
        <nav className="space-y-1">
          <Link href="/dashboard" className="block px-3 py-2 rounded hover:bg-accent text-sm">
            Dashboard
          </Link>
          <Link href="/dashboard/connections" className="block px-3 py-2 rounded hover:bg-accent text-sm">
            Connections
          </Link>
          <Link href="/dashboard/playlists" className="block px-3 py-2 rounded hover:bg-accent text-sm">
            Playlists
          </Link>
          <Link href="/dashboard/syncs" className="block px-3 py-2 rounded hover:bg-accent text-sm">
            Sync Jobs
          </Link>
          <Link href="/dashboard/settings" className="block px-3 py-2 rounded hover:bg-accent text-sm">
            Settings
          </Link>
        </nav>

        <div className="mt-8 pt-8 border-t">
          <div className="text-sm">
            <div className="font-medium">{session.user.name || session.user.email}</div>
            <div className="text-muted-foreground text-xs truncate">{session.user.email}</div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
            className="mt-4"
          >
            <Button variant="outline" size="sm" className="w-full">
              Sign Out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1">
        {/* Mobile header */}
        <header className="md:hidden border-b p-4 flex justify-between items-center">
          <Link href="/dashboard" className="font-bold">
            PlayMeld
          </Link>
          <div className="flex gap-2 text-xs">
            <Link href="/dashboard/connections" className="underline">
              Connections
            </Link>
            <Link href="/dashboard/syncs" className="underline">
              Syncs
            </Link>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

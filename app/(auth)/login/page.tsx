import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xl mb-4">
            P
          </div>
          <CardTitle>Welcome to PlayMeld</CardTitle>
          <CardDescription>Sign in to sync your playlists</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              Continue with GitHub
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground pt-4">
            <p>
              By signing in, you agree to our Terms and Privacy Policy. Your music provider tokens are encrypted at rest and never logged.
            </p>
            <Link href="/" className="underline mt-4 inline-block">
              Back to home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

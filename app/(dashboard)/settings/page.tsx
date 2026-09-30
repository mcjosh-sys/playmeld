import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and billing</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Email: {session?.user?.email}</div>
          <div>Name: {session?.user?.name || "Not set"}</div>
          <div>User ID: {session?.user?.id}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Paystack integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">Current Plan:</span>
            <Badge>Free</Badge>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>• Paystack public key: {process.env.PAYSTACK_PUBLIC_KEY ? "configured" : "missing"}</p>
            <p>• Secret key: server-side only, never exposed to client</p>
            <p>• Webhook signature verification via HMAC SHA512</p>
            <p>• Idempotent webhook handling via paystack_events table</p>
          </div>
          <Button>Upgrade to Pro</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• Server-side identity authoritative (session.user.id)</p>
          <p>• Ownership checks on every resource</p>
          <p>• Tokens encrypted at rest (AES-256-GCM)</p>
          <p>• No tokens in logs, URLs, errors, analytics</p>
          <p>• OAuth callback state validation</p>
          <p>• Webhook signature verification</p>
          <p>• Billing limits enforced server-side</p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Loader2 } from "lucide-react";

interface ConnectButtonProps {
  provider: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function ConnectButton({ provider, label, variant = "default", size = "default", className }: ConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Initiate connection via POST to generate secure state
      const res = await fetch("/api/connected-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to initiate connection");
      }

      const { data } = await res.json();

      // Step 2: Redirect to authorization URL (which will then redirect to Spotify)
      // data.authorizationUrl is /api/connected-accounts/[provider]/authorize?state=...
      window.location.href = data.authorizationUrl;
    } catch (err) {
      console.error("Connect error", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleConnect}
        disabled={loading}
        variant={variant}
        size={size}
        className={className}
        aria-label={`Connect ${provider}`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
            Connecting...
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4 mr-2" aria-hidden="true" />
            {label || `Connect ${provider}`}
          </>
        )}
      </Button>
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-xl" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

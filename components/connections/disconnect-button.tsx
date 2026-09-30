"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface DisconnectButtonProps {
  accountId: string;
  displayName?: string;
  provider?: string;
  variant?: "default" | "outline" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function DisconnectButton({
  accountId,
  displayName,
  provider,
  variant = "outline",
  size = "sm",
  className,
}: DisconnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const router = useRouter();

  const handleInitialDisconnect = async () => {
    setLoading(true);
    setError(null);

    try {
      // First call without confirm to check if confirmation needed and get active jobs
      const res = await fetch("/api/connected-accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();

      if (res.status === 409 && data.requiresConfirmation) {
        // Has active jobs, show confirmation with details
        setActiveJobs(data.activeJobs || []);
        setShowConfirm(true);
        setLoading(false);
        return;
      }

      if (res.status === 400 && data.requiresConfirmation) {
        // Requires confirmation
        setShowConfirm(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect");
      }

      // Should not reach here without confirm, but if it does, handle success
      handleSuccess();
    } catch (err) {
      console.error("Disconnect check error", err);
      setError(err instanceof Error ? err.message : "Failed to disconnect");
      setLoading(false);
    }
  };

  const handleConfirmDisconnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/connected-accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, confirm: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect");
      }

      handleSuccess();
    } catch (err) {
      console.error("Disconnect error", err);
      setError(err instanceof Error ? err.message : "Failed to disconnect");
      setLoading(false);
    }
  };

  const handleSuccess = () => {
    setLoading(false);
    setShowConfirm(false);
    // Refresh page to show updated state
    router.refresh();
    // Also reload to ensure server component re-fetches
    window.location.reload();
  };

  if (showConfirm) {
    return (
      <div className="space-y-3 p-4 border border-destructive/50 rounded-xl bg-destructive/5 animate-enter">
        <div className="flex gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" aria-hidden="true" />
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium">Disconnect {displayName || provider || "account"}?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will remove encrypted tokens and mark account inactive. Sync history will be preserved but active jobs using this account will be cancelled.
            </p>
            {activeJobs.length > 0 && (
              <div className="text-xs bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-2 rounded">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">Active jobs: {activeJobs.length}</p>
                <p className="text-yellow-700 dark:text-yellow-300">{activeJobs.map((j) => `${j.id} (${j.status})`).join(", ")}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleConfirmDisconnect}
                disabled={loading}
                variant="destructive"
                size="sm"
                className="gap-2"
                aria-label={`Confirm disconnect ${displayName || provider}`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Yes, Disconnect
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  setActiveJobs([]);
                  setError(null);
                }}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleInitialDisconnect}
        disabled={loading}
        variant={variant}
        size={size}
        className={className}
        aria-label={`Disconnect ${displayName || provider || "account"}`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
            Checking...
          </>
        ) : (
          "Disconnect"
        )}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Trash2, X } from "lucide-react";
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

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showConfirm && !loading) {
        setShowConfirm(false);
        setActiveJobs([]);
        setError(null);
      }
    };

    if (showConfirm) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when modal open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [showConfirm, loading]);

  const handleInitialDisconnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/connected-accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();

      if (res.status === 409 && data.requiresConfirmation) {
        setActiveJobs(data.activeJobs || []);
        setShowConfirm(true);
        setLoading(false);
        return;
      }

      if (res.status === 400 && data.requiresConfirmation) {
        setShowConfirm(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect");
      }

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
    router.refresh();
    window.location.reload();
  };

  return (
    <>
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
        {error && !showConfirm && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Confirmation Modal - fixed overlay, not inline to avoid overlaying connection details */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop - scrim 40-60% black for legibility */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!loading) {
                setShowConfirm(false);
                setActiveJobs([]);
                setError(null);
              }
            }}
            aria-hidden="true"
          />

          {/* Modal content - centered, not overlaying inline details */}
          <div className="relative bg-card border shadow-2xl rounded-2xl w-full max-w-md p-6 space-y-4 animate-enter">
            {/* Header with close */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold text-base leading-tight">Disconnect {displayName || provider || "account"}?</h3>
                  <p className="text-xs text-muted-foreground mt-1">This action cannot be undone</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!loading) {
                    setShowConfirm(false);
                    setActiveJobs([]);
                    setError(null);
                  }
                }}
                disabled={loading}
                aria-label="Close confirmation"
                className="h-8 w-8 -mr-2 flex-shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                This will remove encrypted tokens and mark account inactive. Sync history will be preserved but active jobs using this account will be cancelled.
              </p>

              {activeJobs.length > 0 && (
                <div className="text-xs bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 p-3 rounded-xl">
                  <p className="font-medium text-yellow-800 dark:text-yellow-200 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                    Active jobs: {activeJobs.length} will be cancelled
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-300 mt-1 font-mono text-[11px] break-all">
                    {activeJobs.map((j) => `${j.id} (${j.status})`).join(", ")}
                  </p>
                </div>
              )}

              <div className="p-3 rounded-xl bg-muted/50 border text-xs space-y-1">
                <p className="font-medium">What happens:</p>
                <p>• Encrypted tokens removed from DB</p>
                <p>• Account marked inactive</p>
                <p>• Sync history preserved</p>
                <p>• Active jobs cancelled</p>
                <p>• You can reconnect anytime</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleConfirmDisconnect}
                disabled={loading}
                variant="destructive"
                size="default"
                className="flex-1 gap-2"
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
                size="default"
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

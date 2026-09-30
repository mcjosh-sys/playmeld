"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Play, AlertCircle, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface ProcessButtonProps {
  jobId: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}

export function ProcessButton({ jobId, size = "sm", variant = "outline", className }: ProcessButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const handleProcess = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/sync-jobs/${encodeURIComponent(jobId)}/process`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to process job");
      }

      setSuccess(`Processed: ${data.data.status} - ${data.data.summary ? `${data.data.summary.matched}/${data.data.summary.total} matched` : ""}`);
      
      // Refresh to show updated status
      setTimeout(() => {
        router.refresh();
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error("Process error", err);
      setError(err instanceof Error ? err.message : "Failed to process");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        onClick={handleProcess}
        disabled={loading}
        size={size}
        variant={variant}
        className={`gap-2 ${className || ""}`}
        aria-label={`Process sync job ${jobId}`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Processing...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" aria-hidden="true" />
            Process
          </>
        )}
      </Button>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1" role="alert">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          {error.slice(0, 100)}
        </p>
      )}
      {success && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" aria-hidden="true" />
          {success}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

interface UpgradeButtonProps {
  currentPlanId: string;
  userEmail: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
}

export function UpgradeButton({ currentPlanId, userEmail, variant = "default", size = "default", className, label = "Upgrade Plan" }: UpgradeButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} className={`gap-2 ${className || ""}`} onClick={() => setShowModal(true)} aria-label="Open upgrade plan modal">
        <Crown className="w-4 h-4" aria-hidden="true" />
        {label}
      </Button>

      {showModal && <UpgradeModal currentPlanId={currentPlanId} userEmail={userEmail} onClose={() => setShowModal(false)} />}
    </>
  );
}

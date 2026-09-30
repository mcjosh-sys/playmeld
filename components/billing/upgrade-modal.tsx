"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Check, Zap, Crown, Users, Sparkles } from "lucide-react";
import { PLANS, PLANS_USD, PlanId } from "@/lib/billing/plans";
import { useRouter } from "next/navigation";

interface UpgradeModalProps {
  currentPlanId: string;
  userEmail: string;
  onClose: () => void;
}

export function UpgradeModal({ currentPlanId, userEmail, onClose }: UpgradeModalProps) {
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleUpgrade = async (planId: PlanId) => {
    if (planId === "free") {
      onClose();
      return;
    }

    setSelectedPlanId(planId);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          billingInterval,
          email: userEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to initialize payment");
      }

      // Redirect to Paystack authorization URL
      const authUrl = data.data.authorization_url;
      console.log(`Redirecting to Paystack: ${authUrl} for plan ${planId} ${billingInterval}`);

      window.location.href = authUrl;
    } catch (err) {
      console.error("Upgrade error", err);
      setError(err instanceof Error ? err.message : "Failed to initialize payment");
      setLoading(false);
      setSelectedPlanId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <Card className="shadow-2xl border-0 animate-enter">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Righteous, sans-serif' }}>
                  <Crown className="w-6 h-6 text-primary" aria-hidden="true" />
                  Upgrade Your Plan
                </CardTitle>
                <CardDescription className="mt-2">
                  Choose the perfect plan for your music syncing needs. All plans include dark mode, secure encryption, and BullMQ background jobs. Current: <Badge variant="secondary">{currentPlanId}</Badge>
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close upgrade modal" className="h-8 w-8 -mr-2">
                <X className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Billing Interval Toggle */}
            <div className="flex items-center justify-center gap-4 mt-6 p-1 bg-muted rounded-xl w-fit mx-auto">
              <button
                onClick={() => setBillingInterval("monthly")}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${billingInterval === "monthly" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={billingInterval === "monthly"}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval("yearly")}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${billingInterval === "yearly" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={billingInterval === "yearly"}
              >
                Yearly
                <Badge variant="success" className="text-[10px]">Save 28-33%</Badge>
              </button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
              {Object.values(PLANS).map((plan) => {
                const isCurrent = plan.id === currentPlanId;
                const isSelected = selectedPlanId === plan.id;
                const pricing = billingInterval === "yearly" ? plan.pricing.yearly : plan.pricing.monthly;
                const usdPricing = PLANS_USD[plan.id as PlanId];

                return (
                  <Card
                    key={plan.id}
                    className={`relative transition-all duration-300 hover:shadow-lg ${plan.popular ? "border-primary shadow-glow scale-[1.02]" : ""} ${isCurrent ? "bg-muted/30 border-dashed" : ""} ${isSelected ? "ring-2 ring-primary" : ""}`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary shadow-glow gap-1">
                          <Sparkles className="w-3 h-3" aria-hidden="true" />
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    {isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge variant="secondary">Current Plan</Badge>
                      </div>
                    )}

                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {plan.id === "free" && <Badge variant="secondary" className="w-8 h-8 p-0 flex items-center justify-center rounded-full">F</Badge>}
                        {plan.id === "starter" && <Zap className="w-5 h-5 text-primary" aria-hidden="true" />}
                        {plan.id === "pro" && <Crown className="w-5 h-5 text-primary" aria-hidden="true" />}
                        {plan.id === "enterprise" && <Users className="w-5 h-5 text-primary" aria-hidden="true" />}
                        {plan.name}
                      </CardTitle>
                      <CardDescription className="text-xs">{plan.description}</CardDescription>
                      <div className="mt-4 space-y-1">
                        <div className="text-3xl font-bold tabular-nums">{pricing.display}<span className="text-sm font-normal">/{billingInterval === "yearly" ? "year" : "month"}</span></div>
                        <div className="text-sm text-muted-foreground">
                          {billingInterval === "yearly" ? usdPricing.yearly : usdPricing.monthly} • {billingInterval === "yearly" ? `${pricing.display}/year` : `${pricing.display}/month`}
                        </div>
                        {billingInterval === "yearly" && (pricing as any).discountPercent > 0 && (
                          <Badge variant="success" className="text-[10px]">Save {(pricing as any).discountPercent}% vs monthly</Badge>
                        )}
                        {plan.id === "free" && <div className="text-xs text-muted-foreground">Forever free • No credit card</div>}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <ul className="text-xs space-y-2">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex gap-2">
                            <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <span className="leading-tight">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        onClick={() => handleUpgrade(plan.id as PlanId)}
                        disabled={loading || isCurrent}
                        variant={plan.popular ? "default" : isCurrent ? "secondary" : "outline"}
                        size="default"
                        className={`w-full gap-2 ${plan.popular ? "shadow-glow" : ""}`}
                        aria-label={`Upgrade to ${plan.name} ${billingInterval}`}
                      >
                        {loading && isSelected ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            Redirecting to Paystack...
                          </>
                        ) : isCurrent ? (
                          "Current Plan"
                        ) : (
                          plan.cta
                        )}
                      </Button>

                      {plan.id !== "free" && !isCurrent && (
                        <p className="text-[10px] text-muted-foreground text-center">Paystack • Cancel anytime • Secure • Dark mode included</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="border-t pt-6 space-y-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Why our pricing is competitive:</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <p>• Free tier: 2 accounts so you can actually try syncing (competitors often give 1)</p>
                <p>• Starter ₦1,500/mo ($2.99) cheaper than Soundiiz $4.5/mo and TuneMyMusic $4.5/mo</p>
                <p>• Pro ₦3,500/mo ($6.99) unlimited vs competitors $7.5-10/mo monthly</p>
                <p>• Yearly saves 28-33%: Starter ₦12k/year ($24), Pro ₦30k/year ($60)</p>
                <p>• All plans: AES-256-GCM encryption, BullMQ 5 concurrency 10/sec limiter, partial failure handling, dark mode</p>
                <p>• Server-side enforcement via usage_records, not trusting client</p>
              </div>
              <p className="pt-2">
                Paystack test mode: Use card 4242 4242 4242 4242, any future date, any CVV, any PIN, OTP 123456 to test. Webhook verified via HMAC SHA512.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

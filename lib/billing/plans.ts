/**
 * Competitive pricing model for PlayMeld
 * Based on market research: Soundiiz ($4.5/mo yearly), TuneMyMusic ($4.5/mo), FreeYourMusic ($14.99 one-time)
 * Targeting African market via Paystack (NGN) with competitive USD equivalents
 * Includes free tier for trial, reasonable limits enforced server-side
 */

export type PlanId = "free" | "starter" | "pro" | "enterprise";

export interface PlanLimits {
  maxConnectedAccounts: number; // -1 = unlimited
  maxSyncsPerMonth: number; // -1 = unlimited
  maxTracksPerSync: number; // -1 = unlimited
  maxPlaylistsPerSync: number; // -1 = unlimited, for future bulk sync
  canPreserveOrder: boolean;
  canPreserveDuplicates: boolean;
  canCreatePublicPlaylists: boolean;
  canCreatePrivatePlaylists: boolean;
  canUseAdvancedMatching: boolean;
  canAutoSync: boolean;
  autoSyncIntervalHours: number | null; // null = no auto-sync
  canSyncCollaborativePlaylists: boolean;
  hasPrioritySupport: boolean;
  hasTeamAccess: boolean;
  hasApiAccess: boolean;
}

export interface PlanPricing {
  monthly: {
    amount: number; // in kobo for NGN, cents for USD
    currency: string;
    display: string; // e.g., "₦1,500"
  };
  yearly: {
    amount: number;
    currency: string;
    display: string;
    discountPercent: number;
  };
  paystackPlanCode?: string; // Set after creating in Paystack dashboard/API
  paystackMonthlyPlanCode?: string;
  paystackYearlyPlanCode?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  popular?: boolean;
  limits: PlanLimits;
  pricing: PlanPricing;
  features: string[];
  cta: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    description: "Try PlayMeld with essential features",
    limits: {
      maxConnectedAccounts: 2, // Allow 2 so user can actually sync between 2 providers
      maxSyncsPerMonth: 3,
      maxTracksPerSync: 100,
      maxPlaylistsPerSync: 1,
      canPreserveOrder: false,
      canPreserveDuplicates: false,
      canCreatePublicPlaylists: false,
      canCreatePrivatePlaylists: true,
      canUseAdvancedMatching: false,
      canAutoSync: false,
      autoSyncIntervalHours: null,
      canSyncCollaborativePlaylists: false,
      hasPrioritySupport: false,
      hasTeamAccess: false,
      hasApiAccess: false,
    },
    pricing: {
      monthly: {
        amount: 0,
        currency: "NGN",
        display: "₦0",
      },
      yearly: {
        amount: 0,
        currency: "NGN",
        display: "₦0",
        discountPercent: 0,
      },
    },
    features: [
      "2 connected accounts",
      "3 syncs per month",
      "Up to 100 tracks per sync",
      "Manual sync only",
      "Basic matching",
      "Private playlists only",
      "Community support",
    ],
    cta: "Start Free",
  },
  starter: {
    id: "starter",
    name: "Starter",
    description: "Perfect for regular music listeners",
    popular: true,
    limits: {
      maxConnectedAccounts: 4,
      maxSyncsPerMonth: 30,
      maxTracksPerSync: -1, // unlimited
      maxPlaylistsPerSync: 5,
      canPreserveOrder: true,
      canPreserveDuplicates: false,
      canCreatePublicPlaylists: true,
      canCreatePrivatePlaylists: true,
      canUseAdvancedMatching: true,
      canAutoSync: true,
      autoSyncIntervalHours: 24, // daily
      canSyncCollaborativePlaylists: false,
      hasPrioritySupport: false,
      hasTeamAccess: false,
      hasApiAccess: false,
    },
    pricing: {
      monthly: {
        amount: 150000, // ₦1,500 in kobo
        currency: "NGN",
        display: "₦1,500",
      },
      yearly: {
        amount: 1200000, // ₦12,000 in kobo (20% off)
        currency: "NGN",
        display: "₦12,000",
        discountPercent: 33,
      },
      paystackMonthlyPlanCode: process.env.PAYSTACK_STARTER_MONTHLY_PLAN_CODE,
      paystackYearlyPlanCode: process.env.PAYSTACK_STARTER_YEARLY_PLAN_CODE,
    },
    features: [
      "4 connected accounts",
      "30 syncs per month",
      "Unlimited tracks per sync",
      "Up to 5 playlists bulk sync",
      "Preserve order",
      "Advanced matching (ISRC + metadata)",
      "Public & private playlists",
      "Daily auto-sync",
      "Standard support",
    ],
    cta: "Choose Starter",
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For power users and DJs",
    limits: {
      maxConnectedAccounts: -1, // unlimited
      maxSyncsPerMonth: -1, // unlimited
      maxTracksPerSync: -1,
      maxPlaylistsPerSync: -1,
      canPreserveOrder: true,
      canPreserveDuplicates: true,
      canCreatePublicPlaylists: true,
      canCreatePrivatePlaylists: true,
      canUseAdvancedMatching: true,
      canAutoSync: true,
      autoSyncIntervalHours: 1, // hourly
      canSyncCollaborativePlaylists: true,
      hasPrioritySupport: true,
      hasTeamAccess: false,
      hasApiAccess: false,
    },
    pricing: {
      monthly: {
        amount: 350000, // ₦3,500 in kobo
        currency: "NGN",
        display: "₦3,500",
      },
      yearly: {
        amount: 3000000, // ₦30,000 in kobo (28% off)
        currency: "NGN",
        display: "₦30,000",
        discountPercent: 28,
      },
      paystackMonthlyPlanCode: process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE,
      paystackYearlyPlanCode: process.env.PAYSTACK_PRO_YEARLY_PLAN_CODE,
    },
    features: [
      "Unlimited connected accounts",
      "Unlimited syncs",
      "Unlimited tracks & playlists",
      "Preserve order & duplicates",
      "Advanced matching + confidence control",
      "Public, private & collaborative",
      "Hourly auto-sync",
      "Priority support",
      "Early access to new providers",
      "Cancel anytime",
    ],
    cta: "Choose Pro",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "For teams and businesses",
    limits: {
      maxConnectedAccounts: -1,
      maxSyncsPerMonth: -1,
      maxTracksPerSync: -1,
      maxPlaylistsPerSync: -1,
      canPreserveOrder: true,
      canPreserveDuplicates: true,
      canCreatePublicPlaylists: true,
      canCreatePrivatePlaylists: true,
      canUseAdvancedMatching: true,
      canAutoSync: true,
      autoSyncIntervalHours: 1,
      canSyncCollaborativePlaylists: true,
      hasPrioritySupport: true,
      hasTeamAccess: true,
      hasApiAccess: true,
    },
    pricing: {
      monthly: {
        amount: 1500000, // ₦15,000 in kobo
        currency: "NGN",
        display: "₦15,000",
      },
      yearly: {
        amount: 15000000, // ₦150,000
        currency: "NGN",
        display: "₦150,000",
        discountPercent: 16,
      },
    },
    features: [
      "Everything in Pro",
      "Team access (up to 10 members)",
      "API access",
      "SSO (coming soon)",
      "SLA & dedicated support",
      "Custom integrations",
      "Audit logs",
    ],
    cta: "Contact Sales",
  },
};

// USD equivalents for international users (display only, Paystack can handle multi-currency)
export const PLANS_USD: Record<PlanId, { monthly: string; yearly: string }> = {
  free: { monthly: "$0", yearly: "$0" },
  starter: { monthly: "$2.99", yearly: "$24" },
  pro: { monthly: "$6.99", yearly: "$60" },
  enterprise: { monthly: "$29", yearly: "$290" },
};

export function getPlan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.free;
}

export function getPlanLimits(planId: string): PlanLimits {
  const plan = PLANS[planId as PlanId];
  return plan ? plan.limits : PLANS.free.limits;
}

export function canAccessFeature(planId: string, feature: keyof PlanLimits): boolean {
  const limits = getPlanLimits(planId);
  const value = limits[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0; // 0 = not allowed, -1 = unlimited, >0 = allowed
  return !!value;
}

export function isWithinLimit(planId: string, limit: keyof PlanLimits, currentUsage: number): boolean {
  const limits = getPlanLimits(planId);
  const max = limits[limit] as number;
  if (max === -1) return true; // unlimited
  return currentUsage < max;
}

export function getPlanByPaystackCode(paystackPlanCode: string): Plan | null {
  for (const plan of Object.values(PLANS)) {
    if (
      plan.pricing.paystackPlanCode === paystackPlanCode ||
      plan.pricing.paystackMonthlyPlanCode === paystackPlanCode ||
      plan.pricing.paystackYearlyPlanCode === paystackPlanCode
    ) {
      return plan;
    }
  }
  return null;
}

// For DB seeding and Paystack creation
export const PLAN_SEED_DATA = [
  {
    id: "free",
    name: "Free",
    description: "Try PlayMeld with essential features",
    priceMonthly: 0,
    priceYearly: 0,
    currency: "NGN",
    limits: PLANS.free.limits,
    features: PLANS.free.features,
    isActive: true,
  },
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for regular music listeners",
    priceMonthly: 150000,
    priceYearly: 1200000,
    currency: "NGN",
    limits: PLANS.starter.limits,
    features: PLANS.starter.features,
    isActive: true,
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For power users and DJs",
    priceMonthly: 350000,
    priceYearly: 3000000,
    currency: "NGN",
    limits: PLANS.pro.limits,
    features: PLANS.pro.features,
    isActive: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For teams and businesses",
    priceMonthly: 1500000,
    priceYearly: 15000000,
    currency: "NGN",
    limits: PLANS.enterprise.limits,
    features: PLANS.enterprise.features,
    isActive: true,
  },
];

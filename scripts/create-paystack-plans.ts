/**
 * Create Paystack plans via API
 * Run: npm run db:create-paystack-plans
 * 
 * Requires PAYSTACK_SECRET_KEY env var
 * Creates plans in Paystack and updates DB with plan codes
 * 
 * Pricing: Competitive with free tier
 * - Starter: ₦1,500 monthly, ₦12,000 yearly (33% off)
 * - Pro: ₦3,500 monthly, ₦30,000 yearly (28% off)
 * - Enterprise: ₦15,000 monthly, ₦150,000 yearly
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { PLAN_SEED_DATA } from "../lib/billing/plans";

if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error("PAYSTACK_SECRET_KEY not set");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const PAYSTACK_API_BASE = "https://api.paystack.co";

async function paystackRequest(path: string, method: "GET" | "POST" = "GET", body?: any) {
  const secret = process.env.PAYSTACK_SECRET_KEY!;
  const url = `${PAYSTACK_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Paystack request failed: ${res.status} ${JSON.stringify(data).slice(0, 500)}`);
  }

  return data;
}

async function createOrGetPlan(name: string, amount: number, interval: "monthly" | "annually" | "quarterly", description: string) {
  // Check if plan already exists by listing
  try {
    const listRes = await paystackRequest("/plan", "GET");
    const existing = listRes.data?.find((p: any) => p.name === name);
    if (existing) {
      console.log(`Plan already exists: ${name} - ${existing.plan_code}`);
      return existing;
    }
  } catch (err) {
    console.warn("Failed to list plans, will try create", err);
  }

  // Create new plan
  const res = await paystackRequest("/plan", "POST", {
    name,
    amount,
    interval,
    description,
    currency: "NGN",
  });

  console.log(`Created plan: ${name} - ${res.data.plan_code} - ₦${amount / 100} ${interval}`);

  return res.data;
}

async function main() {
  console.log("Creating Paystack plans...\n");

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  const plansToCreate = [
    {
      id: "starter",
      name: "PlayMeld Starter Monthly",
      amount: 150000, // ₦1,500 in kobo
      interval: "monthly" as const,
      description: "4 connected accounts, 30 syncs/month, unlimited tracks, daily auto-sync",
    },
    {
      id: "starter_yearly",
      name: "PlayMeld Starter Yearly",
      amount: 1200000, // ₦12,000 in kobo
      interval: "annually" as const,
      description: "Starter plan billed yearly - 33% off",
    },
    {
      id: "pro",
      name: "PlayMeld Pro Monthly",
      amount: 350000, // ₦3,500 in kobo
      interval: "monthly" as const,
      description: "Unlimited accounts, unlimited syncs, hourly auto-sync, priority support",
    },
    {
      id: "pro_yearly",
      name: "PlayMeld Pro Yearly",
      amount: 3000000, // ₦30,000 in kobo
      interval: "annually" as const,
      description: "Pro plan billed yearly - 28% off",
    },
    {
      id: "enterprise",
      name: "PlayMeld Enterprise Monthly",
      amount: 1500000, // ₦15,000 in kobo
      interval: "monthly" as const,
      description: "Everything in Pro plus team access, API, SLA",
    },
    {
      id: "enterprise_yearly",
      name: "PlayMeld Enterprise Yearly",
      amount: 15000000, // ₦150,000 in kobo
      interval: "annually" as const,
      description: "Enterprise plan billed yearly",
    },
  ];

  const createdPlans: Record<string, any> = {};

  for (const plan of plansToCreate) {
    try {
      const result = await createOrGetPlan(plan.name, plan.amount, plan.interval, plan.description);
      createdPlans[plan.id] = result;
    } catch (err) {
      console.error(`Failed to create plan ${plan.name}`, err);
    }
  }

  console.log("\nUpdating DB with Paystack plan codes...");

  // Update plans table with codes
  const updates = [
    {
      id: "starter",
      monthlyCode: createdPlans["starter"]?.plan_code,
      yearlyCode: createdPlans["starter_yearly"]?.plan_code,
    },
    {
      id: "pro",
      monthlyCode: createdPlans["pro"]?.plan_code,
      yearlyCode: createdPlans["pro_yearly"]?.plan_code,
    },
    {
      id: "enterprise",
      monthlyCode: createdPlans["enterprise"]?.plan_code,
      yearlyCode: createdPlans["enterprise_yearly"]?.plan_code,
    },
  ];

  for (const upd of updates) {
    if (upd.monthlyCode || upd.yearlyCode) {
      try {
        await db
          .update(schema.plans)
          .set({
            paystackMonthlyPlanCode: upd.monthlyCode,
            paystackYearlyPlanCode: upd.yearlyCode,
            updatedAt: new Date(),
          })
          .where(eq(schema.plans.id, upd.id));

        console.log(`✓ Updated DB plan ${upd.id}: monthly=${upd.monthlyCode}, yearly=${upd.yearlyCode}`);
      } catch (err) {
        console.error(`Failed to update DB for ${upd.id}`, err);
      }
    }
  }

  console.log("\n=== Paystack Plans Summary ===");
  console.log("Add these to your .env.local and Vercel env vars:\n");
  for (const [key, plan] of Object.entries(createdPlans)) {
    console.log(`${key.toUpperCase()}_PLAN_CODE=${plan.plan_code} # ${plan.name} - ₦${plan.amount / 100} ${plan.interval}`);
  }

  console.log("\nFor .env.local:");
  console.log(`PAYSTACK_STARTER_MONTHLY_PLAN_CODE=${createdPlans["starter"]?.plan_code || ""}`);
  console.log(`PAYSTACK_STARTER_YEARLY_PLAN_CODE=${createdPlans["starter_yearly"]?.plan_code || ""}`);
  console.log(`PAYSTACK_PRO_MONTHLY_PLAN_CODE=${createdPlans["pro"]?.plan_code || ""}`);
  console.log(`PAYSTACK_PRO_YEARLY_PLAN_CODE=${createdPlans["pro_yearly"]?.plan_code || ""}`);
  console.log(`PAYSTACK_ENTERPRISE_MONTHLY_PLAN_CODE=${createdPlans["enterprise"]?.plan_code || ""}`);
  console.log(`PAYSTACK_ENTERPRISE_YEARLY_PLAN_CODE=${createdPlans["enterprise_yearly"]?.plan_code || ""}`);

  console.log("\nDone!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Create Paystack plans failed", err);
    process.exit(1);
  });

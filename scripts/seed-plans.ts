/**
 * Seed plans into DB
 * Run: npm run db:seed:plans
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../db/schema";
import { PLAN_SEED_DATA } from "../lib/billing/plans";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function main() {
  console.log("Seeding plans...");

  for (const plan of PLAN_SEED_DATA) {
    try {
      await db
        .insert(schema.plans)
        .values({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          currency: plan.currency,
          limits: plan.limits as any,
          features: plan.features as any,
          isActive: plan.isActive,
          isPopular: (plan as any).popular || false,
          paystackMonthlyPlanCode: (plan as any).paystackMonthlyPlanCode || null,
          paystackYearlyPlanCode: (plan as any).paystackYearlyPlanCode || null,
        })
        .onConflictDoUpdate({
          target: schema.plans.id,
          set: {
            name: plan.name,
            description: plan.description,
            priceMonthly: plan.priceMonthly,
            priceYearly: plan.priceYearly,
            limits: plan.limits as any,
            features: plan.features as any,
            isActive: plan.isActive,
            isPopular: (plan as any).popular || false,
            updatedAt: new Date(),
          },
        });

      console.log(`✓ Seeded plan: ${plan.id} - ${plan.name}`);
    } catch (err) {
      console.error(`Failed to seed plan ${plan.id}`, err);
    }
  }

  console.log("Plans seeding complete");

  // List plans
  const allPlans = await db.select().from(schema.plans);
  console.log("\nCurrent plans in DB:");
  for (const p of allPlans) {
    console.log(`- ${p.id}: ${p.name} - ${p.priceMonthly} kobo monthly, ${p.priceYearly} kobo yearly, popular: ${p.isPopular}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed plans failed", err);
    process.exit(1);
  });

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { initializeTransaction } from "@/lib/billing/paystack";
import { getAppUrl } from "@/lib/url";
import { PLANS, PlanId } from "@/lib/billing/plans";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  planId: z.enum(["free", "starter", "pro", "enterprise"]),
  billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    const { planId, billingInterval, email } = parsed.data;

    if (email.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "Email must match authenticated user" }, { status: 400 });
    }

    if (planId === "free") {
      return NextResponse.json({ error: "Free plan doesn't require payment" }, { status: 400 });
    }

    const plan = PLANS[planId as PlanId];
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    let [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, session.user.id))
      .limit(1);

    if (!workspace) {
      const slug = `ws-${session.user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      [workspace] = await db
        .insert(workspaces)
        .values({
          name: `${session.user.name || "My"} Workspace`,
          slug,
          ownerId: session.user.id,
          plan: "free",
        })
        .returning();
    }

    const appUrl = getAppUrl(req);
    const pricing = billingInterval === "yearly" ? plan.pricing.yearly : plan.pricing.monthly;
    const paystackPlanCode = billingInterval === "yearly" ? plan.pricing.paystackYearlyPlanCode : plan.pricing.paystackMonthlyPlanCode;

    // If Paystack plan code exists, use it (amount determined by plan), else use amount directly
    const amount = paystackPlanCode ? 0 : pricing.amount; // 0 if plan code used, else amount in kobo

    console.log(`[Billing] Initializing Paystack for user ${session.user.id}, plan ${planId} ${billingInterval}, amount ${pricing.amount}, planCode ${paystackPlanCode}, appUrl ${appUrl}`);

    const result = await initializeTransaction({
      email,
      amount,
      plan: paystackPlanCode || undefined,
      callback_url: `${appUrl}/dashboard/settings?paystack=callback&plan=${planId}&interval=${billingInterval}`,
      metadata: {
        userId: session.user.id,
        workspaceId: workspace.id,
        planId,
        billingInterval,
        planCode: paystackPlanCode || `${planId}_${billingInterval}`,
        amount: pricing.amount,
        currency: pricing.currency,
        custom_fields: [
          {
            display_name: "Workspace ID",
            variable_name: "workspace_id",
            value: workspace.id,
          },
          {
            display_name: "Plan",
            variable_name: "plan_id",
            value: planId,
          },
          {
            display_name: "Billing Interval",
            variable_name: "billing_interval",
            value: billingInterval,
          },
        ],
      },
    });

    if (!result.status) {
      return NextResponse.json({ error: "Failed to initialize transaction", details: result.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        authorization_url: result.data.authorization_url,
        access_code: result.data.access_code,
        reference: result.data.reference,
        planId,
        billingInterval,
        amount: pricing.amount,
        display: pricing.display,
      },
    });
  } catch (err) {
    console.error("Paystack initialize error", err instanceof Error ? err.message : err, err instanceof Error ? err.stack?.slice(0, 500) : "");
    return NextResponse.json({ error: "Failed to initialize payment", details: err instanceof Error ? err.message.slice(0, 200) : "Unknown" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces, subscriptions, paystackEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyTransaction } from "@/lib/billing/paystack";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");

  if (!reference) {
    return NextResponse.json({ error: "reference required" }, { status: 400 });
  }

  try {
    const result = await verifyTransaction(reference);

    if (!result.status) {
      return NextResponse.json({ error: "Transaction verification failed" }, { status: 400 });
    }

    const data = result.data;

    // Idempotent handling via paystack_events
    const eventId = `verify_${reference}`;
    const existing = await db.select().from(paystackEvents).where(eq(paystackEvents.eventId, eventId)).limit(1);

    if (existing.length === 0) {
      await db.insert(paystackEvents).values({
        eventId,
        type: "transaction.verify",
        processed: true,
        payload: data as any,
        processedAt: new Date(),
      });
    }

    // If transaction successful and has subscription, update workspace
    if (data.status === "success") {
      const metadata = data.metadata as any;
      const workspaceId = metadata?.workspaceId;
      const planCode = metadata?.planCode || data.plan?.plan_code;

      if (workspaceId) {
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

        if (workspace && workspace.ownerId === session.user.id) {
          // Update workspace with customer code and subscription
          await db
            .update(workspaces)
            .set({
              paystackCustomerCode: data.customer.customer_code,
              paystackSubscriptionCode: data.subscription?.subscription_code,
              paystackPlanCode: planCode,
              // Map plan code to plan enum - simplistic
              plan: planCode?.includes("pro") ? "pro" : planCode?.includes("starter") ? "starter" : "pro",
              subscriptionStatus: "active",
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, workspaceId));

          // Create subscription record
          if (data.subscription?.subscription_code) {
            const existingSub = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.paystackSubscriptionCode, data.subscription.subscription_code))
              .limit(1);

            if (existingSub.length === 0) {
              await db.insert(subscriptions).values({
                workspaceId,
                userId: session.user.id,
                paystackCustomerCode: data.customer.customer_code,
                paystackSubscriptionCode: data.subscription.subscription_code,
                paystackPlanCode: planCode,
                status: "active",
                amount: data.amount,
                currency: data.currency,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("Paystack verify error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to verify transaction" }, { status: 500 });
  }
}

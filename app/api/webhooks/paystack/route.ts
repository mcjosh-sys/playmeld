import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paystackEvents, workspaces, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPaystackWebhookSignature } from "@/lib/billing/paystack";

export const runtime = "nodejs";

/**
 * Paystack webhook handler
 * - Verifies signature using HMAC SHA512
 * - Idempotent handling via paystack_events table
 * - Updates workspace subscription state server-side
 * - Never trusts client-supplied subscription state
 */

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Verify signature - mandatory
  const isValid = verifyPaystackWebhookSignature(rawBody, signature);
  if (!isValid) {
    console.error("Invalid Paystack webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = payload.id?.toString() || `${payload.event}_${Date.now()}`;
  const eventType = payload.event;

  try {
    // Idempotent check - have we processed this event?
    const existing = await db.select().from(paystackEvents).where(eq(paystackEvents.eventId, eventId)).limit(1);

    if (existing.length > 0 && existing[0].processed) {
      return NextResponse.json({ status: "already_processed" });
    }

    // Store event
    if (existing.length === 0) {
      await db.insert(paystackEvents).values({
        eventId,
        type: eventType,
        processed: false,
        payload,
      });
    }

    // Process based on event type
    switch (eventType) {
      case "charge.success": {
        const data = payload.data;
        const customerCode = data.customer?.customer_code;
        const reference = data.reference;

        if (customerCode) {
          // Find workspace by customer code
          const [workspace] = await db
            .select()
            .from(workspaces)
            .where(eq(workspaces.paystackCustomerCode, customerCode))
            .limit(1);

          if (workspace) {
            // Update subscription status if needed
            // This is for one-time charges, not subscriptions necessarily
            console.log(`Charge success for workspace ${workspace.id}, ref ${reference}`);
          }
        }
        break;
      }

      case "subscription.create":
      case "subscription.enable":
      case "subscription.not_renew":
      case "subscription.disable": {
        const data = payload.data;
        const subscriptionCode = data.subscription_code || data.subscriptionCode;
        const customerCode = data.customer?.customer_code || data.customer_code;
        const status = data.status;

        if (subscriptionCode) {
          // Find subscription
          const [sub] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.paystackSubscriptionCode, subscriptionCode))
            .limit(1);

          if (sub) {
            // Update subscription status
            let mappedStatus: "active" | "cancelled" | "past_due" | "unpaid" | "pending" = "active";
            if (status === "active") mappedStatus = "active";
            else if (status === "cancelled" || eventType === "subscription.disable") mappedStatus = "cancelled";
            else if (status === "past_due") mappedStatus = "past_due";

            await db
              .update(subscriptions)
              .set({
                status: mappedStatus,
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.id, sub.id));

            // Update workspace
            await db
              .update(workspaces)
              .set({
                subscriptionStatus: mappedStatus,
                updatedAt: new Date(),
              })
              .where(eq(workspaces.id, sub.workspaceId));
          } else if (customerCode) {
            // Try to find workspace by customer code and create subscription record if missing
            const [workspace] = await db
              .select()
              .from(workspaces)
              .where(eq(workspaces.paystackCustomerCode, customerCode))
              .limit(1);

            if (workspace) {
              await db
                .update(workspaces)
                .set({
                  subscriptionStatus: status === "active" ? "active" : "cancelled",
                  paystackSubscriptionCode: subscriptionCode,
                  updatedAt: new Date(),
                })
                .where(eq(workspaces.id, workspace.id));
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const data = payload.data;
        const customerCode = data.customer?.customer_code;
        if (customerCode) {
          const [workspace] = await db
            .select()
            .from(workspaces)
            .where(eq(workspaces.paystackCustomerCode, customerCode))
            .limit(1);
          if (workspace) {
            await db
              .update(workspaces)
              .set({
                subscriptionStatus: "past_due",
                updatedAt: new Date(),
              })
              .where(eq(workspaces.id, workspace.id));
          }
        }
        break;
      }

      default:
        console.log(`Unhandled Paystack event type: ${eventType}`);
    }

    // Mark as processed
    await db
      .update(paystackEvents)
      .set({
        processed: true,
        processedAt: new Date(),
      })
      .where(eq(paystackEvents.eventId, eventId));

    return NextResponse.json({ status: "processed" });
  } catch (err) {
    console.error("Error processing Paystack webhook", err instanceof Error ? err.message : err);

    // Store error for diagnostics (without secrets)
    try {
      await db
        .update(paystackEvents)
        .set({
          error: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
        })
        .where(eq(paystackEvents.eventId, eventId));
    } catch {}

    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
  }
}

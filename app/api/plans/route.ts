import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PLANS } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Try DB first, fallback to config
    const dbPlans = await db.select().from(plans).where(eq(plans.isActive, true));

    if (dbPlans.length > 0) {
      return NextResponse.json({ data: dbPlans });
    }

    // Fallback to config
    return NextResponse.json({ data: Object.values(PLANS) });
  } catch (err) {
    console.error("Error fetching plans", err);
    // Fallback to config on error
    return NextResponse.json({ data: Object.values(PLANS) });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { initializeTransaction } from "@/lib/billing/paystack";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  planCode: z.string().min(1),
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

    const { planCode, email } = parsed.data;

    // Verify email matches authenticated user (prevent using other's email)
    if (email.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "Email must match authenticated user" }, { status: 400 });
    }

    // Get or create workspace for user
    let [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, session.user.id))
      .limit(1);

    if (!workspace) {
      // Create default workspace
      const slug = `ws-${session.user.id.slice(0, 8)}`;
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Initialize Paystack transaction - secret key stays server-side
    const result = await initializeTransaction({
      email,
      amount: 0, // For plan subscription, amount is determined by plan
      plan: planCode,
      callback_url: `${appUrl}/dashboard/settings?paystack=callback`,
      metadata: {
        userId: session.user.id,
        workspaceId: workspace.id,
        planCode,
        custom_fields: [
          {
            display_name: "Workspace ID",
            variable_name: "workspace_id",
            value: workspace.id,
          },
        ],
      },
    });

    if (!result.status) {
      return NextResponse.json({ error: "Failed to initialize transaction" }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        authorization_url: result.data.authorization_url,
        access_code: result.data.access_code,
        reference: result.data.reference,
      },
    });
  } catch (err) {
    console.error("Paystack initialize error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to initialize payment" }, { status: 500 });
  }
}

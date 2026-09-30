import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedAccounts, syncJobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const disconnectSchema = z.object({
  accountId: z.string().min(1),
  confirm: z.boolean().optional(), // For confirmation dialog
});

/**
 * Disconnect a connected account
 * - Verifies ownership (connectedAccounts.userId == session.user.id)
 * - Marks isActive false and clears encrypted tokens (secure deletion)
 * - Does NOT cascade delete sync jobs - preserves history but marks account inactive
 * - If confirm not true, returns confirmation required (for UI confirmation dialog)
 * - Safe error handling, no secrets in logs
 */

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = disconnectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    const { accountId, confirm } = parsed.data;

    // Ownership check
    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "Account not found or not owned by user" }, { status: 404 });
    }

    // Check if there are active sync jobs using this account
    const activeJobs = await db
      .select({ id: syncJobs.id, status: syncJobs.status })
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.userId, session.user.id),
          // Check both source and destination - need to handle OR, but for simplicity check separately
          // We'll check if any job is running/pending that uses this account
        )
      );

    // For simplicity, check jobs that reference this account (we need to query both source and dest)
    // Since we don't have OR helper easily, do two queries
    const { eq: eq2, or } = await import("drizzle-orm");
    const jobsUsingAccount = await db
      .select()
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.userId, session.user.id),
          or(eq(syncJobs.sourceAccountId, accountId), eq(syncJobs.destinationAccountId, accountId))
        )
      )
      .limit(10);

    const runningJobs = jobsUsingAccount.filter((j) => j.status === "running" || j.status === "pending");

    if (runningJobs.length > 0 && !confirm) {
      return NextResponse.json(
        {
          error: "Account has active sync jobs",
          details: `This account is used in ${runningJobs.length} active job(s) (${runningJobs.map((j) => j.id).join(", ")}). Disconnecting will cancel them. Confirm to proceed.`,
          activeJobs: runningJobs.map((j) => ({ id: j.id, status: j.status })),
          requiresConfirmation: true,
        },
        { status: 409 }
      );
    }

    // If confirmation required but not provided, return confirmation needed
    if (!confirm) {
      return NextResponse.json(
        {
          error: "Confirmation required",
          message: `Are you sure you want to disconnect ${account.displayName || account.providerAccountId}? This will remove encrypted tokens and mark account inactive. Sync history will be preserved.`,
          account: {
            id: account.id,
            provider: account.provider,
            displayName: account.displayName,
            providerAccountId: account.providerAccountId,
          },
          requiresConfirmation: true,
        },
        { status: 400 }
      );
    }

    // Perform disconnect - mark inactive and clear tokens (secure)
    // We clear tokens to ensure no secrets remain, but keep record for audit/history
    // Alternatively, we could delete entirely, but marking inactive preserves sync history
    await db
      .update(connectedAccounts)
      .set({
        isActive: false,
        accessTokenEncrypted: "DISCONNECTED", // Clear actual token, mark as disconnected
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(connectedAccounts.id, accountId));

    console.log(`Disconnected account ${accountId} for user ${session.user.id}, provider ${account.provider}`);

    // Optionally, cancel any pending/running jobs that use this account
    if (runningJobs.length > 0) {
      for (const job of runningJobs) {
        await db
          .update(syncJobs)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            errorMessage: `Cancelled because connected account ${accountId} was disconnected`,
            updatedAt: new Date(),
          })
          .where(eq(syncJobs.id, job.id));

        console.log(`Cancelled job ${job.id} because account ${accountId} disconnected`);
      }
    }

    return NextResponse.json({
      data: {
        id: accountId,
        status: "disconnected",
        cancelledJobs: runningJobs.length,
      },
      message: `Successfully disconnected ${account.provider} account`,
    });
  } catch (err) {
    console.error("Error disconnecting account", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to disconnect account" }, { status: 500 });
  }
}

// Also support DELETE for RESTful API
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json({ error: "accountId query param required" }, { status: 400 });
  }

  // Reuse POST logic with confirm true for DELETE (explicit destructive action)
  const mockReq = {
    json: async () => ({ accountId, confirm: true }),
  } as any;

  // Create a new request with body
  const newReq = new NextRequest(req.url, {
    method: "POST",
    body: JSON.stringify({ accountId, confirm: true }),
    headers: { "Content-Type": "application/json" },
  });

  // Copy auth - we already checked session, but need to pass through
  return POST(newReq);
}

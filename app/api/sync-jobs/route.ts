import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs, connectedAccounts, workspaces, usageRecords } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createSyncJobSchema } from "@/lib/validations";
import { getPlanLimits, isWithinLimit } from "@/lib/billing/plans";
import { enqueueSyncJob } from "@/lib/queue";

export const runtime = "nodejs";

// List sync jobs with ownership check
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, session.user.id))
    .orderBy(desc(syncJobs.createdAt))
    .limit(50);

  return NextResponse.json({ data: jobs });
}

// Create sync job - must verify ownership of source and destination accounts
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createSyncJobSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    const {
      sourceAccountId,
      destinationAccountId,
      sourcePlaylistId,
      createNewPlaylist,
      destinationPlaylistName,
      destinationPlaylistDescription,
      preserveDuplicates,
      preserveOrder,
    } = parsed.data;

    // Ownership checks - both accounts must belong to authenticated user
    const [sourceAccount] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, sourceAccountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!sourceAccount) {
      return NextResponse.json({ error: "Source account not found or not owned" }, { status: 404 });
    }

    const [destAccount] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, destinationAccountId), eq(connectedAccounts.userId, session.user.id)))
      .limit(1);

    if (!destAccount) {
      return NextResponse.json({ error: "Destination account not found or not owned" }, { status: 404 });
    }

    // Get user's workspace for billing check - server-side enforcement
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, session.user.id))
      .limit(1);

    const planId = workspace?.plan || "free";
    const limits = getPlanLimits(planId);

    // Enforce plan limits server-side
    // Check connected accounts limit
    const allAccounts = await db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, session.user.id));

    if (limits.maxConnectedAccounts !== -1 && allAccounts.length > limits.maxConnectedAccounts) {
      return NextResponse.json(
        {
          error: `Plan limit exceeded: ${planId} allows ${limits.maxConnectedAccounts} connected accounts, you have ${allAccounts.length}. Upgrade to sync.`,
          plan: planId,
          limit: "maxConnectedAccounts",
        },
        { status: 403 }
      );
    }

    // Check monthly sync limit
    const currentMonth = new Date().toISOString().slice(0, 7);
    const [usage] = await db
      .select()
      .from(usageRecords)
      .where(and(eq(usageRecords.userId, session.user.id), eq(usageRecords.month, currentMonth)))
      .limit(1);

    if (limits.maxSyncsPerMonth !== -1) {
      const currentCount = usage?.syncCount || 0;
      if (currentCount >= limits.maxSyncsPerMonth) {
        return NextResponse.json(
          {
            error: `Monthly sync limit reached for ${planId}: ${limits.maxSyncsPerMonth} syncs/month. Used ${currentCount}. Upgrade for unlimited.`,
            plan: planId,
            limit: "maxSyncsPerMonth",
            usage: currentCount,
            max: limits.maxSyncsPerMonth,
          },
          { status: 403 }
        );
      }
    }

    // Check feature gates
    if (preserveDuplicates && !limits.canPreserveDuplicates) {
      return NextResponse.json(
        {
          error: `Preserve duplicates requires Starter or Pro plan. Your plan: ${planId}`,
          plan: planId,
          requiredFeature: "canPreserveDuplicates",
        },
        { status: 403 }
      );
    }

    if (preserveOrder && !limits.canPreserveOrder) {
      return NextResponse.json(
        {
          error: `Preserve order requires Starter or Pro plan. Your plan: ${planId}`,
          plan: planId,
          requiredFeature: "canPreserveOrder",
        },
        { status: 403 }
      );
    }

    // Create sync job - pending, will be processed async via BullMQ
    const [job] = await db
      .insert(syncJobs)
      .values({
        userId: session.user.id,
        workspaceId: workspace?.id,
        sourceAccountId,
        destinationAccountId,
        sourcePlaylistId,
        sourcePlaylistName: destinationPlaylistName || sourcePlaylistId,
        status: "pending",
        config: {
          createNewPlaylist,
          preserveDuplicates: preserveDuplicates && limits.canPreserveDuplicates,
          preserveOrder: preserveOrder && limits.canPreserveOrder,
          description: destinationPlaylistDescription,
        },
      })
      .returning();

    // Enqueue to BullMQ - async processing
    let bullmqJobId: string | null = null;
    let enqueueError: any = null;

    try {
      bullmqJobId = await enqueueSyncJob({
        syncJobId: job.id,
        userId: session.user.id,
        workspaceId: workspace?.id,
        sourceAccountId,
        destinationAccountId,
        sourcePlaylistId,
      });

      console.log(`Sync job ${job.id} enqueued with BullMQ id ${bullmqJobId}`);
    } catch (queueErr) {
      enqueueError = queueErr;
      console.warn("Failed to enqueue to BullMQ, will use fallback processing", queueErr);
    }

    // Fallback processing: If BullMQ enqueue succeeded but worker may not be running (jobs stuck in Pending),
    // trigger background direct processing after short delay if job still pending
    // This ensures sync works even without separate worker process (e.g., local dev without worker, Vercel without Redis worker)
    const triggerFallbackProcessing = async () => {
      // Wait 3 seconds to give BullMQ worker chance to pick up
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        // Check if job still pending - if so, worker didn't pick it up, process directly
        const { neon } = await import("@neondatabase/serverless");
        const { drizzle } = await import("drizzle-orm/neon-http");
        const schema = await import("@/db/schema");
        const { eq, and } = await import("drizzle-orm");

        const sql = neon(process.env.DATABASE_URL!);
        const dbCheck = drizzle(sql, { schema });

        const userId = session?.user?.id;
        if (!userId) return;

        const [currentJob] = await dbCheck
          .select()
          .from(schema.syncJobs)
          .where(and(eq(schema.syncJobs.id, job.id), eq(schema.syncJobs.userId, userId)))
          .limit(1);

        if (currentJob && currentJob.status === "pending") {
          console.log(`[Fallback] Job ${job.id} still pending after 3s, BullMQ worker may not be running. Triggering direct processing as fallback.`);

          // Process directly via shared processor
          const { processSyncJobDirect } = await import("@/lib/sync/processor");
          const result = await processSyncJobDirect(job.id, userId);

          console.log(`[Fallback] Direct processing completed for job ${job.id}:`, result.status);
        } else {
          console.log(`[Fallback] Job ${job.id} status is ${currentJob?.status}, not pending, skipping fallback processing (worker likely picked it up)`);
        }
      } catch (fallbackErr) {
        console.error(`[Fallback] Failed to process job ${job.id} via fallback`, fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
      }
    };

    // Trigger fallback in background without blocking response (fire and forget)
    // Use setImmediate to not block, and catch errors
    if (typeof setImmediate !== "undefined") {
      setImmediate(() => {
        triggerFallbackProcessing().catch((err) => console.error("Fallback processing error", err));
      });
    } else {
      // Fallback to setTimeout
      setTimeout(() => {
        triggerFallbackProcessing().catch((err) => console.error("Fallback processing error", err));
      }, 3000);
    }

    // Return 202 immediately with queue status
    if (bullmqJobId) {
      return NextResponse.json(
        {
          data: job,
          queue: {
            bullmqJobId,
            status: "queued",
            fallback: "Fallback direct processing scheduled after 3s if worker not running",
          },
        },
        { status: 202 }
      );
    } else {
      return NextResponse.json(
        {
          data: job,
          queue: {
            status: "pending_fallback",
            message: "BullMQ enqueue failed, using direct fallback processing in background",
            error: enqueueError?.message?.slice(0, 200),
            fallback: "Direct processing triggered in background via processor.ts",
          },
        },
        { status: 202 }
      );
    }
  } catch (err) {
    console.error("Error creating sync job", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to create sync job" }, { status: 500 });
  }
}

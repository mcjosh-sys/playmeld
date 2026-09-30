import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { processSyncJobDirect } from "@/lib/sync/processor";

export const runtime = "nodejs";

/**
 * Process a sync job - worker endpoint and manual trigger for pending jobs
 * Uses shared processor from lib/sync/processor.ts for consistency with BullMQ worker and fallback
 * Security: Must verify job belongs to authenticated user
 */

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = params.id;

  const [job] = await db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.id, jobId), eq(syncJobs.userId, session.user.id)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Sync job not found" }, { status: 404 });
  }

  if (job.status !== "pending" && job.status !== "failed") {
    return NextResponse.json({ error: `Job already in status ${job.status}, cannot process. Only pending/failed can be processed.` }, { status: 400 });
  }

  try {
    console.log(`[Process API] Manually processing job ${jobId} for user ${session.user.id}`);

    const result = await processSyncJobDirect(jobId, session.user.id);

    return NextResponse.json({
      data: {
        jobId,
        status: result.status,
        summary: result.summary,
        destinationPlaylistId: result.destinationPlaylistId,
        destinationPlaylistUrl: result.destinationPlaylistUrl,
        error: result.error,
      },
    });
  } catch (err) {
    console.error("Error processing sync job via API", err instanceof Error ? err.message : err);

    const message = err instanceof Error ? err.message : "Unknown error";

    // Check if it's a retryable error that was re-queued as pending
    if (message.includes("Scheduled for retry") || message.includes("Retryable")) {
      return NextResponse.json(
        {
          data: { status: "pending", message },
          message: "Job scheduled for retry via BullMQ backoff",
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ error: "Sync failed", details: message.slice(0, 300) }, { status: 500 });
  }
}

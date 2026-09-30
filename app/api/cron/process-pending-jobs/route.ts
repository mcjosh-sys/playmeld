import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processSyncJobDirect } from "@/lib/sync/processor";
import { getQueueMetrics } from "@/lib/queue";

export const runtime = "nodejs";

/**
 * Vercel Cron endpoint to process pending sync jobs as fallback when BullMQ worker not running
 * Runs every 5 minutes via vercel.json crons
 * 
 * For production with BullMQ + Redis, main processing via worker (concurrency 5, limiter 10/sec)
 * For Vercel without Redis or when worker not running (jobs stuck in Pending), this processes pending jobs directly
 * Fixes bug where syncing stuck in Pending state even though Redis connected and job enqueued, because worker not running
 * 
 * Security: Verifies cron secret if set
 */

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === "production" && cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Get queue metrics to see if BullMQ has jobs waiting
    let queueMetrics = null;
    try {
      queueMetrics = await getQueueMetrics();
    } catch {}

    // Find pending jobs (max 3 per cron run to avoid Vercel timeout 60s)
    const pendingJobs = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.status, "pending"))
      .limit(3);

    if (pendingJobs.length === 0) {
      return NextResponse.json({
        message: "No pending jobs",
        processed: 0,
        queueMetrics,
      });
    }

    console.log(`[Cron] Found ${pendingJobs.length} pending jobs, queueMetrics:`, queueMetrics);

    const results = [];
    let processedCount = 0;

    for (const job of pendingJobs) {
      const ageMinutes = (Date.now() - new Date(job.createdAt).getTime()) / 1000 / 60;
      const ageSeconds = (Date.now() - new Date(job.createdAt).getTime()) / 1000;

      // Only process jobs pending > 1 minute to give BullMQ worker chance to pick up first
      // Fixes stuck Pending when worker not running: after 1 min, cron will process directly as fallback
      if (ageSeconds < 60) {
        console.log(`[Cron] Job ${job.id} only ${ageSeconds.toFixed(1)}s old, skipping to give BullMQ worker chance`);
        results.push({
          jobId: job.id,
          ageSeconds: Math.round(ageSeconds),
          status: "skipped_young",
          action: "Waiting for BullMQ worker",
        });
        continue;
      }

      console.log(`[Cron] Processing pending job ${job.id} directly as fallback (age ${ageMinutes.toFixed(1)} min), user ${job.userId}`);

      try {
        const result = await processSyncJobDirect(job.id, job.userId);
        processedCount++;
        results.push({
          jobId: job.id,
          ageMinutes: Math.round(ageMinutes),
          status: result.status,
          summary: result.summary,
          result: "processed_via_cron_fallback",
        });
        console.log(`[Cron] Job ${job.id} processed via fallback: ${result.status}`);
      } catch (err) {
        console.error(`[Cron] Failed to process job ${job.id} via fallback`, err instanceof Error ? err.message : err);
        results.push({
          jobId: job.id,
          ageMinutes: Math.round(ageMinutes),
          status: "failed_fallback",
          error: err instanceof Error ? err.message.slice(0, 200) : "Unknown",
        });
      }

      // For Vercel, avoid processing too many in one cron run to stay under 60s maxDuration
      if (processedCount >= 2) {
        console.log(`[Cron] Processed ${processedCount} jobs, stopping to avoid Vercel timeout`);
        break;
      }
    }

    return NextResponse.json({
      message: `Found ${pendingJobs.length} pending jobs, processed ${processedCount} via fallback`,
      processed: processedCount,
      results,
      queueMetrics,
      note: processedCount > 0
        ? "Processed via cron fallback because BullMQ worker may not be running. For production, run worker via npm run worker or docker-compose worker service."
        : "No jobs processed - either young (<60s) waiting for BullMQ worker, or none pending. Ensure worker is running: npm run worker or docker-compose up worker",
    });
  } catch (err) {
    console.error("Cron error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Cron failed", details: err instanceof Error ? err.message.slice(0, 200) : "Unknown" }, { status: 500 });
  }
}

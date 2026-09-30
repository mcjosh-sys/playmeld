import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncJobs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * Vercel Cron endpoint to process pending sync jobs when Redis/BullMQ not available
 * Runs every 5 minutes via vercel.json crons
 * 
 * For production with BullMQ, this is fallback - main processing via worker
 * For Vercel without Redis, this processes up to 5 pending jobs per run
 * 
 * Security: Should verify cron secret header from Vercel
 */

export async function GET(req: NextRequest) {
  // Verify cron secret if set (Vercel adds Authorization header for crons)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow if no secret configured (dev) or if header matches
    // Vercel Cron will send Authorization: Bearer <CRON_SECRET> if configured
    if (process.env.NODE_ENV === "production" && cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Find pending jobs (max 5 per cron run to avoid timeout)
    const pendingJobs = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.status, "pending"))
      .limit(5);

    if (pendingJobs.length === 0) {
      return NextResponse.json({ message: "No pending jobs", processed: 0 });
    }

    console.log(`Cron found ${pendingJobs.length} pending jobs`);

    // For Vercel, we can't process long-running jobs in cron (max 60s)
    // So we just log and return - actual processing should be via BullMQ worker
    // Or we can attempt to process one job if REDIS_URL not set and we're in fallback mode

    const results = [];

    for (const job of pendingJobs) {
      // Check if job is old (more than 5 minutes pending) - might be stuck
      const ageMinutes = (Date.now() - new Date(job.createdAt).getTime()) / 1000 / 60;
      
      if (ageMinutes > 5) {
        console.log(`Job ${job.id} pending for ${ageMinutes.toFixed(1)} minutes, needs processing`);
        results.push({
          jobId: job.id,
          ageMinutes: Math.round(ageMinutes),
          status: "needs_processing",
          action: "Enqueue to BullMQ or process via /api/sync-jobs/[id]/process",
        });
      }
    }

    return NextResponse.json({
      message: `Found ${pendingJobs.length} pending jobs`,
      processed: 0,
      pending: results,
      note: "For Vercel deployment, run BullMQ worker separately (e.g., on Railway, Fly.io, or Docker). This cron is fallback monitoring.",
    });
  } catch (err) {
    console.error("Cron error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

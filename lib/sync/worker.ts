/**
 * BullMQ Worker for sync jobs - Now uses shared processor for consistency
 * Processes sync jobs from queue, handles retries, partial failures, idempotency
 * Can run as separate process: `npm run worker` or via Docker
 * 
 * For Vercel: This worker should run as separate service (e.g., Railway, Fly.io, or Docker)
 * For containerized: Run via docker-compose with Redis
 * For local dev: Run `npm run worker:dev` with local Redis
 * 
 * Fix for Pending stuck: Worker now uses shared processor from processor.ts
 * Also includes fallback polling for pending jobs when Redis available but worker not running? No, worker IS the processor.
 * Fallback processing is in POST /api/sync-jobs which triggers direct processing if job still pending after 3s
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "@/lib/queue";
import { SyncJobData } from "@/lib/queue";
import { processSyncJobDirect } from "@/lib/sync/processor";

async function processSyncJob(job: Job<SyncJobData>) {
  const { syncJobId, userId } = job.data;

  console.log(`[Worker] Processing sync job ${syncJobId} for user ${userId}, attempt ${job.attemptsMade + 1}, BullMQ id ${job.id}`);

  try {
    const result = await processSyncJobDirect(
      syncJobId,
      userId,
      async (progress) => {
        // Update BullMQ job progress
        const percent = progress.totalTracks > 0 ? (progress.processedTracks / progress.totalTracks) * 100 : 0;
        await job.updateProgress(percent);
      },
      async () => {
        // Check cancellation via BullMQ job? For now, check DB via processor's internal check
        // Processor already checks DB for cancelled status
        return false;
      }
    );

    console.log(`[Worker] Job ${syncJobId} completed via processor:`, result.status, result.summary);

    return result;
  } catch (err) {
    console.error(`[Worker] Error processing sync job ${syncJobId}`, err instanceof Error ? err.message : err);
    // Throw to trigger BullMQ retry with backoff if retryable
    throw err;
  }
}

// Worker setup
export function createSyncWorker() {
  const connection = getRedisConnection();

  const worker = new Worker<SyncJobData>("sync-jobs", processSyncJob, {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`, job.returnvalue);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error", err);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`[Worker] Job ${jobId} stalled`);
  });

  worker.on("active", (job) => {
    console.log(`[Worker] Job ${job.id} active`);
  });

  console.log("[Worker] BullMQ sync worker started, concurrency 5, limiter 10/sec, using shared processor.ts");

  return worker;
}

// Fallback polling worker for when Redis is available but we want to also poll DB for pending jobs
// This can help if jobs were created via DB fallback and not enqueued to BullMQ
export function createFallbackPollingWorker(intervalMs: number = 10000) {
  console.log(`[FallbackPolling] Starting fallback polling every ${intervalMs}ms for pending jobs without BullMQ`);

  const poll = async () => {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const { drizzle } = await import("drizzle-orm/neon-http");
      const schema = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");

      if (!process.env.DATABASE_URL) return;

      const sql = neon(process.env.DATABASE_URL);
      const db = drizzle(sql, { schema });

      const pendingJobs = await db
        .select()
        .from(schema.syncJobs)
        .where(eq(schema.syncJobs.status, "pending"))
        .limit(3);

      if (pendingJobs.length > 0) {
        console.log(`[FallbackPolling] Found ${pendingJobs.length} pending jobs, processing directly`);

        for (const job of pendingJobs) {
          try {
            // Check age - only process jobs pending > 10 seconds to give BullMQ chance
            const ageSec = (Date.now() - new Date(job.createdAt).getTime()) / 1000;
            if (ageSec < 10) {
              console.log(`[FallbackPolling] Job ${job.id} only ${ageSec.toFixed(1)}s old, skipping to give BullMQ worker chance`);
              continue;
            }

            console.log(`[FallbackPolling] Processing pending job ${job.id} directly (age ${ageSec.toFixed(1)}s)`);
            const result = await processSyncJobDirect(job.id, job.userId);
            console.log(`[FallbackPolling] Job ${job.id} completed: ${result.status}`);
          } catch (err) {
            console.error(`[FallbackPolling] Failed to process job ${job.id}`, err instanceof Error ? err.message : err);
          }
        }
      }
    } catch (err) {
      console.error("[FallbackPolling] Poll error", err);
    }
  };

  // Initial poll after 5s, then interval
  setTimeout(poll, 5000);
  const interval = setInterval(poll, intervalMs);

  return {
    close: () => clearInterval(interval),
  };
}

// If run directly: `npm run worker`
if (require.main === module) {
  console.log("Starting PlayMeld sync worker...");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  if (!process.env.REDIS_URL && !process.env.UPSTASH_REDIS_URL) {
    console.warn("REDIS_URL not set, trying localhost:6379");
    process.env.REDIS_URL = "redis://localhost:6379";
  }

  const worker = createSyncWorker();
  const fallbackPolling = createFallbackPollingWorker(15000); // Poll every 15s for DB pending jobs

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker and fallback polling...");
    await worker.close();
    fallbackPolling.close();
    // Close queue and redis via queue.ts
    const { closeQueue } = await import("@/lib/queue");
    await closeQueue();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

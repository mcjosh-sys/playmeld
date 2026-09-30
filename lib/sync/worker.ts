/**
 * BullMQ Worker for sync jobs
 * Processes sync jobs from queue, handles retries, partial failures, idempotency
 * Can run as separate process: `npm run worker` or via Docker
 * 
 * For Vercel: This worker should run as separate service (e.g., Railway, Fly.io, or Docker)
 * For containerized: Run via docker-compose with Redis
 * For local dev: Run `npm run worker:dev` with local Redis
 */

import { Worker, Job } from "bullmq";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getProvider } from "@/lib/providers/factory";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { SyncEngine } from "@/lib/sync/engine";
import { ProviderError } from "@/lib/providers/errors";
import { getRedisConnection } from "@/lib/queue";
import { SyncJobData } from "@/lib/queue";

// Setup DB - use Neon HTTP driver for serverless compatibility
// For worker, we might want to use postgres driver for better performance with long-running connections
// But neon-http works for MVP
function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}

async function processSyncJob(job: Job<SyncJobData>) {
  const { syncJobId, userId, sourceAccountId, destinationAccountId, sourcePlaylistId } = job.data;

  console.log(`Processing sync job ${syncJobId} for user ${userId}, attempt ${job.attemptsMade + 1}`);

  const db = getDb();

  // Load job with ownership check - security: worker must verify job belongs to user
  const [syncJob] = await db
    .select()
    .from(schema.syncJobs)
    .where(and(eq(schema.syncJobs.id, syncJobId), eq(schema.syncJobs.userId, userId)))
    .limit(1);

  if (!syncJob) {
    throw new Error(`Sync job ${syncJobId} not found or not owned by user ${userId}`);
  }

  // Check if already cancelled
  if (syncJob.status === "cancelled") {
    console.log(`Sync job ${syncJobId} already cancelled, skipping`);
    return { status: "cancelled" };
  }

  // Load accounts with ownership verification
  const [sourceAccount] = await db
    .select()
    .from(schema.connectedAccounts)
    .where(and(eq(schema.connectedAccounts.id, sourceAccountId), eq(schema.connectedAccounts.userId, userId)))
    .limit(1);

  const [destAccount] = await db
    .select()
    .from(schema.connectedAccounts)
    .where(and(eq(schema.connectedAccounts.id, destinationAccountId), eq(schema.connectedAccounts.userId, userId)))
    .limit(1);

  if (!sourceAccount || !destAccount) {
    throw new Error(`Connected accounts not found for job ${syncJobId}`);
  }

  // Check usage limits server-side (billing enforcement)
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [usage] = await db
    .select()
    .from(schema.usageRecords)
    .where(and(eq(schema.usageRecords.userId, userId), eq(schema.usageRecords.month, currentMonth)))
    .limit(1);

  // Get workspace plan
  let planId = "free";
  if (syncJob.workspaceId) {
    const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, syncJob.workspaceId)).limit(1);
    if (workspace) {
      planId = workspace.plan;
    }
  }

  // Import plan limits dynamically to avoid circular deps
  const { getPlanLimits, isWithinLimit } = await import("@/lib/billing/plans");
  const limits = getPlanLimits(planId);

  if (limits.maxSyncsPerMonth !== -1) {
    const currentCount = usage?.syncCount || 0;
    if (currentCount >= limits.maxSyncsPerMonth) {
      throw new Error(`Monthly sync limit reached for plan ${planId}: ${limits.maxSyncsPerMonth} syncs/month`);
    }
  }

  // Mark job as running
  await db
    .update(schema.syncJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.syncJobs.id, syncJobId));

  // Create sync run
  const [run] = await db
    .insert(schema.syncRuns)
    .values({
      syncJobId,
      status: "running",
    })
    .returning();

  try {
    // Decrypt tokens - secrets never logged
    let sourceToken = decryptToken(sourceAccount.accessTokenEncrypted);
    let destToken = decryptToken(destAccount.accessTokenEncrypted);

    const sourceProvider = getProvider(sourceAccount.provider as any);
    const destProvider = getProvider(destAccount.provider as any);

    // Check track limits for plan
    const maxTracks = limits.maxTracksPerSync;

    const engine = new SyncEngine(70);

    let cancelled = false;
    const isCancelled = async () => {
      const [currentJob] = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, syncJobId)).limit(1);
      if (currentJob?.status === "cancelled") {
        cancelled = true;
        return true;
      }
      return false;
    };

    const result = await engine.execute({
      sourceProvider,
      destinationProvider: destProvider,
      sourceAccessToken: sourceToken,
      destinationAccessToken: destToken,
      sourcePlaylistId: syncJob.sourcePlaylistId,
      sourcePlaylistName: syncJob.sourcePlaylistName || undefined,
      destinationPlaylistId: syncJob.destinationPlaylistId || undefined,
      config: syncJob.config as any,
      onProgress: async (progress) => {
        // Update job progress - avoid excessive writes
        // Only update every 10 tracks or on phase change
        if (progress.processedTracks % 10 === 0 || progress.phase === "completed" || progress.phase === "creating_playlist") {
          await db
            .update(schema.syncJobs)
            .set({
              progress: progress as any,
              totalTracks: progress.totalTracks,
              processedTracks: progress.processedTracks,
              matchedTracks: progress.matchedTracks,
              unmatchedTracks: progress.unmatchedTracks,
              failedTracks: progress.failedTracks,
              updatedAt: new Date(),
            })
            .where(eq(schema.syncJobs.id, syncJobId));

          // Update BullMQ job progress
          await job.updateProgress(progress.processedTracks / (progress.totalTracks || 1) * 100);
        }
      },
      isCancelled,
    });

    if (result.status === "cancelled" || cancelled) {
      await db
        .update(schema.syncJobs)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.syncJobs.id, syncJobId));

      await db
        .update(schema.syncRuns)
        .set({
          status: "cancelled",
          completedAt: new Date(),
        })
        .where(eq(schema.syncRuns.id, run.id));

      return { status: "cancelled" };
    }

    // Enforce track limit for plan
    if (maxTracks !== -1 && result.summary.total > maxTracks) {
      console.warn(`Track limit exceeded for plan ${planId}: ${result.summary.total} > ${maxTracks}, but allowing for now with warning`);
      // For free plan, we should truncate or fail? For now, allow but log
      // In strict enforcement, we would fail the job or truncate tracksToAdd
    }

    // Persist results
    await db
      .update(schema.syncJobs)
      .set({
        status: result.status as any,
        destinationPlaylistId: result.destinationPlaylistId,
        destinationPlaylistUrl: result.destinationPlaylistUrl,
        totalTracks: result.summary.total,
        matchedTracks: result.summary.matched,
        unmatchedTracks: result.summary.unmatched,
        failedTracks: result.summary.failed,
        processedTracks: result.summary.total,
        completedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: result.error,
      })
      .where(eq(schema.syncJobs.id, syncJobId));

    await db
      .update(schema.syncRuns)
      .set({
        status: result.status as any,
        completedAt: new Date(),
        errorMessage: result.error,
        metadata: {
          summary: result.summary,
          destinationPlaylistId: result.destinationPlaylistId,
        } as any,
      })
      .where(eq(schema.syncRuns.id, run.id));

    // Insert sync items in batches
    if (result.trackResults.length > 0) {
      const itemsToInsert = result.trackResults.map((tr, idx) => ({
        syncRunId: run.id,
        syncJobId,
        position: idx,
        sourceTrack: tr.sourceTrack as any,
        destinationTrack: tr.destinationTrack as any,
        status: tr.status as any,
        confidence: tr.confidence,
        errorMessage: tr.error,
        isRetryable: tr.isRetryable,
      }));

      const batchSize = 100;
      for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const batch = itemsToInsert.slice(i, i + batchSize);
        await db.insert(schema.syncItems).values(batch);
      }
    }

    // Update usage count
    if (usage) {
      await db
        .update(schema.usageRecords)
        .set({
          syncCount: usage.syncCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.usageRecords.id, usage.id));
    } else {
      await db.insert(schema.usageRecords).values({
        userId,
        workspaceId: syncJob.workspaceId,
        month: currentMonth,
        syncCount: 1,
      });
    }

    console.log(`Sync job ${syncJobId} completed with status ${result.status}`, result.summary);

    return {
      status: result.status,
      summary: result.summary,
      destinationPlaylistId: result.destinationPlaylistId,
    };
  } catch (err) {
    console.error(`Error processing sync job ${syncJobId}`, err instanceof Error ? err.message : err);

    const isRetryable = err instanceof ProviderError ? err.retryable : false;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Check if we should retry
    if (isRetryable && job.attemptsMade < (job.opts.attempts || 3) - 1) {
      // Update job to pending for retry, but let BullMQ handle backoff
      await db
        .update(schema.syncJobs)
        .set({
          errorMessage: `Retryable error (attempt ${job.attemptsMade + 1}): ${errorMessage}`,
          retryCount: job.attemptsMade + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.syncJobs.id, syncJobId));

      // Throw to trigger BullMQ retry with backoff
      throw err;
    }

    // Permanent failure
    await db
      .update(schema.syncJobs)
      .set({
        status: "failed",
        errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.syncJobs.id, syncJobId));

    await db
      .update(schema.syncRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(schema.syncRuns.id, run.id));

    throw err;
  }
}

// Worker setup
export function createSyncWorker() {
  const connection = getRedisConnection();

  const worker = new Worker<SyncJobData>("sync-jobs", processSyncJob, {
    connection,
    concurrency: 5, // Process up to 5 jobs concurrently
    limiter: {
      max: 10,
      duration: 1000, // Max 10 jobs per second to respect provider rate limits
    },
  });

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`, job.returnvalue);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed`, err.message);
  });

  worker.on("error", (err) => {
    console.error("Worker error", err);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`Job ${jobId} stalled`);
  });

  console.log("BullMQ sync worker started, concurrency 5, limiter 10/sec");

  return worker;
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

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

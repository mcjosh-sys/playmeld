/**
 * BullMQ queue for sync jobs
 * Handles Redis connection, queue creation, and job enqueueing
 * Works both locally (with Redis) and on Vercel (with Upstash Redis or fallback)
 * 
 * For Vercel deployment: Use Upstash Redis (REDIS_URL) or other Redis provider
 * For local dev: Use local Redis or Docker Redis
 * For containerized: Use Docker Compose Redis service
 */

import { Queue, QueueOptions } from "bullmq";
import IORedis from "ioredis";

let redisConnection: IORedis | null = null;
let syncQueue: Queue | null = null;

function getRedisUrl(): string | null {
  // Check various env vars for Redis URL
  return (
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    process.env.KV_URL ||
    "redis://localhost:6379"
  );
}

export function getRedisConnection(): IORedis {
  if (redisConnection) {
    return redisConnection;
  }

  const redisUrl = getRedisUrl();
  
  if (!redisUrl) {
    throw new Error("REDIS_URL not set - required for BullMQ");
  }

  // For Upstash Redis, need special handling
  const isUpstash = redisUrl.includes("upstash") || process.env.UPSTASH_REDIS_URL;

  if (isUpstash) {
    // Upstash uses REST API, but ioredis can still connect with TLS
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: {
        rejectUnauthorized: false,
      },
    });
  } else {
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  redisConnection.on("connect", () => {
    console.log("Redis connected for BullMQ");
  });

  redisConnection.on("error", (err) => {
    console.error("Redis connection error", err.message);
  });

  return redisConnection;
}

export function getSyncQueue(): Queue {
  if (syncQueue) {
    return syncQueue;
  }

  // Check if Redis is available, otherwise throw - caller should handle fallback
  const redisUrl = getRedisUrl();
  if (!redisUrl && process.env.NODE_ENV === "production") {
    console.warn("REDIS_URL not set in production - sync jobs will use fallback");
  }

  try {
    const connection = getRedisConnection();

    const queueOptions: QueueOptions = {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // 5s, 25s, 125s
        },
        removeOnComplete: {
          age: 3600, // keep completed jobs for 1 hour
          count: 1000,
        },
        removeOnFail: {
          age: 24 * 3600, // keep failed for 24 hours
        },
      },
    };

    syncQueue = new Queue("sync-jobs", queueOptions);

    console.log("BullMQ sync queue initialized");

    return syncQueue;
  } catch (err) {
    console.error("Failed to initialize BullMQ queue", err);
    throw err;
  }
}

export interface SyncJobData {
  syncJobId: string;
  userId: string;
  workspaceId?: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourcePlaylistId: string;
  retryCount?: number;
}

export async function enqueueSyncJob(data: SyncJobData): Promise<string> {
  try {
    const queue = getSyncQueue();
    
    const job = await queue.add("process-sync", data, {
      jobId: `sync-${data.syncJobId}-${Date.now()}`, // unique job id to avoid duplicates
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });

    console.log(`Enqueued sync job ${data.syncJobId} with BullMQ job id ${job.id}`);

    return job.id || data.syncJobId;
  } catch (err) {
    // Fallback: if Redis not available, log and return syncJobId
    // The API route can then process directly or mark as pending for later
    console.warn("Failed to enqueue with BullMQ, using fallback", err instanceof Error ? err.message : err);
    
    // In fallback mode, we don't have a queue, so we return the syncJobId
    // The caller should handle direct processing or DB polling
    return data.syncJobId;
  }
}

export async function getQueueMetrics() {
  try {
    const queue = getSyncQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  } catch (err) {
    console.error("Failed to get queue metrics", err);
    return null;
  }
}

export async function closeQueue(): Promise<void> {
  if (syncQueue) {
    await syncQueue.close();
    syncQueue = null;
  }
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}

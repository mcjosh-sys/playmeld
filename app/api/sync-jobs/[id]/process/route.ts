import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs, connectedAccounts, syncRuns, syncItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getProvider } from "@/lib/providers/factory";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { SyncEngine } from "@/lib/sync/engine";
import { ProviderError } from "@/lib/providers/errors";

export const runtime = "nodejs";

/**
 * Process a sync job - this is the worker endpoint
 * In production, this would be a background worker (BullMQ, pg-boss, etc)
 * For MVP, it's an API route that processes the job async
 * 
 * Security: Must verify job belongs to authenticated user (or internal worker auth)
 * For now, requires user auth, but worker should also verify job ownership
 */

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = params.id;

  // Load job with ownership check
  const [job] = await db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.id, jobId), eq(syncJobs.userId, session.user.id)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Sync job not found" }, { status: 404 });
  }

  if (job.status !== "pending") {
    return NextResponse.json({ error: `Job already in status ${job.status}` }, { status: 400 });
  }

  // Load accounts with ownership verification
  const [sourceAccount] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.id, job.sourceAccountId), eq(connectedAccounts.userId, session.user.id)))
    .limit(1);

  const [destAccount] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.id, job.destinationAccountId), eq(connectedAccounts.userId, session.user.id)))
    .limit(1);

  if (!sourceAccount || !destAccount) {
    return NextResponse.json({ error: "Connected accounts not found" }, { status: 404 });
  }

  try {
    // Mark job as running
    await db
      .update(syncJobs)
      .set({
        status: "running",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, jobId));

    // Create sync run
    const [run] = await db
      .insert(syncRuns)
      .values({
        syncJobId: jobId,
        status: "running",
      })
      .returning();

    // Decrypt tokens
    let sourceToken = decryptToken(sourceAccount.accessTokenEncrypted);
    let destToken = decryptToken(destAccount.accessTokenEncrypted);

    const sourceProvider = getProvider(sourceAccount.provider as any);
    const destProvider = getProvider(destAccount.provider as any);

    // Helper to refresh tokens if needed
    const refreshIfNeeded = async (provider: any, account: typeof sourceAccount, currentToken: string): Promise<string> => {
      // In real implementation, check expiry and refresh
      // For now, assume token is valid, but handle auth errors during execution
      return currentToken;
    };

    sourceToken = await refreshIfNeeded(sourceProvider, sourceAccount, sourceToken);
    destToken = await refreshIfNeeded(destProvider, destAccount, destToken);

    const engine = new SyncEngine(70);

    // Track if cancelled
    let cancelled = false;
    const isCancelled = async () => {
      const [currentJob] = await db.select().from(syncJobs).where(eq(syncJobs.id, jobId)).limit(1);
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
      sourcePlaylistId: job.sourcePlaylistId,
      sourcePlaylistName: job.sourcePlaylistName || undefined,
      destinationPlaylistId: job.destinationPlaylistId || undefined,
      config: job.config as any,
      onProgress: async (progress) => {
        // Update job progress - avoid excessive writes (only every 10 tracks or phase change)
        await db
          .update(syncJobs)
          .set({
            progress: progress as any,
            totalTracks: progress.totalTracks,
            processedTracks: progress.processedTracks,
            matchedTracks: progress.matchedTracks,
            unmatchedTracks: progress.unmatchedTracks,
            failedTracks: progress.failedTracks,
            updatedAt: new Date(),
          })
          .where(eq(syncJobs.id, jobId));
      },
      isCancelled,
    });

    if (result.status === "cancelled" || cancelled) {
      await db
        .update(syncJobs)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncJobs.id, jobId));

      await db
        .update(syncRuns)
        .set({
          status: "cancelled",
          completedAt: new Date(),
        })
        .where(eq(syncRuns.id, run.id));

      return NextResponse.json({ data: { status: "cancelled" } });
    }

    // Persist results
    // Update job with final status and counts
    await db
      .update(syncJobs)
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
      .where(eq(syncJobs.id, jobId));

    // Update run
    await db
      .update(syncRuns)
      .set({
        status: result.status as any,
        completedAt: new Date(),
        errorMessage: result.error,
        metadata: {
          summary: result.summary,
          destinationPlaylistId: result.destinationPlaylistId,
        } as any,
      })
      .where(eq(syncRuns.id, run.id));

    // Insert sync items
    if (result.trackResults.length > 0) {
      const itemsToInsert = result.trackResults.map((tr, idx) => ({
        syncRunId: run.id,
        syncJobId: jobId,
        position: idx,
        sourceTrack: tr.sourceTrack as any,
        destinationTrack: tr.destinationTrack as any,
        status: tr.status as any,
        confidence: tr.confidence,
        errorMessage: tr.error,
        isRetryable: tr.isRetryable,
      }));

      // Insert in batches to avoid huge insert
      const batchSize = 100;
      for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const batch = itemsToInsert.slice(i, i + batchSize);
        await db.insert(syncItems).values(batch);
      }
    }

    return NextResponse.json({
      data: {
        jobId,
        status: result.status,
        summary: result.summary,
        destinationPlaylistId: result.destinationPlaylistId,
      },
    });
  } catch (err) {
    console.error("Error processing sync job", err instanceof Error ? err.message : err);

    // Check if retryable
    const isRetryable = err instanceof ProviderError ? err.retryable : false;
    const currentRetry = job.retryCount || 0;
    const maxRetries = job.maxRetries || 3;

    if (isRetryable && currentRetry < maxRetries) {
      // Schedule retry - for MVP, just mark pending again with incremented retry
      await db
        .update(syncJobs)
        .set({
          status: "pending",
          retryCount: currentRetry + 1,
          errorMessage: err instanceof Error ? err.message : "Retryable error",
          updatedAt: new Date(),
        })
        .where(eq(syncJobs.id, jobId));

      return NextResponse.json(
        {
          data: { status: "pending", retryCount: currentRetry + 1 },
          message: "Job scheduled for retry",
        },
        { status: 202 }
      );
    }

    // Permanent failure
    await db
      .update(syncJobs)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, jobId));

    return NextResponse.json({ error: "Sync failed", details: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

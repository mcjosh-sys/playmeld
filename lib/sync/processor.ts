/**
 * Direct sync job processor - can be called without BullMQ/Redis
 * Used as fallback when Redis not available (e.g., Vercel without Upstash)
 * Also used by BullMQ worker and /api/sync-jobs/[id]/process endpoint
 * 
 * Extracted from process route to allow reuse in queue fallback and cron
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getProvider } from "@/lib/providers/factory";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { SyncEngine } from "@/lib/sync/engine";
import { ProviderError, ProviderAuthenticationError } from "@/lib/providers/errors";
import { MusicProvider } from "@/lib/providers/types";
import { getPlanLimits } from "@/lib/billing/plans";

function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}

/**
 * Check if an access token is expired (or about to expire) and refresh it if needed.
 * Google OAuth2 access tokens typically expire after 1 hour.
 * Returns a valid access token, refreshing and persisting new tokens to DB if necessary.
 */
async function ensureFreshToken(
  db: ReturnType<typeof getDb>,
  account: typeof schema.connectedAccounts.$inferSelect,
  provider: MusicProvider & { refreshAccessToken?: (refreshToken: string) => Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> }
): Promise<string> {
  const currentToken = decryptToken(account.accessTokenEncrypted);

  // Check if token is expired or will expire within 5 minutes
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  const now = Date.now();
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : null;

  if (expiresAt && expiresAt - now > bufferMs) {
    // Token is still fresh
    return currentToken;
  }

  // Token is expired or expiry unknown — try to refresh
  if (!account.refreshTokenEncrypted) {
    console.warn(`[Token] No refresh token for account ${account.id} (${account.provider}), using existing access token`);
    return currentToken;
  }

  if (!provider.refreshAccessToken) {
    console.warn(`[Token] Provider ${account.provider} does not support token refresh, using existing access token`);
    return currentToken;
  }

  const refreshToken = decryptToken(account.refreshTokenEncrypted);

  try {
    console.log(`[Token] Refreshing expired access token for account ${account.id} (${account.provider})`);
    const refreshed = await provider.refreshAccessToken(refreshToken);

    // Persist new tokens to DB
    const updates: Record<string, any> = {
      accessTokenEncrypted: encryptToken(refreshed.accessToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      updatedAt: new Date(),
    };

    // Some providers return a new refresh token (Google sometimes does on re-grant)
    if (refreshed.refreshToken) {
      updates.refreshTokenEncrypted = encryptToken(refreshed.refreshToken);
    }

    await db
      .update(schema.connectedAccounts)
      .set(updates)
      .where(eq(schema.connectedAccounts.id, account.id));

    console.log(`[Token] Successfully refreshed token for account ${account.id} (${account.provider}), new expiry: ${updates.tokenExpiresAt.toISOString()}`);
    return refreshed.accessToken;
  } catch (err) {
    // If refresh fails with auth error, the refresh token itself is invalid
    if (err instanceof ProviderAuthenticationError) {
      console.error(`[Token] Refresh token invalid for account ${account.id} (${account.provider}). User must reconnect.`);
      // Mark the account as needing reconnection
      await db
        .update(schema.connectedAccounts)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.connectedAccounts.id, account.id));
      throw new Error(
        `${account.provider} authentication expired for account "${account.displayName || account.providerAccountId}". Please reconnect this account in /dashboard/connections.`
      );
    }

    // For transient errors, fall back to existing token (it might still work)
    console.warn(`[Token] Failed to refresh token for account ${account.id} (${account.provider}), using existing token:`, err instanceof Error ? err.message : err);
    return currentToken;
  }
}

export interface ProcessResult {
  status: string;
  summary?: any;
  destinationPlaylistId?: string;
  destinationPlaylistUrl?: string;
  error?: string;
}

export async function processSyncJobDirect(
  syncJobId: string,
  userId: string,
  onProgress?: (progress: any) => void | Promise<void>,
  isCancelled?: () => boolean | Promise<boolean>
): Promise<ProcessResult> {
  const db = getDb();

  const [syncJob] = await db
    .select()
    .from(schema.syncJobs)
    .where(and(eq(schema.syncJobs.id, syncJobId), eq(schema.syncJobs.userId, userId)))
    .limit(1);

  if (!syncJob) {
    throw new Error(`Sync job ${syncJobId} not found or not owned by user ${userId}`);
  }

  if (syncJob.status === "cancelled") {
    return { status: "cancelled" };
  }

  if (syncJob.status !== "pending" && syncJob.status !== "running") {
    // Allow re-processing if failed? For now, only allow pending
    if (syncJob.status !== "failed") {
      throw new Error(`Job already in status ${syncJob.status}, cannot process`);
    }
  }

  const [sourceAccount] = await db
    .select()
    .from(schema.connectedAccounts)
    .where(and(eq(schema.connectedAccounts.id, syncJob.sourceAccountId), eq(schema.connectedAccounts.userId, userId)))
    .limit(1);

  const [destAccount] = await db
    .select()
    .from(schema.connectedAccounts)
    .where(and(eq(schema.connectedAccounts.id, syncJob.destinationAccountId), eq(schema.connectedAccounts.userId, userId)))
    .limit(1);

  if (!sourceAccount || !destAccount) {
    throw new Error(`Connected accounts not found for job ${syncJobId}`);
  }

  if (!sourceAccount.isActive || !destAccount.isActive) {
    throw new Error(`One or both connected accounts are disconnected`);
  }

  if (sourceAccount.accessTokenEncrypted === "DISCONNECTED" || destAccount.accessTokenEncrypted === "DISCONNECTED") {
    throw new Error(`One or both accounts have cleared tokens, please reconnect`);
  }

  // Check usage limits
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [usage] = await db
    .select()
    .from(schema.usageRecords)
    .where(and(eq(schema.usageRecords.userId, userId), eq(schema.usageRecords.month, currentMonth)))
    .limit(1);

  let planId = "free";
  if (syncJob.workspaceId) {
    const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, syncJob.workspaceId)).limit(1);
    if (workspace) planId = workspace.plan;
  }

  const limits = getPlanLimits(planId);

  if (limits.maxSyncsPerMonth !== -1) {
    const currentCount = usage?.syncCount || 0;
    if (currentCount >= limits.maxSyncsPerMonth) {
      throw new Error(`Monthly sync limit reached for plan ${planId}: ${limits.maxSyncsPerMonth} syncs/month`);
    }
  }

  // Mark running
  await db
    .update(schema.syncJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.syncJobs.id, syncJobId));

  const [run] = await db
    .insert(schema.syncRuns)
    .values({
      syncJobId,
      status: "running",
    })
    .returning();

  try {
    const sourceProvider = getProvider(sourceAccount.provider as any);
    const destProvider = getProvider(destAccount.provider as any);

    // Refresh expired tokens before use (Google tokens expire after ~1 hour)
    let sourceToken = await ensureFreshToken(db, sourceAccount, sourceProvider);
    let destToken = await ensureFreshToken(db, destAccount, destProvider);

    const engine = new SyncEngine(70, 60);

    let cancelled = false;
    const checkCancelled = async () => {
      if (isCancelled) {
        const result = await isCancelled();
        if (result) cancelled = true;
        return result;
      }
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
        }
        if (onProgress) await onProgress(progress);
      },
      isCancelled: checkCancelled,
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
        errorMessage: result.error || null,
      })
      .where(eq(schema.syncJobs.id, syncJobId));

    await db
      .update(schema.syncRuns)
      .set({
        status: result.status as any,
        completedAt: new Date(),
        errorMessage: result.error || null,
        metadata: {
          summary: result.summary,
          destinationPlaylistId: result.destinationPlaylistId,
        } as any,
      })
      .where(eq(schema.syncRuns.id, run.id));

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
      destinationPlaylistUrl: result.destinationPlaylistUrl,
    };
  } catch (err) {
    console.error(`Error processing sync job ${syncJobId}`, err instanceof Error ? err.message : err);

    const isRetryable = err instanceof ProviderError ? err.retryable : false;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // For direct processing without BullMQ, we don't auto-retry, we mark failed
    // BullMQ worker will handle retries via throw
    if (isRetryable) {
      // For retryable, mark as pending for retry if we are in BullMQ context? 
      // For direct, mark failed but with retryable flag
      const [currentJob] = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, syncJobId)).limit(1);
      const currentRetry = currentJob?.retryCount || 0;
      const maxRetries = currentJob?.maxRetries || 3;

      if (currentRetry < maxRetries) {
        await db
          .update(schema.syncJobs)
          .set({
            status: "pending",
            retryCount: currentRetry + 1,
            errorMessage: `Retryable error (attempt ${currentRetry + 1}): ${errorMessage}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.syncJobs.id, syncJobId));

        // If called from BullMQ worker, throw to trigger backoff retry
        // If called directly, we return pending to allow manual retry
        if (onProgress) {
          // Assume BullMQ context if onProgress provided? Actually we need better detection
          // For now, throw to trigger BullMQ retry
          throw err;
        }

        return {
          status: "pending",
          error: `Scheduled for retry (attempt ${currentRetry + 1}): ${errorMessage}`,
        };
      }
    }

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

    return {
      status: "failed",
      error: errorMessage,
    };
  }
}

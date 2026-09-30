/**
 * Sync Engine - core domain workflow
 * 
 * Conceptual flow:
 * Source playlist -> Read source metadata -> Read all source tracks -> Normalize -> Resolve destination matches -> Plan changes -> Apply changes -> Record per-track results -> Finalize SyncRun
 * 
 * Must be provider-agnostic, resumable, idempotent, observable, tolerant of partial failure, safe to retry
 */

import { MusicProvider, NormalizedTrack, ProviderName } from "../providers/types";
import { TrackMatcher } from "./matcher";
import { createSyncPlan, SyncPlan } from "./planner";
import { ProviderError } from "../providers/errors";

export interface SyncEngineInput {
  sourceProvider: MusicProvider;
  destinationProvider: MusicProvider;
  sourceAccessToken: string;
  destinationAccessToken: string;
  sourcePlaylistId: string;
  sourcePlaylistName?: string;
  destinationPlaylistId?: string; // if not creating new
  config: {
    createNewPlaylist: boolean;
    preserveDuplicates: boolean;
    preserveOrder: boolean;
    destinationPlaylistName?: string;
    destinationPlaylistDescription?: string;
    isPublic?: boolean;
  };
  // For progress reporting
  onProgress?: (progress: SyncProgress) => void | Promise<void>;
  // For cancellation check
  isCancelled?: () => boolean | Promise<boolean>;
}

export interface SyncProgress {
  phase: "reading_source" | "matching" | "planning" | "creating_playlist" | "adding_tracks" | "completed";
  totalTracks: number;
  processedTracks: number;
  matchedTracks: number;
  unmatchedTracks: number;
  failedTracks: number;
  addedTracks: number;
  message?: string;
}

export interface SyncTrackResult {
  sourceTrack: NormalizedTrack;
  destinationTrack?: NormalizedTrack;
  status: "matched" | "unmatched" | "added" | "skipped" | "failed";
  confidence?: number;
  error?: string;
  isRetryable?: boolean;
}

export interface SyncEngineResult {
  plan: SyncPlan;
  destinationPlaylistId?: string;
  destinationPlaylistUrl?: string;
  trackResults: SyncTrackResult[];
  summary: {
    total: number;
    matched: number;
    unmatched: number;
    added: number;
    skipped: number;
    failed: number;
  };
  status: "completed" | "completed_with_errors" | "failed" | "cancelled";
  error?: string;
}

export class SyncEngine {
  private matcher: TrackMatcher;

  constructor(matcherThreshold: number = 70, youtubeThreshold: number = 60) {
    // Improved: lower threshold for YouTube (60) because no ISRC and noisy titles, higher for others (70)
    this.matcher = new TrackMatcher(matcherThreshold, youtubeThreshold);
  }

  async execute(input: SyncEngineInput): Promise<SyncEngineResult> {
    const {
      sourceProvider,
      destinationProvider,
      sourceAccessToken,
      destinationAccessToken,
      sourcePlaylistId,
      destinationPlaylistId,
      config,
      onProgress,
      isCancelled,
    } = input;

    let totalTracks = 0;
    let processedTracks = 0;
    let matchedTracks = 0;
    let unmatchedTracks = 0;
    let failedTracks = 0;
    let addedTracks = 0;

    const reportProgress = async (phase: SyncProgress["phase"], message?: string) => {
      if (onProgress) {
        await onProgress({
          phase,
          totalTracks,
          processedTracks,
          matchedTracks,
          unmatchedTracks,
          failedTracks,
          addedTracks,
          message,
        });
      }
    };

    const checkCancelled = async (): Promise<boolean> => {
      if (!isCancelled) return false;
      return await isCancelled();
    };

    try {
      // Phase 1: Read source metadata and tracks (with pagination)
      await reportProgress("reading_source", "Reading source playlist tracks");
      
      if (await checkCancelled()) {
        return this.buildCancelledResult();
      }

      const sourceTracks: NormalizedTrack[] = [];
      let cursor: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        if (await checkCancelled()) {
          return this.buildCancelledResult();
        }

        try {
          const page = await sourceProvider.getPlaylistTracks(sourceAccessToken, sourcePlaylistId, cursor, 100);
          sourceTracks.push(...page.tracks);
          hasMore = page.hasMore;
          cursor = page.nextCursor;
          totalTracks = page.total ?? sourceTracks.length;
          
          await reportProgress("reading_source", `Read ${sourceTracks.length} tracks`);
        } catch (err) {
          // Partial failure handling - preserve successful progress
          if (err instanceof ProviderError && err.retryable) {
            // For transient errors during pagination, we should retry via job system, not tight loop
            // For now, throw to let job system handle retry
            throw err;
          }
          throw err;
        }
      }

      totalTracks = sourceTracks.length;
      await reportProgress("reading_source", `Found ${totalTracks} source tracks`);

      if (totalTracks === 0) {
        // Empty playlist works
        const emptyPlan = createSyncPlan({
          sourcePlaylistId,
          sourcePlaylistName: input.sourcePlaylistName || "Unknown",
          sourceTracks,
          matchResults: [],
          config,
        });
        return {
          plan: emptyPlan,
          trackResults: [],
          summary: { total: 0, matched: 0, unmatched: 0, added: 0, skipped: 0, failed: 0 },
          status: "completed",
        };
      }

      // Phase 2: Resolve destination matches
      await reportProgress("matching", "Matching tracks to destination provider");
      
      const matchResults = [];
      const trackResults: SyncTrackResult[] = [];

      for (let i = 0; i < sourceTracks.length; i++) {
        if (await checkCancelled()) {
          return this.buildCancelledResult();
        }

        const sourceTrack = sourceTracks[i];
        try {
          const query = this.matcher.buildSearchQuery(sourceTrack);
          const candidates = await destinationProvider.searchTracks(destinationAccessToken, query, 5);
          const match = this.matcher.match(sourceTrack, candidates);
          matchResults.push(match);

          if (match.status === "matched") {
            matchedTracks++;
            trackResults.push({
              sourceTrack,
              destinationTrack: match.matchedTrack,
              status: "matched",
              confidence: match.confidence,
            });
          } else {
            unmatchedTracks++;
            trackResults.push({
              sourceTrack,
              status: "unmatched",
              error: match.reason,
            });
          }
        } catch (err) {
          // Track matching failure - record as failed but continue (partial failure)
          failedTracks++;
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          const isRetryable = err instanceof ProviderError ? err.retryable : false;
          
          trackResults.push({
            sourceTrack,
            status: "failed",
            error: errorMessage,
            isRetryable,
          });
          
          // If it's a rate limit, we should propagate for job-level retry
          if (err instanceof ProviderError && err.code === "RATE_LIMIT") {
            throw err;
          }
        }

        processedTracks = i + 1;
        if (processedTracks % 10 === 0 || processedTracks === totalTracks) {
          await reportProgress("matching", `Matched ${processedTracks}/${totalTracks}`);
        }
      }

      // Phase 3: Plan destination changes
      await reportProgress("planning", "Planning destination changes");

      // For idempotency, read existing destination playlist tracks if not creating new
      let existingDestinationTracks: NormalizedTrack[] | undefined;
      if (!config.createNewPlaylist && destinationPlaylistId) {
        try {
          const existing: NormalizedTrack[] = [];
          let destCursor: string | undefined;
          let destHasMore = true;
          while (destHasMore) {
            const page = await destinationProvider.getPlaylistTracks(destinationAccessToken, destinationPlaylistId, destCursor, 100);
            existing.push(...page.tracks);
            destHasMore = page.hasMore;
            destCursor = page.nextCursor;
          }
          existingDestinationTracks = existing;
        } catch (err) {
          // If we can't read existing, proceed but log
          console.warn("Failed to read existing destination tracks for idempotency check", err);
        }
      }

      const plan = createSyncPlan({
        sourcePlaylistId,
        sourcePlaylistName: input.sourcePlaylistName || "Unknown",
        sourceTracks,
        matchResults,
        config,
        existingDestinationTracks,
      });

      if (await checkCancelled()) {
        return this.buildCancelledResult();
      }

      // Phase 4: Apply changes
      let finalDestinationPlaylistId = destinationPlaylistId;
      let finalDestinationPlaylistUrl: string | undefined;

      if (plan.destinationChanges.createPlaylist) {
        await reportProgress("creating_playlist", "Creating destination playlist");
        try {
          const newPlaylist = await destinationProvider.createPlaylist(destinationAccessToken, {
            name: plan.destinationChanges.playlistName,
            description: plan.destinationChanges.playlistDescription || `Melded from ${plan.sourcePlaylistName}`,
            isPublic: plan.destinationChanges.isPublic ?? false,
          });
          finalDestinationPlaylistId = newPlaylist.providerPlaylistId;
          finalDestinationPlaylistUrl = newPlaylist.url;
        } catch (err) {
          throw err;
        }
      }

      if (!finalDestinationPlaylistId) {
        throw new Error("Destination playlist ID not available");
      }

      // Add tracks in batches (provider handles batching)
      if (plan.destinationChanges.tracksToAdd.length > 0) {
        await reportProgress("adding_tracks", `Adding ${plan.destinationChanges.tracksToAdd.length} tracks`);

        const trackIds = plan.destinationChanges.tracksToAdd.map((t) => t.providerTrackId);
        
        try {
          await destinationProvider.addTracks(destinationAccessToken, finalDestinationPlaylistId, trackIds);
          
          // Update track results to "added"
          for (const result of trackResults) {
            if (result.status === "matched") {
              // Check if this track was actually added (idempotency)
              const wasAdded = plan.destinationChanges.tracksToAdd.some(
                (t) => t.providerTrackId === result.destinationTrack?.providerTrackId
              );
              if (wasAdded) {
                result.status = "added";
                addedTracks++;
              } else {
                result.status = "skipped";
              }
            }
          }
        } catch (err) {
          // Partial failure: some tracks may have been added before failure
          // We should not erase successful progress
          if (err instanceof ProviderError && err.retryable) {
            throw err;
          }
          // For non-retryable, mark remaining as failed but keep added count
          const errorMessage = err instanceof Error ? err.message : "Failed to add tracks";
          // Mark all matched not yet added as failed
          for (const result of trackResults) {
            if (result.status === "matched") {
              result.status = "failed";
              result.error = errorMessage;
              result.isRetryable = err instanceof ProviderError ? err.retryable : false;
              failedTracks++;
            }
          }
          throw err;
        }
      } else {
        // All tracks were skipped due to idempotency
        for (const result of trackResults) {
          if (result.status === "matched") {
            result.status = "skipped";
          }
        }
      }

      await reportProgress("completed", "Sync completed");

      const summary = {
        total: totalTracks,
        matched: matchedTracks,
        unmatched: unmatchedTracks,
        added: addedTracks,
        skipped: trackResults.filter((r) => r.status === "skipped").length,
        failed: failedTracks,
      };

      let finalStatus: SyncEngineResult["status"] = "completed";
      if (failedTracks > 0 || unmatchedTracks > 0) {
        finalStatus = failedTracks > 0 ? "completed_with_errors" : "completed";
        // If all failed, mark as failed
        if (failedTracks === totalTracks) {
          finalStatus = "failed";
        }
      }

      return {
        plan,
        destinationPlaylistId: finalDestinationPlaylistId,
        destinationPlaylistUrl: finalDestinationPlaylistUrl,
        trackResults,
        summary,
        status: finalStatus,
      };
    } catch (err) {
      if (await checkCancelled()) {
        return this.buildCancelledResult();
      }

      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return {
        plan: createSyncPlan({
          sourcePlaylistId,
          sourcePlaylistName: input.sourcePlaylistName || "Unknown",
          sourceTracks: [],
          matchResults: [],
          config,
        }),
        trackResults: [],
        summary: {
          total: totalTracks,
          matched: matchedTracks,
          unmatched: unmatchedTracks,
          added: addedTracks,
          skipped: 0,
          failed: failedTracks,
        },
        status: "failed",
        error: errorMessage,
      };
    }
  }

  private buildCancelledResult(): SyncEngineResult {
    return {
      plan: createSyncPlan({
        sourcePlaylistId: "",
        sourcePlaylistName: "",
        sourceTracks: [],
        matchResults: [],
        config: {
          createNewPlaylist: true,
          preserveDuplicates: false,
          preserveOrder: true,
        },
      }),
      trackResults: [],
      summary: { total: 0, matched: 0, unmatched: 0, added: 0, skipped: 0, failed: 0 },
      status: "cancelled",
    };
  }
}

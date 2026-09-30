/**
 * Sync planner - separates "plan" from "apply"
 * Answers: what source tracks exist, which destination tracks found, which unmatched, which changes needed, what existing dest state matters
 */

import { NormalizedTrack } from "../providers/types";
import { MatchResult } from "./matcher";

export interface SyncPlan {
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  totalSourceTracks: number;
  matched: MatchResult[]; // status matched
  unmatched: MatchResult[];
  destinationChanges: {
    createPlaylist: boolean;
    playlistName: string;
    playlistDescription?: string;
    isPublic?: boolean;
    tracksToAdd: NormalizedTrack[]; // destination provider tracks
    // For future: tracksToRemove, etc.
  };
  // For idempotency - existing destination tracks
  existingDestinationTracks?: NormalizedTrack[];
  preserveDuplicates: boolean;
  preserveOrder: boolean;
}

export interface PlanInput {
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  sourceTracks: NormalizedTrack[];
  matchResults: MatchResult[];
  config: {
    createNewPlaylist: boolean;
    preserveDuplicates: boolean;
    preserveOrder: boolean;
    destinationPlaylistName?: string;
    destinationPlaylistDescription?: string;
    isPublic?: boolean;
  };
  existingDestinationTracks?: NormalizedTrack[];
}

export function createSyncPlan(input: PlanInput): SyncPlan {
  const matched = input.matchResults.filter((r) => r.status === "matched");
  const unmatched = input.matchResults.filter((r) => r.status === "unmatched");

  // For idempotency: check existing destination tracks to avoid duplicates
  let tracksToAdd: NormalizedTrack[] = matched
    .map((r) => r.matchedTrack!)
    .filter((t): t is NormalizedTrack => !!t);

  if (input.existingDestinationTracks && input.existingDestinationTracks.length > 0 && !input.config.preserveDuplicates) {
    // Deduplicate: don't add tracks that already exist in destination
    const existingIds = new Set(input.existingDestinationTracks.map((t) => t.providerTrackId));
    const originalCount = tracksToAdd.length;
    tracksToAdd = tracksToAdd.filter((t) => !existingIds.has(t.providerTrackId));
    // Note: we keep count for reporting but filtered list for actual add
  }

  // Preserve order: if config says preserveOrder, tracksToAdd should be in source order
  // Already in source order if matchResults preserved source order
  // If preserveDuplicates is true, we should keep duplicates from source
  // For now, if preserveDuplicates false, we deduplicate source duplicates as well?
  // Per sync-engine skill: do not automatically deduplicate legitimate source entries unless product semantics says so
  // So we respect config: if preserveDuplicates false, deduplicate source duplicates by providerTrackId keeping first occurrence
  if (!input.config.preserveDuplicates) {
    const seen = new Set<string>();
    const deduped: NormalizedTrack[] = [];
    for (const track of tracksToAdd) {
      if (!seen.has(track.providerTrackId)) {
        seen.add(track.providerTrackId);
        deduped.push(track);
      }
    }
    tracksToAdd = deduped;
  }

  return {
    sourcePlaylistId: input.sourcePlaylistId,
    sourcePlaylistName: input.sourcePlaylistName,
    totalSourceTracks: input.sourceTracks.length,
    matched,
    unmatched,
    destinationChanges: {
      createPlaylist: input.config.createNewPlaylist,
      playlistName: input.config.destinationPlaylistName || input.sourcePlaylistName,
      playlistDescription: input.config.destinationPlaylistDescription,
      isPublic: input.config.isPublic,
      tracksToAdd,
    },
    existingDestinationTracks: input.existingDestinationTracks,
    preserveDuplicates: input.config.preserveDuplicates,
    preserveOrder: input.config.preserveOrder,
  };
}

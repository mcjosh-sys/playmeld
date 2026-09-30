/**
 * Track matching - confidence-oriented pipeline
 * Priority:
 * 1. Stable cross-service identifier (ISRC)
 * 2. Strong metadata match
 * 3. Normalized title + artist/album/duration evidence
 * 4. Provider search candidates
 * 5. Fuzzy matching only when confidence sufficient
 * 6. Otherwise unmatched
 *
 * Never silently select low-confidence candidate merely to maximize transferred tracks
 * Deterministic for same inputs
 */

import { NormalizedTrack, SearchQuery } from "../providers/types";
import { normalizeTrackForMatching, durationWithinTolerance } from "./normalizer";

export interface MatchCandidate {
  track: NormalizedTrack;
  confidence: number; // 0-100
  reason: string;
}

export interface MatchResult {
  sourceTrack: NormalizedTrack;
  matchedTrack?: NormalizedTrack;
  confidence?: number;
  status: "matched" | "unmatched";
  reason: string;
}

function calculateTitleSimilarity(a: string, b: string): number {
  // Simple Jaccard similarity on words, can be improved
  const wordsA = new Set(a.split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

function calculateArtistSimilarity(artistsA: string[], artistsB: string[]): number {
  if (artistsA.length === 0 || artistsB.length === 0) return 0;
  // Check if any artist matches
  const setA = new Set(artistsA);
  const setB = new Set(artistsB);
  const intersection = [...setA].filter((a) => setB.has(a));
  if (intersection.length > 0) return 1;
  // Partial match
  for (const a of setA) {
    for (const b of setB) {
      if (a.includes(b) || b.includes(a)) return 0.8;
    }
  }
  return 0;
}

function scoreCandidate(source: ReturnType<typeof normalizeTrackForMatching>, candidate: NormalizedTrack): { confidence: number; reason: string } {
  const candNormalized = normalizeTrackForMatching({
    title: candidate.title,
    artists: candidate.artists,
    album: candidate.album,
    durationMs: candidate.durationMs,
    isrc: candidate.isrc,
  });

  // 1. ISRC exact match - highest confidence
  if (source.isrc && candNormalized.isrc && source.isrc === candNormalized.isrc) {
    // Also check version info to avoid matching clean vs explicit incorrectly? But ISRC should be distinct
    return { confidence: 100, reason: "ISRC exact match" };
  }

  // Title similarity
  const titleSim = calculateTitleSimilarity(source.normalizedTitle, candNormalized.normalizedTitle);
  const artistSim = calculateArtistSimilarity(source.normalizedArtists, candNormalized.normalizedArtists);
  const albumSim = source.normalizedAlbum && candNormalized.normalizedAlbum
    ? calculateTitleSimilarity(source.normalizedAlbum, candNormalized.normalizedAlbum)
    : 0.5; // neutral if missing

  const durationOk = durationWithinTolerance(source.durationMs, candNormalized.durationMs, 5000);

  // Version info must match for high confidence
  const versionMismatch =
    source.versionInfo.isLive !== candNormalized.versionInfo.isLive ||
    source.versionInfo.isRemix !== candNormalized.versionInfo.isRemix ||
    source.versionInfo.isAcoustic !== candNormalized.versionInfo.isAcoustic;

  let confidence = 0;
  let reason = "";

  // Strong metadata match
  if (titleSim >= 0.9 && artistSim >= 0.9) {
    confidence = 95;
    reason = `Strong title (${titleSim.toFixed(2)}) + artist match (${artistSim.toFixed(2)})`;
    if (albumSim >= 0.8) {
      confidence = Math.min(98, confidence + 3);
      reason += ` + album match`;
    }
    if (durationOk) {
      confidence = Math.min(99, confidence + 2);
    } else {
      confidence -= 15;
      reason += ` but duration mismatch`;
    }
    if (versionMismatch) {
      confidence -= 20;
      reason += ` version mismatch (live/remix/acoustic)`;
    }
  } else if (titleSim >= 0.7 && artistSim >= 0.7) {
    confidence = 75;
    reason = `Moderate title (${titleSim.toFixed(2)}) + artist match (${artistSim.toFixed(2)})`;
    if (durationOk) confidence += 5;
    if (versionMismatch) confidence -= 15;
  } else if (titleSim >= 0.5 && artistSim >= 0.5) {
    confidence = 50;
    reason = `Weak title (${titleSim.toFixed(2)}) + artist match (${artistSim.toFixed(2)})`;
    if (!durationOk) confidence -= 10;
  } else {
    confidence = Math.round((titleSim + artistSim) * 30);
    reason = `Low similarity title ${titleSim.toFixed(2)} artist ${artistSim.toFixed(2)}`;
  }

  // Clamp
  confidence = Math.max(0, Math.min(100, confidence));

  return { confidence, reason };
}

export class TrackMatcher {
  private confidenceThreshold: number;

  constructor(threshold: number = 70) {
    this.confidenceThreshold = threshold;
  }

  /**
   * Match a source track against candidates from destination provider search
   * Returns matched track if confidence >= threshold, else unmatched
   */
  match(sourceTrack: NormalizedTrack, candidates: NormalizedTrack[]): MatchResult {
    const sourceNorm = normalizeTrackForMatching({
      title: sourceTrack.title,
      artists: sourceTrack.artists,
      album: sourceTrack.album,
      durationMs: sourceTrack.durationMs,
      isrc: sourceTrack.isrc,
    });

    if (candidates.length === 0) {
      return {
        sourceTrack,
        status: "unmatched",
        reason: "No candidates from provider search",
      };
    }

    const scored = candidates.map((cand) => {
      const { confidence, reason } = scoreCandidate(sourceNorm, cand);
      return { track: cand, confidence, reason };
    });

    // Sort by confidence descending
    scored.sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];

    if (best.confidence >= this.confidenceThreshold) {
      return {
        sourceTrack,
        matchedTrack: best.track,
        confidence: best.confidence,
        status: "matched",
        reason: best.reason,
      };
    }

    return {
      sourceTrack,
      status: "unmatched",
      reason: `Best candidate confidence ${best.confidence} below threshold ${this.confidenceThreshold}: ${best.reason}`,
    };
  }

  /**
   * Build search query from source track for provider search
   */
  buildSearchQuery(sourceTrack: NormalizedTrack): SearchQuery {
    return {
      title: sourceTrack.title,
      artists: sourceTrack.artists,
      album: sourceTrack.album,
      durationMs: sourceTrack.durationMs,
      isrc: sourceTrack.isrc,
    };
  }
}

/**
 * Track matching - confidence-oriented pipeline - Improved for YouTube Music
 * Priority:
 * 1. Stable cross-service identifier (ISRC) - 100% confidence
 * 2. Strong metadata match (title 0.9 + artist 0.9 + album + duration)
 * 3. Normalized title + artist/album/duration evidence
 * 4. Provider search candidates
 * 5. Fuzzy matching only when confidence sufficient
 * 6. Otherwise unmatched
 *
 * Improvements for YouTube:
 * - Clean YouTube titles: remove (Official Video), (Official Audio), etc. via cleanYouTubeTitle
 * - Lower threshold for YouTube (60 vs 70) because search returns videos not tracks, no ISRC
 * - More lenient duration tolerance for YouTube (15s vs 5s) because YouTube videos have intro/outro
 * - Boost for official audio vs lyric video, penalize lyric if source not lyric
 * - Artist similarity handles "Artist - Topic" channels
 * - Title similarity uses Jaccard + Levenshtein-ish for better matching
 * - Deterministic for same inputs
 * - Never silently select low-confidence candidate
 */

import { NormalizedTrack, SearchQuery, ProviderName } from "../providers/types";
import { normalizeTrackForMatching, durationWithinTolerance, durationWithinYouTubeTolerance, cleanYouTubeTitle, parseYouTubeTitle } from "./normalizer";

export interface MatchCandidate {
  track: NormalizedTrack;
  confidence: number;
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
  // Jaccard similarity on words
  const wordsA = new Set(a.split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  const jaccard = intersection.size / union.size;

  // Also check substring containment for better YouTube matching
  // If one title contains the other, boost similarity
  if (a.includes(b) || b.includes(a)) {
    return Math.max(jaccard, 0.85);
  }

  // Check if titles are similar after cleaning YouTube tags
  const cleanedA = cleanYouTubeTitle(a);
  const cleanedB = cleanYouTubeTitle(b);
  if (cleanedA && cleanedB) {
    const cleanedWordsA = new Set(cleanedA.split(/\s+/).filter(Boolean));
    const cleanedWordsB = new Set(cleanedB.split(/\s+/).filter(Boolean));
    const cleanedIntersection = new Set([...cleanedWordsA].filter((x) => cleanedWordsB.has(x)));
    const cleanedUnion = new Set([...cleanedWordsA, ...cleanedWordsB]);
    const cleanedJaccard = cleanedUnion.size > 0 ? cleanedIntersection.size / cleanedUnion.size : 0;
    return Math.max(jaccard, cleanedJaccard);
  }

  return jaccard;
}

function calculateArtistSimilarity(artistsA: string[], artistsB: string[]): number {
  if (artistsA.length === 0 || artistsB.length === 0) return 0;

  const normalizedA = artistsA.map((a) => a.toLowerCase().replace(" - topic", "").trim());
  const normalizedB = artistsB.map((b) => b.toLowerCase().replace(" - topic", "").trim());

  const setA = new Set(normalizedA);
  const setB = new Set(normalizedB);

  // Exact match
  const intersection = [...setA].filter((a) => setB.has(a));
  if (intersection.length > 0) return 1;

  // Partial containment - handles "The Weeknd" vs "The Weeknd - Topic" or "Weeknd"
  for (const a of setA) {
    for (const b of setB) {
      if (a === b) return 1;
      if (a.includes(b) || b.includes(a)) {
        // Check if one contains the other significantly
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;
        if (longer.includes(shorter) && shorter.length >= 3) {
          // If shorter is substantial part of longer, high similarity
          return 0.9;
        }
        return 0.8;
      }
      // Word overlap
      const wordsA = new Set(a.split(/\s+/));
      const wordsB = new Set(b.split(/\s+/));
      const wordIntersection = [...wordsA].filter((w) => wordsB.has(w));
      if (wordIntersection.length > 0) {
        return 0.7;
      }
    }
  }

  return 0;
}

function isYouTubeTrack(track: NormalizedTrack): boolean {
  return track.provider === "youtube_music";
}

function scoreYouTubeCandidate(
  source: ReturnType<typeof normalizeTrackForMatching>,
  candidate: NormalizedTrack,
  candidateOriginalTitle?: string
): { confidence: number; reason: string } {
  // YouTube-specific scoring - more lenient, no ISRC
  const candNormalized = normalizeTrackForMatching({
    title: candidate.title,
    artists: candidate.artists,
    album: candidate.album,
    durationMs: candidate.durationMs,
    isrc: candidate.isrc,
  });

  const titleSim = calculateTitleSimilarity(source.normalizedTitle, candNormalized.normalizedTitle);
  const artistSim = calculateArtistSimilarity(source.normalizedArtists, candNormalized.normalizedArtists);

  // Duration with more lenient tolerance for YouTube (15s)
  const durationOk = durationWithinYouTubeTolerance(source.durationMs, candNormalized.durationMs, 15000);
  const durationClose = durationWithinYouTubeTolerance(source.durationMs, candNormalized.durationMs, 5000);

  // Version mismatch - but for YouTube, be more lenient? Actually still penalize live/remix mismatch
  const versionMismatch =
    source.versionInfo.isLive !== candNormalized.versionInfo.isLive ||
    source.versionInfo.isRemix !== candNormalized.versionInfo.isRemix ||
    source.versionInfo.isAcoustic !== candNormalized.versionInfo.isAcoustic;

  // Check if candidate is lyric video vs official audio - prefer official audio
  const raw = candidate.raw as any;
  const originalTitle = candidateOriginalTitle || raw?.originalTitle || candidate.title;
  const lowerOriginal = originalTitle.toLowerCase();
  const isLyricVideo = lowerOriginal.includes("lyric");
  const isOfficialAudio = lowerOriginal.includes("official audio") || lowerOriginal.includes("audio") && !lowerOriginal.includes("video");
  const isOfficialVideo = lowerOriginal.includes("official video") || lowerOriginal.includes("official music video");

  let confidence = 0;
  let reason = "";

  // For YouTube, title + artist are most important since no ISRC
  if (titleSim >= 0.85 && artistSim >= 0.85) {
    confidence = 90;
    reason = `Strong YouTube title (${titleSim.toFixed(2)}) + artist (${artistSim.toFixed(2)})`;

    if (durationClose) {
      confidence = Math.min(95, confidence + 5);
      reason += ` + duration close`;
    } else if (durationOk) {
      confidence = Math.min(92, confidence + 2);
      reason += ` + duration ok`;
    } else {
      confidence -= 10;
      reason += ` but duration mismatch`;
    }

    // Boost for official audio (cleaner for playlist)
    if (isOfficialAudio) {
      confidence = Math.min(97, confidence + 3);
      reason += ` + official audio`;
    } else if (isOfficialVideo) {
      confidence = Math.min(95, confidence + 1);
      reason += ` + official video`;
    }

    // Penalize lyric video if source not lyric
    if (isLyricVideo && !source.versionInfo.isLive) {
      // Check if source title indicates lyric? Usually not, so penalize slightly
      // But don't heavily penalize - lyric videos are still valid music
      confidence -= 5;
      reason += ` lyric video`;
    }

    if (versionMismatch) {
      confidence -= 15;
      reason += ` version mismatch`;
    }
  } else if (titleSim >= 0.65 && artistSim >= 0.65) {
    confidence = 70;
    reason = `Moderate YouTube title (${titleSim.toFixed(2)}) + artist (${artistSim.toFixed(2)})`;
    if (durationOk) confidence += 5;
    if (isOfficialAudio) confidence += 3;
    if (versionMismatch) confidence -= 10;
  } else if (titleSim >= 0.45 && artistSim >= 0.45) {
    confidence = 45;
    reason = `Weak YouTube title (${titleSim.toFixed(2)}) + artist (${artistSim.toFixed(2)})`;
    if (!durationOk) confidence -= 10;
  } else {
    confidence = Math.round((titleSim + artistSim) * 35);
    reason = `Low YouTube similarity title ${titleSim.toFixed(2)} artist ${artistSim.toFixed(2)}`;
  }

  // Special handling: if title is very close after cleaning YouTube tags, boost
  const sourceCleaned = cleanYouTubeTitle(source.originalTitle);
  const candCleaned = cleanYouTubeTitle(candidate.title);
  if (sourceCleaned && candCleaned && sourceCleaned === candCleaned) {
    confidence = Math.max(confidence, 85);
    reason += ` + cleaned titles exact match`;
  }

  confidence = Math.max(0, Math.min(100, confidence));
  return { confidence, reason };
}

function scoreCandidate(
  source: ReturnType<typeof normalizeTrackForMatching>,
  candidate: NormalizedTrack
): { confidence: number; reason: string } {
  // Check if candidate is YouTube - use YouTube-specific scoring
  if (isYouTubeTrack(candidate)) {
    const raw = candidate.raw as any;
    return scoreYouTubeCandidate(source, candidate, raw?.originalTitle);
  }

  const candNormalized = normalizeTrackForMatching({
    title: candidate.title,
    artists: candidate.artists,
    album: candidate.album,
    durationMs: candidate.durationMs,
    isrc: candidate.isrc,
  });

  // 1. ISRC exact match - highest confidence (not applicable for YouTube)
  if (source.isrc && candNormalized.isrc && source.isrc === candNormalized.isrc) {
    return { confidence: 100, reason: "ISRC exact match" };
  }

  const titleSim = calculateTitleSimilarity(source.normalizedTitle, candNormalized.normalizedTitle);
  const artistSim = calculateArtistSimilarity(source.normalizedArtists, candNormalized.normalizedArtists);
  const albumSim = source.normalizedAlbum && candNormalized.normalizedAlbum
    ? calculateTitleSimilarity(source.normalizedAlbum, candNormalized.normalizedAlbum)
    : 0.5;

  const durationOk = durationWithinTolerance(source.durationMs, candNormalized.durationMs, 10000); // Increased to 10s

  const versionMismatch =
    source.versionInfo.isLive !== candNormalized.versionInfo.isLive ||
    source.versionInfo.isRemix !== candNormalized.versionInfo.isRemix ||
    source.versionInfo.isAcoustic !== candNormalized.versionInfo.isAcoustic;

  let confidence = 0;
  let reason = "";

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

  confidence = Math.max(0, Math.min(100, confidence));
  return { confidence, reason };
}

export class TrackMatcher {
  private confidenceThreshold: number;
  private youtubeThreshold: number;

  constructor(threshold: number = 70, youtubeThreshold: number = 60) {
    this.confidenceThreshold = threshold;
    this.youtubeThreshold = youtubeThreshold; // Lower for YouTube due to no ISRC and noisy titles
  }

  /**
   * Match a source track against candidates from destination provider search
   * Returns matched track if confidence >= threshold (provider-specific), else unmatched
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

    scored.sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];

    // Use provider-specific threshold
    const threshold = best.track.provider === "youtube_music" ? this.youtubeThreshold : this.confidenceThreshold;

    if (best.confidence >= threshold) {
      return {
        sourceTrack,
        matchedTrack: best.track,
        confidence: best.confidence,
        status: "matched",
        reason: `${best.reason} (threshold ${threshold} for ${best.track.provider})`,
      };
    }

    return {
      sourceTrack,
      status: "unmatched",
      reason: `Best candidate confidence ${best.confidence} below threshold ${threshold} for ${best.track.provider}: ${best.reason}`,
    };
  }

  /**
   * Build search query from source track for provider search
   * Improved for YouTube: handles cleaned titles, multiple variations
   */
  buildSearchQuery(sourceTrack: NormalizedTrack): SearchQuery {
    // For YouTube, clean title for better search
    let title = sourceTrack.title;
    if (sourceTrack.provider === "spotify" || sourceTrack.provider === "youtube_music") {
      title = cleanYouTubeTitle(title);
    }

    return {
      title,
      artists: sourceTrack.artists,
      album: sourceTrack.album,
      durationMs: sourceTrack.durationMs,
      isrc: sourceTrack.isrc,
    };
  }

  /**
   * Get threshold for provider
   */
  getThresholdForProvider(provider: ProviderName): number {
    return provider === "youtube_music" ? this.youtubeThreshold : this.confidenceThreshold;
  }
}

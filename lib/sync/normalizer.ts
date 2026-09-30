/**
 * Track normalization for matching
 * Handles unicode, case folding, whitespace, punctuation, featuring, version indicators
 * Does not strip meaningful info indiscriminately (Live, Remix, Acoustic etc retained but normalized)
 */

export interface NormalizedForMatching {
  originalTitle: string;
  normalizedTitle: string;
  artists: string[];
  normalizedArtists: string[];
  album?: string;
  normalizedAlbum?: string;
  durationMs?: number;
  isrc?: string;
  versionInfo: {
    isLive: boolean;
    isRemix: boolean;
    isAcoustic: boolean;
    isInstrumental: boolean;
    isClean: boolean;
    isExplicit: boolean;
    edition?: string;
  };
}

function normalizeString(str: string): string {
  if (!str) return "";
  // Unicode normalization NFKD, remove diacritics
  let normalized = str.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  // Case folding
  normalized = normalized.toLowerCase();
  // Whitespace normalization
  normalized = normalized.replace(/\s+/g, " ").trim();
  // Remove common featuring variations but keep info for matching
  // Don't remove punctuation indiscriminately - keep meaningful
  return normalized;
}

function extractVersionInfo(title: string): NormalizedForMatching["versionInfo"] {
  const lower = title.toLowerCase();
  return {
    isLive: /\blive\b/.test(lower),
    isRemix: /\bremix\b/.test(lower),
    isAcoustic: /\bacoustic\b/.test(lower),
    isInstrumental: /\binstrumental\b/.test(lower),
    isClean: /\bclean\b/.test(lower),
    isExplicit: /\bexplicit\b/.test(lower) || lower.includes("(e)"),
    edition: extractEdition(lower),
  };
}

function extractEdition(lower: string): string | undefined {
  const editionPatterns = [
    /\(.*?(remaster|remastered|deluxe|anniversary|edition|version|mono|stereo).*?\)/,
    /\[.*?(remaster|remastered|deluxe|anniversary|edition|version|mono|stereo).*?\]/,
  ];
  for (const pattern of editionPatterns) {
    const match = lower.match(pattern);
    if (match) return match[0];
  }
  return undefined;
}

function normalizeTitle(title: string): string {
  let normalized = normalizeString(title);
  // Remove common suffixes in parentheses that are version indicators but keep core title
  // For matching, we want to be tolerant but not strip meaningful info
  // Example: "Song (Live)" -> "song" for base, but versionInfo captures live
  normalized = normalized
    .replace(/\s*\(feat\..*?\)/g, "")
    .replace(/\s*\(ft\..*?\)/g, "")
    .replace(/\s*feat\..*$/g, "")
    .replace(/\s*ft\..*$/g, "")
    .trim();
  // Remove punctuation for comparison but keep alphanumeric
  normalized = normalized.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return normalized;
}

function normalizeArtist(artist: string): string {
  let normalized = normalizeString(artist);
  // Handle "Artist feat. Other" - extract main artist
  normalized = normalized
    .replace(/\s*feat\..*$/g, "")
    .replace(/\s*ft\..*$/g, "")
    .replace(/\s*featuring.*$/g, "")
    .trim();
  normalized = normalized.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return normalized;
}

export function normalizeTrackForMatching(input: {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
}): NormalizedForMatching {
  return {
    originalTitle: input.title,
    normalizedTitle: normalizeTitle(input.title),
    artists: input.artists,
    normalizedArtists: input.artists.map(normalizeArtist),
    album: input.album,
    normalizedAlbum: input.album ? normalizeTitle(input.album) : undefined,
    durationMs: input.durationMs,
    isrc: input.isrc?.toUpperCase(),
    versionInfo: extractVersionInfo(input.title),
  };
}

export function durationWithinTolerance(a?: number, b?: number, toleranceMs: number = 5000): boolean {
  if (a === undefined || b === undefined) return true; // if missing, don't penalize
  return Math.abs(a - b) <= toleranceMs;
}

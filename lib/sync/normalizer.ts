/**
 * Track normalization for matching
 * Handles unicode, case folding, whitespace, punctuation, featuring, version indicators
 * Does not strip meaningful info indiscriminately (Live, Remix, Acoustic etc retained but normalized)
 * Now includes YouTube-specific cleaning for improved YouTube Music matching
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

/**
 * Clean YouTube-specific tags from titles for better matching
 * Removes: (Official Video), (Official Audio), (Lyric Video), [Official], etc.
 */
export function cleanYouTubeTitle(title: string): string {
  if (!title) return "";

  let cleaned = title;

  // Remove common YouTube music suffixes - order matters, most specific first
  const youtubePatterns = [
    // Official Video variations
    /\s*\(Official\s+Music\s+Video\)/gi,
    /\s*\(Official\s+Video\)/gi,
    /\s*\[Official\s+Music\s+Video\]/gi,
    /\s*\[Official\s+Video\]/gi,
    /\s*\(Music\s+Video\)/gi,
    /\s*\(Official\s+Visualizer\)/gi,
    // Official Audio
    /\s*\(Official\s+Audio\)/gi,
    /\s*\[Official\s+Audio\]/gi,
    /\s*\(Audio\)/gi,
    /\s*\(Official\s+Lyric\s+Video\)/gi,
    /\s*\(Lyric\s+Video\)/gi,
    /\s*\(Official\s+Lyrics\)/gi,
    /\s*\(Lyrics\)/gi,
    /\s*\[Official\s+Lyric\s+Video\]/gi,
    /\s*\[Lyric\s+Video\]/gi,
    // Quality tags
    /\s*\(4K\)/gi,
    /\s*\[4K\]/gi,
    /\s*\(HD\)/gi,
    /\s*\[HD\]/gi,
    /\s*\(HQ\)/gi,
    // Topic channel suffix
    /\s*-\s*Topic$/gi,
    // Common brackets at end that are not meaningful for matching
    /\s*\(Official\)/gi,
    /\s*\[Official\]/gi,
  ];

  for (const pattern of youtubePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Remove trailing dash
  cleaned = cleaned.replace(/\s*-\s*$/, "").trim();

  return cleaned;
}

/**
 * Parse YouTube video title to extract artist and track title
 * Handles formats like:
 * - "Artist - Title (Official Video)"
 * - "Artist - Title (Official Audio)"
 * - "Title - Artist"
 * - "Artist - Topic - Title" (auto-generated)
 * - "Artist - Title ft. Other"
 */
export function parseYouTubeTitle(youtubeTitle: string, channelTitle?: string): { artist: string; title: string } {
  const cleaned = cleanYouTubeTitle(youtubeTitle);
  
  // Handle "Artist - Topic - Title" auto-generated format
  // Example: "The Weeknd - Blinding Lights" from "The Weeknd - Topic" channel
  // If channel is "Artist - Topic", the video title is often just "Title"
  if (channelTitle && channelTitle.endsWith(" - Topic")) {
    const topicArtist = channelTitle.replace(" - Topic", "").trim();
    // If cleaned title contains " - ", it might be "Artist - Title" where Artist matches topicArtist
    // Or it might be just "Title" - in that case use topicArtist as artist
    if (cleaned.includes(" - ")) {
      const parts = cleaned.split(" - ").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Check if first part matches topicArtist (or is similar)
        const firstPartLower = parts[0].toLowerCase();
        const topicLower = topicArtist.toLowerCase();
        if (firstPartLower === topicLower || topicLower.includes(firstPartLower) || firstPartLower.includes(topicLower)) {
          // Artist matches topic, title is rest
          return {
            artist: topicArtist,
            title: parts.slice(1).join(" - ").trim(),
          };
        }
        // Otherwise, assume first part is artist, second is title
        return {
          artist: parts[0].trim(),
          title: parts.slice(1).join(" - ").trim(),
        };
      }
    }
    // Just title, use topic artist
    return {
      artist: topicArtist,
      title: cleaned,
    };
  }

  // Standard "Artist - Title" format
  if (cleaned.includes(" - ")) {
    const parts = cleaned.split(" - ").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // Handle "Artist - Title" - first is artist, rest is title
      // But need to handle "Title - Artist" case? For YouTube, usually Artist - Title
      // We'll assume Artist - Title, but check if channelTitle matches second part (might be Title - Artist)
      if (channelTitle) {
        const channelLower = channelTitle.toLowerCase().replace(" - topic", "").trim();
        const firstLower = parts[0].toLowerCase();
        const secondLower = parts[1].toLowerCase();
        
        // If channel matches second part, it might be Title - Artist
        if (secondLower.includes(channelLower) || channelLower.includes(secondLower)) {
          return {
            artist: parts[1].trim(),
            title: parts[0].trim(),
          };
        }
      }

      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(" - ").trim(),
      };
    }
  }

  // No dash, use channelTitle as artist if available and not generic
  if (channelTitle && !channelTitle.toLowerCase().includes("various") && !channelTitle.toLowerCase().includes("music")) {
    const artist = channelTitle.replace(" - Topic", "").trim();
    return {
      artist,
      title: cleaned,
    };
  }

  // Fallback: unknown artist, cleaned title as title
  return {
    artist: "Unknown Artist",
    title: cleaned,
  };
}

function normalizeTitle(title: string): string {
  let normalized = normalizeString(title);
  
  // Clean YouTube tags first for better matching
  normalized = cleanYouTubeTitle(normalized);
  
  // Remove featuring variations
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
  normalized = cleanYouTubeTitle(normalized);
  normalized = normalized
    .replace(/\s*feat\..*$/g, "")
    .replace(/\s*ft\..*$/g, "")
    .replace(/\s*featuring.*$/g, "")
    .replace(/\s*-\s*topic$/g, "")
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

export function durationWithinTolerance(a?: number, b?: number, toleranceMs: number = 10000): boolean {
  // Increased tolerance for YouTube: 10 seconds (was 5) because YouTube videos often have slightly different durations
  if (a === undefined || b === undefined) return true;
  return Math.abs(a - b) <= toleranceMs;
}

/**
 * Check if duration is within YouTube tolerance (more lenient)
 * YouTube videos often have intro/outro, so tolerance higher
 */
export function durationWithinYouTubeTolerance(a?: number, b?: number, toleranceMs: number = 15000): boolean {
  if (a === undefined || b === undefined) return true;
  return Math.abs(a - b) <= toleranceMs;
}

/**
 * YouTube Music Provider Implementation via YouTube Data API v3 - Improved Matching
 * Official docs: https://developers.google.com/youtube/v3
 * 
 * Improvements for matching:
 * - Clean YouTube titles: remove (Official Video), (Official Audio), (Lyric Video), [4K], etc.
 * - Parse artist/title intelligently: handles Artist - Title, Artist - Topic - Title, Title - Artist
 * - Fetch video durations via videos.list batched (max 50 per call) for duration tolerance matching
 * - Search with improved queries: official audio, topic channels, etc.
 * - Capabilities: maxTracksPerAddRequest 1, searchSupportsISRC false, but duration and cleaned titles improve confidence
 */

import {
  MusicProvider,
  ProviderCapabilities,
  NormalizedTrack,
  NormalizedPlaylist,
  PlaylistPage,
  TrackPage,
  SearchQuery,
  CreatePlaylistInput,
  ProviderUser,
  ProviderName,
} from "../types";
import {
  ProviderAuthenticationError,
  ProviderNotFoundError,
  ProviderRateLimitError,
  ProviderTransientError,
  translateHttpError,
} from "../errors";
import { cleanYouTubeTitle, parseYouTubeTitle } from "@/lib/sync/normalizer";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_BASE = "https://oauth2.googleapis.com/token";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function getClientId(): string {
  const id = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("YOUTUBE_CLIENT_ID or GOOGLE_CLIENT_ID not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("YOUTUBE_CLIENT_SECRET or GOOGLE_CLIENT_SECRET not set");
  return secret;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

interface YouTubePlaylist {
  id: string;
  snippet: {
    title: string;
    description?: string;
    channelId: string;
    channelTitle?: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  contentDetails?: {
    itemCount?: number;
  };
  status?: {
    privacyStatus?: string;
  };
}

interface YouTubePlaylistItem {
  id: string;
  snippet: {
    title: string;
    description?: string;
    playlistId: string;
    position: number;
    resourceId: {
      kind: string;
      videoId: string;
    };
    videoOwnerChannelTitle?: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  contentDetails?: {
    videoId?: string;
  };
}

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    channelTitle?: string;
    description?: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  contentDetails?: {
    duration?: string;
  };
}

interface YouTubeSearchResult {
  id: {
    kind: string;
    videoId: string;
  };
  snippet: {
    title: string;
    channelTitle?: string;
    description?: string;
    thumbnails?: {
      default?: { url: string };
    };
  };
}

function parseISO8601Duration(duration?: string): number | undefined {
  if (!duration) return undefined;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return undefined;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function mapYouTubePlaylistToNormalized(p: YouTubePlaylist, provider: ProviderName = "youtube_music"): NormalizedPlaylist {
  const isPublic = p.status?.privacyStatus === "public";
  return {
    provider,
    providerPlaylistId: p.id,
    name: p.snippet.title,
    description: p.snippet.description,
    ownerName: p.snippet.channelTitle,
    ownerId: p.snippet.channelId,
    imageUrl: p.snippet.thumbnails?.high?.url || p.snippet.thumbnails?.medium?.url || p.snippet.thumbnails?.default?.url,
    trackCount: p.contentDetails?.itemCount,
    isPublic,
    isCollaborative: false,
    url: `https://www.youtube.com/playlist?list=${p.id}`,
    raw: p,
  };
}

function mapYouTubePlaylistItemToNormalized(
  item: YouTubePlaylistItem,
  videoDetails?: Map<string, YouTubeVideo>,
  provider: ProviderName = "youtube_music"
): NormalizedTrack {
  const rawTitle = item.snippet.title;
  const channelTitle = item.snippet.videoOwnerChannelTitle;

  // Use improved parser that cleans YouTube tags and extracts artist/title intelligently
  const parsed = parseYouTubeTitle(rawTitle, channelTitle);

  // Get duration from videoDetails if available
  let durationMs: number | undefined;
  const video = videoDetails?.get(item.snippet.resourceId.videoId);
  if (video?.contentDetails?.duration) {
    durationMs = parseISO8601Duration(video.contentDetails.duration);
  }

  // Clean title for final display but keep parsed title for matching
  const cleanedTitle = cleanYouTubeTitle(rawTitle);
  // Use parsed title if it seems more like actual song title (not containing channel name)
  const finalTitle = parsed.title.length > 2 ? parsed.title : cleanedTitle;

  return {
    provider,
    providerTrackId: item.snippet.resourceId.videoId,
    title: finalTitle,
    artists: [parsed.artist],
    album: undefined,
    durationMs,
    isrc: undefined,
    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
    imageUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    raw: {
      playlistItem: item,
      videoDetails: video,
      originalTitle: rawTitle,
      cleanedTitle,
      parsed,
    },
  };
}

function mapYouTubeSearchToNormalized(
  result: YouTubeSearchResult,
  videoDetails?: Map<string, YouTubeVideo>,
  provider: ProviderName = "youtube_music"
): NormalizedTrack {
  const rawTitle = result.snippet.title;
  const channelTitle = result.snippet.channelTitle;

  const parsed = parseYouTubeTitle(rawTitle, channelTitle);

  let durationMs: number | undefined;
  const video = videoDetails?.get(result.id.videoId);
  if (video?.contentDetails?.duration) {
    durationMs = parseISO8601Duration(video.contentDetails.duration);
  }

  const cleanedTitle = cleanYouTubeTitle(rawTitle);
  const finalTitle = parsed.title.length > 2 ? parsed.title : cleanedTitle;

  return {
    provider,
    providerTrackId: result.id.videoId,
    title: finalTitle,
    artists: [parsed.artist],
    album: undefined,
    durationMs,
    isrc: undefined,
    url: `https://www.youtube.com/watch?v=${result.id.videoId}`,
    imageUrl: result.snippet.thumbnails?.default?.url,
    raw: {
      searchResult: result,
      videoDetails: video,
      originalTitle: rawTitle,
      cleanedTitle,
      parsed,
    },
  };
}

async function youtubeFetch(accessToken: string, path: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${YOUTUBE_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return res;
}

/**
 * Batch fetch video details to get durations for better matching
 * YouTube videos.list costs 1 quota per call, max 50 IDs per call
 */
async function fetchVideoDetails(
  accessToken: string,
  videoIds: string[]
): Promise<Map<string, YouTubeVideo>> {
  const detailsMap = new Map<string, YouTubeVideo>();

  if (videoIds.length === 0) return detailsMap;

  // Batch into chunks of 50 (YouTube max)
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        id: chunk.join(","),
      });

      const res = await youtubeFetch(accessToken, `/videos?${params.toString()}`);

      if (!res.ok) {
        const body = await res.text();
        console.warn(`Failed to fetch video details for chunk: ${body.slice(0, 200)}`);
        continue;
      }

      const data = (await res.json()) as {
        items: YouTubeVideo[];
      };

      for (const video of data.items) {
        detailsMap.set(video.id, video);
      }

      // Small delay to respect quota
      if (chunks.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (err) {
      console.warn(`Error fetching video details chunk`, err);
    }
  }

  return detailsMap;
}

export class YouTubeMusicProvider implements MusicProvider {
  readonly name: ProviderName = "youtube_music";

  getCapabilities(): ProviderCapabilities {
    return {
      canReadPlaylists: true,
      canReadPlaylistTracks: true,
      canCreatePlaylists: true,
      canAddTracks: true,
      canRemoveTracks: true,
      supportsPublicPrivatePlaylists: true,
      supportsCollaborativePlaylists: false,
      maxTracksPerAddRequest: 1,
      maxTracksPerPlaylist: 5000,
      searchSupportsISRC: false,
    };
  }

  getAuthorizationUrl(state: string, redirectUri: string, scopes: string[] = YOUTUBE_SCOPES): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: getClientId(),
      scope: scopes.join(" "),
      redirect_uri: redirectUri,
      state,
      access_type: "offline",
      prompt: "consent",
    });
    return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string) {
    const res = await fetch(GOOGLE_TOKEN_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`YouTube token exchange failed: ${res.status} ${text.slice(0, 200)}`);
      throw new ProviderAuthenticationError("youtube_music", `Token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as GoogleTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scopes: data.scope,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const res = await fetch(GOOGLE_TOKEN_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        throw new ProviderAuthenticationError("youtube_music", "Refresh token invalid");
      }
      throw new ProviderTransientError("youtube_music", `Refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as GoogleTokenResponse;
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      refreshToken: data.refresh_token,
    };
  }

  async getCurrentUser(accessToken: string): Promise<ProviderUser> {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw translateHttpError("youtube_music", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as {
      id: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    let channelTitle: string | undefined;
    try {
      const channelRes = await youtubeFetch(accessToken, "/channels?part=snippet&mine=true");
      if (channelRes.ok) {
        const channelData = (await channelRes.json()) as {
          items?: { id: string; snippet?: { title?: string } }[];
        };
        channelTitle = channelData.items?.[0]?.snippet?.title;
      }
    } catch {}

    return {
      providerAccountId: data.id,
      displayName: channelTitle || data.name,
      email: data.email,
      imageUrl: data.picture,
    };
  }

  async listPlaylists(accessToken: string, cursor?: string, limit: number = 50): Promise<PlaylistPage> {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,status",
      mine: "true",
      maxResults: Math.min(limit, 50).toString(),
    });

    if (cursor) {
      params.set("pageToken", cursor);
    }

    const res = await youtubeFetch(accessToken, `/playlists?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      if (body.includes("quotaExceeded") || body.includes("rateLimitExceeded")) {
        const retryAfter = res.headers.get("Retry-After");
        let retryAfterMs: number | undefined;
        if (retryAfter) retryAfterMs = parseInt(retryAfter, 10) * 1000;
        throw new ProviderRateLimitError("youtube_music", retryAfterMs, `YouTube quota/rate limit: ${body.slice(0, 200)}`);
      }
      throw translateHttpError("youtube_music", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as {
      items: YouTubePlaylist[];
      nextPageToken?: string;
      pageInfo?: {
        totalResults?: number;
      };
    };

    const playlists = data.items.map((p) => mapYouTubePlaylistToNormalized(p));
    const hasMore = !!data.nextPageToken;

    return {
      playlists,
      hasMore,
      nextCursor: data.nextPageToken,
      total: data.pageInfo?.totalResults,
    };
  }

  async getPlaylist(accessToken: string, playlistId: string): Promise<NormalizedPlaylist> {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,status",
      id: playlistId,
    });

    const res = await youtubeFetch(accessToken, `/playlists?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      throw translateHttpError("youtube_music", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as {
      items: YouTubePlaylist[];
    };

    if (!data.items || data.items.length === 0) {
      throw new ProviderNotFoundError("youtube_music", `Playlist ${playlistId} not found`);
    }

    return mapYouTubePlaylistToNormalized(data.items[0]);
  }

  async getPlaylistTracks(accessToken: string, playlistId: string, cursor?: string, limit: number = 50): Promise<TrackPage> {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId,
      maxResults: Math.min(limit, 50).toString(),
    });

    if (cursor) params.set("pageToken", cursor);

    const res = await youtubeFetch(accessToken, `/playlistItems?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      if (body.includes("quotaExceeded") || body.includes("rateLimitExceeded")) {
        throw new ProviderRateLimitError("youtube_music", undefined, `YouTube quota: ${body.slice(0, 200)}`);
      }
      throw translateHttpError("youtube_music", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as {
      items: YouTubePlaylistItem[];
      nextPageToken?: string;
      pageInfo?: {
        totalResults?: number;
      };
    };

    const validItems = data.items.filter(
      (item) => item.snippet.resourceId.kind === "youtube#video" && item.snippet.resourceId.videoId
    );

    // Improved: Fetch video details to get durations for better matching
    const videoIds = validItems.map((item) => item.snippet.resourceId.videoId);
    let videoDetails: Map<string, YouTubeVideo> | undefined;

    try {
      videoDetails = await fetchVideoDetails(accessToken, videoIds);
      console.log(`Fetched details for ${videoDetails.size}/${videoIds.length} YouTube videos for duration matching`);
    } catch (err) {
      console.warn("Failed to fetch video details for playlist tracks, proceeding without durations", err);
    }

    const tracks = validItems.map((item) => mapYouTubePlaylistItemToNormalized(item, videoDetails));

    return {
      tracks,
      hasMore: !!data.nextPageToken,
      nextCursor: data.nextPageToken,
      total: data.pageInfo?.totalResults,
    };
  }

  async searchTracks(accessToken: string, query: SearchQuery, limit: number = 5): Promise<NormalizedTrack[]> {
    // Improved search queries for better matching
    // Priority 1: If ISRC available, search with title + artist (ISRC not supported by YouTube but we can use metadata)
    // Priority 2: Title + artist + album with official audio hint
    // Priority 3: Multiple query variations to increase confidence

    const queries: string[] = [];

    // Build primary query: title + first artist
    if (query.title) {
      let primary = `${query.title} ${query.artists[0] || ""}`.trim();
      // Add album if available for disambiguation
      if (query.album) primary += ` ${query.album}`;
      queries.push(primary);
    }

    // Secondary: title only (for cases where artist parsing failed)
    if (query.title) {
      queries.push(query.title);
    }

    // Tertiary: artist + title reversed (some YouTube titles are Title - Artist)
    if (query.title && query.artists[0]) {
      queries.push(`${query.artists[0]} ${query.title}`);
    }

    // For YouTube, we will try first query with official audio hint, but also try without
    const allCandidates: NormalizedTrack[] = [];
    const seenVideoIds = new Set<string>();

    for (let qIdx = 0; qIdx < Math.min(queries.length, 2); qIdx++) {
      let q = queries[qIdx];

      // First query: add "official audio" to prefer clean audio tracks over lyric videos
      if (qIdx === 0) {
        q += " official audio";
      }

      const params = new URLSearchParams({
        part: "snippet",
        q,
        type: "video",
        maxResults: Math.min(limit, 10).toString(),
        videoCategoryId: "10",
        // Prefer more relevant results
        order: "relevance",
      });

      try {
        const res = await youtubeFetch(accessToken, `/search?${params.toString()}`);

        if (!res.ok) {
          const body = await res.text();
          if (body.includes("quotaExceeded")) {
            throw new ProviderRateLimitError("youtube_music", undefined, `Quota exceeded: ${body.slice(0, 200)}`);
          }
          console.warn(`YouTube search failed for query "${q}": ${body.slice(0, 200)}`);
          continue;
        }

        const data = (await res.json()) as {
          items: YouTubeSearchResult[];
        };

        // Collect video IDs for batch details fetch
        const videoIds = data.items.map((item) => item.id.videoId).filter(Boolean);

        // Fetch details for duration matching
        let videoDetails: Map<string, YouTubeVideo> | undefined;
        try {
          videoDetails = await fetchVideoDetails(accessToken, videoIds);
        } catch {}

        for (const item of data.items) {
          if (!seenVideoIds.has(item.id.videoId)) {
            seenVideoIds.add(item.id.videoId);
            allCandidates.push(mapYouTubeSearchToNormalized(item, videoDetails));
          }
        }

        // If we got good candidates from first query, stop
        if (allCandidates.length >= limit) break;

        // Small delay between search queries to respect quota
        if (qIdx < queries.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err) {
        if (err instanceof ProviderRateLimitError) throw err;
        console.warn(`Search query "${q}" failed`, err);
      }
    }

    // Return up to limit candidates
    return allCandidates.slice(0, limit);
  }

  async createPlaylist(accessToken: string, input: CreatePlaylistInput): Promise<NormalizedPlaylist> {
    const body = {
      snippet: {
        title: input.name,
        description: input.description || "",
      },
      status: {
        privacyStatus: input.isPublic ? "public" : "private",
      },
    };

    const res = await youtubeFetch(accessToken, "/playlists?part=snippet,status", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const respBody = await res.text();
      if (respBody.includes("quotaExceeded")) {
        throw new ProviderRateLimitError("youtube_music", undefined, `Quota exceeded: ${respBody.slice(0, 200)}`);
      }
      throw translateHttpError("youtube_music", res.status, respBody, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as YouTubePlaylist;
    return mapYouTubePlaylistToNormalized(data);
  }

  async addTracks(accessToken: string, playlistId: string, trackIds: string[], position?: number): Promise<void> {
    for (let i = 0; i < trackIds.length; i++) {
      const videoId = trackIds[i];
      const body: any = {
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId,
          },
        },
      };

      if (position !== undefined) body.snippet.position = position + i;

      const res = await youtubeFetch(accessToken, "/playlistItems?part=snippet", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const respBody = await res.text();
        if (respBody.includes("quotaExceeded") || respBody.includes("rateLimitExceeded")) {
          throw new ProviderRateLimitError("youtube_music", undefined, `Quota: ${respBody.slice(0, 200)}`);
        }
        throw translateHttpError("youtube_music", res.status, respBody, Object.fromEntries(res.headers.entries()));
      }

      if (i < trackIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  async removeTracks(accessToken: string, playlistId: string, trackIds: string[]): Promise<void> {
    const videoIdSet = new Set(trackIds);
    let cursor: string | undefined;
    let hasMore = true;
    const itemsToDelete: string[] = [];

    while (hasMore && itemsToDelete.length < trackIds.length) {
      const params = new URLSearchParams({
        part: "snippet",
        playlistId,
        maxResults: "50",
      });
      if (cursor) params.set("pageToken", cursor);

      const res = await youtubeFetch(accessToken, `/playlistItems?${params.toString()}`);
      if (!res.ok) {
        const body = await res.text();
        throw translateHttpError("youtube_music", res.status, body, Object.fromEntries(res.headers.entries()));
      }

      const data = (await res.json()) as {
        items: YouTubePlaylistItem[];
        nextPageToken?: string;
      };

      for (const item of data.items) {
        if (videoIdSet.has(item.snippet.resourceId.videoId)) {
          itemsToDelete.push(item.id);
        }
      }

      hasMore = !!data.nextPageToken;
      cursor = data.nextPageToken;
    }

    for (const itemId of itemsToDelete) {
      const res = await youtubeFetch(accessToken, `/playlistItems?id=${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.text();
        throw translateHttpError("youtube_music", res.status, body, Object.fromEntries(res.headers.entries()));
      }
    }
  }
}

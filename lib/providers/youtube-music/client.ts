/**
 * YouTube Music Provider Implementation via YouTube Data API v3
 * Official docs: https://developers.google.com/youtube/v3
 * 
 * Important: YouTube Music doesn't have official separate API - YouTube Data API manages YouTube playlists
 * which appear in YouTube Music. For playlist transfer, YouTube playlists are used.
 * 
 * Capabilities:
 * - OAuth: Google OAuth 2.0 Authorization Code Flow
 * - Scopes: https://www.googleapis.com/auth/youtube (read/write) - minimal for playlist transfer
 * - Pagination: pageToken based, not offset
 * - Rate limit: Quota based (10k units/day default), 403 quotaExceeded, 429 rateLimitExceeded
 * - Add tracks: 1 per request (playlistItems.insert), not batched
 * - Search: search.list returns videos, not ISRC - searchSupportsISRC false, confidence lower
 * - Privacy: public, private, unlisted
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
  ProviderPermissionError,
  ProviderNotFoundError,
  ProviderRateLimitError,
  ProviderTransientError,
  ProviderUnsupportedOperationError,
  translateHttpError,
} from "../errors";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_BASE = "https://oauth2.googleapis.com/token";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube", // read/write playlists
  "https://www.googleapis.com/auth/youtube.readonly", // readonly fallback
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function getClientId(): string {
  // Prefer YOUTUBE_CLIENT_ID, fallback to GOOGLE_CLIENT_ID for auth
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
    privacyStatus?: string; // public, private, unlisted
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
      kind: string; // youtube#video
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
    videoPublishedAt?: string;
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
    duration?: string; // ISO 8601 PT4M13S
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
  // PT4M13S -> milliseconds
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
    isCollaborative: false, // YouTube doesn't have collaborative in same sense
    url: `https://www.youtube.com/playlist?list=${p.id}`,
    raw: p,
  };
}

function mapYouTubePlaylistItemToNormalized(item: YouTubePlaylistItem, provider: ProviderName = "youtube_music"): NormalizedTrack {
  // YouTube playlist items are videos - we treat videoId as trackId
  // Title often contains "Artist - Title" or just Title
  const title = item.snippet.title;
  // Try to parse artist from title or use channelTitle as artist fallback
  let artists: string[] = [];
  if (item.snippet.videoOwnerChannelTitle) {
    artists = [item.snippet.videoOwnerChannelTitle.replace(" - Topic", "").trim()];
  } else if (title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      artists = [parts[0].trim()];
    }
  }

  if (artists.length === 0) {
    artists = ["Unknown Artist"];
  }

  return {
    provider,
    providerTrackId: item.snippet.resourceId.videoId,
    title: title,
    artists,
    album: undefined, // YouTube doesn't have album in same sense
    durationMs: undefined, // Need additional videos.list call to get duration
    isrc: undefined, // YouTube doesn't provide ISRC
    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
    imageUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    raw: item,
  };
}

function mapYouTubeSearchToNormalized(result: YouTubeSearchResult, provider: ProviderName = "youtube_music"): NormalizedTrack {
  return {
    provider,
    providerTrackId: result.id.videoId,
    title: result.snippet.title,
    artists: result.snippet.channelTitle ? [result.snippet.channelTitle.replace(" - Topic", "").trim()] : ["Unknown Artist"],
    album: undefined,
    durationMs: undefined,
    isrc: undefined,
    url: `https://www.youtube.com/watch?v=${result.id.videoId}`,
    imageUrl: result.snippet.thumbnails?.default?.url,
    raw: result,
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
      maxTracksPerAddRequest: 1, // YouTube playlistItems.insert is 1 per request
      maxTracksPerPlaylist: 5000, // YouTube limit
      searchSupportsISRC: false, // YouTube search doesn't support ISRC, only text
    };
  }

  getAuthorizationUrl(state: string, redirectUri: string, scopes: string[] = YOUTUBE_SCOPES): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: getClientId(),
      scope: scopes.join(" "),
      redirect_uri: redirectUri,
      state,
      access_type: "offline", // To get refresh_token
      prompt: "consent", // Force consent to get refresh_token
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
      const text = await res.text();
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
    // Use Google userinfo endpoint to get user
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

    // Also try to get YouTube channel info
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
    // YouTube uses pageToken for pagination
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
      // Handle quota errors
      if (body.includes("quotaExceeded") || body.includes("rateLimitExceeded")) {
        const retryAfter = res.headers.get("Retry-After");
        let retryAfterMs: number | undefined;
        if (retryAfter) {
          retryAfterMs = parseInt(retryAfter, 10) * 1000;
        }
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
    const nextCursor = data.nextPageToken;

    return {
      playlists,
      hasMore,
      nextCursor,
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

    if (cursor) {
      params.set("pageToken", cursor);
    }

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

    const tracks = data.items
      .filter((item) => item.snippet.resourceId.kind === "youtube#video" && item.snippet.resourceId.videoId)
      .map((item) => mapYouTubePlaylistItemToNormalized(item));

    const hasMore = !!data.nextPageToken;
    const nextCursor = data.nextPageToken;

    return {
      tracks,
      hasMore,
      nextCursor,
      total: data.pageInfo?.totalResults,
    };
  }

  async searchTracks(accessToken: string, query: SearchQuery, limit: number = 5): Promise<NormalizedTrack[]> {
    // Build query: title + artist
    // YouTube search doesn't support ISRC, so use text search
    let q = "";
    if (query.title) {
      q = query.title;
      if (query.artists.length > 0) {
        q += ` ${query.artists[0]}`;
      }
      if (query.album) {
        q += ` ${query.album}`;
      }
    } else {
      q = query.artists.join(" ");
    }

    // Add "official" to improve matching for music
    q += " official";

    const params = new URLSearchParams({
      part: "snippet",
      q,
      type: "video",
      maxResults: Math.min(limit, 10).toString(),
      videoCategoryId: "10", // Music category
    });

    const res = await youtubeFetch(accessToken, `/search?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      if (body.includes("quotaExceeded")) {
        throw new ProviderRateLimitError("youtube_music", undefined, `YouTube quota exceeded: ${body.slice(0, 200)}`);
      }
      throw translateHttpError("youtube_music", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as {
      items: YouTubeSearchResult[];
    };

    return data.items.map((item) => mapYouTubeSearchToNormalized(item));
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
    // YouTube requires 1 request per track (playlistItems.insert)
    // Batch handling: loop through trackIds
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

      if (position !== undefined) {
        body.snippet.position = position + i;
      }

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

      // Small delay to respect rate limits (YouTube quota is strict)
      // 100ms delay between inserts
      if (i < trackIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  async removeTracks(accessToken: string, playlistId: string, trackIds: string[]): Promise<void> {
    // Need to find playlistItem IDs for given videoIds
    // First, list playlist items to get their IDs
    // For simplicity, we assume trackIds are playlistItem IDs? But per interface, they should be providerTrackIds (videoIds)
    // So we need to search for playlistItems with those videoIds

    // For MVP, we will list all items and find matching videoIds, then delete
    // This is inefficient but works for small playlists
    // For large playlists, need better approach with pagination

    const videoIdSet = new Set(trackIds);
    let cursor: string | undefined;
    let hasMore = true;
    const itemsToDelete: string[] = [];

    while (hasMore && itemsToDelete.length < trackIds.length) {
      const page = await this.getPlaylistTracks(accessToken, playlistId, cursor, 50);
      
      // Need to get actual playlistItem IDs, not videoIds
      // Our getPlaylistTracks returns normalized tracks with videoId as providerTrackId, but we lose playlistItem ID
      // So we need to fetch raw playlistItems again
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

    // Delete each playlistItem
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

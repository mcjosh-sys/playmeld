/**
 * Spotify Provider Implementation
 * Official docs: https://developer.spotify.com/documentation/web-api
 *
 * Capabilities:
 * - OAuth: Authorization Code Flow
 * - Scopes: playlist-read-private, playlist-read-collaborative, playlist-modify-private, playlist-modify-public, user-read-email, user-read-private
 * - Pagination: limit/offset, next URL
 * - Rate limit: 429 with Retry-After header
 * - Add tracks: max 100 per request
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

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_AUTH_BASE = "https://accounts.spotify.com";

export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-email",
  "user-read-private",
];

function getClientId(): string {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("SPOTIFY_CLIENT_ID not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error("SPOTIFY_CLIENT_SECRET not set");
  return secret;
}

// Client credentials token cache for public playlist fallback
let clientCredentialsToken: { token: string; expiresAt: number } | null = null;

async function getClientCredentialsToken(): Promise<string> {
  const now = Date.now();
  if (clientCredentialsToken && clientCredentialsToken.expiresAt > now + 60000) {
    return clientCredentialsToken.token;
  }

  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Spotify client credentials failed: ${res.status} ${text.slice(0, 200)}`);
    throw new ProviderAuthenticationError("spotify", `Client credentials failed: ${res.status}`);
  }

  const data = (await res.json()) as SpotifyTokenResponse;
  clientCredentialsToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  console.log(`[Spotify] Got client credentials token, expires in ${data.expires_in}s`);

  return data.access_token;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface SpotifyUser {
  id: string;
  display_name?: string;
  email?: string;
  images?: { url: string }[];
  country?: string;
  product?: string;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  owner: { id: string; display_name?: string };
  images?: { url: string }[];
  tracks: { total: number };
  public: boolean | null;
  collaborative: boolean;
  external_urls: { spotify: string };
  snapshot_id: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: { name: string; images?: { url: string }[] };
  duration_ms: number;
  explicit: boolean;
  external_ids?: { isrc?: string };
  external_urls: { spotify: string };
  preview_url?: string | null;
}

interface SpotifyPlaylistTrack {
  track: SpotifyTrack | null;
}

function mapSpotifyTrackToNormalized(t: SpotifyTrack, provider: ProviderName = "spotify"): NormalizedTrack {
  return {
    provider,
    providerTrackId: t.id,
    title: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name,
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc,
    url: t.external_urls?.spotify,
    imageUrl: t.album?.images?.[0]?.url,
    explicit: t.explicit,
    previewUrl: t.preview_url || undefined,
    raw: t,
  };
}

function mapSpotifyPlaylistToNormalized(p: SpotifyPlaylist, provider: ProviderName = "spotify"): NormalizedPlaylist {
  return {
    provider,
    providerPlaylistId: p.id,
    name: p.name,
    description: p.description || undefined,
    ownerName: p.owner?.display_name || p.owner?.id || "Unknown",
    ownerId: p.owner?.id,
    imageUrl: p.images?.[0]?.url,
    trackCount: p.tracks?.total ?? 0,
    isPublic: p.public ?? undefined,
    isCollaborative: p.collaborative ?? false,
    url: p.external_urls?.spotify,
    snapshotId: p.snapshot_id,
    raw: p,
  };
}

async function spotifyFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${SPOTIFY_API_BASE}${path}`;
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

export class SpotifyProvider implements MusicProvider {
  readonly name: ProviderName = "spotify";

  getCapabilities(): ProviderCapabilities {
    return {
      canReadPlaylists: true,
      canReadPlaylistTracks: true,
      canCreatePlaylists: true,
      canAddTracks: true,
      canRemoveTracks: true,
      supportsPublicPrivatePlaylists: true,
      supportsCollaborativePlaylists: true,
      maxTracksPerAddRequest: 100,
      searchSupportsISRC: true,
    };
  }

  getAuthorizationUrl(state: string, redirectUri: string, scopes: string[] = SPOTIFY_SCOPES): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: getClientId(),
      scope: scopes.join(" "),
      redirect_uri: redirectUri,
      state,
    });
    return `${SPOTIFY_AUTH_BASE}/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string) {
    const clientId = getClientId();
    const clientSecret = getClientSecret();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      // Safe error - don't expose client secret
      throw new ProviderAuthenticationError("spotify", `Token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as SpotifyTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scopes: data.scope,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const clientId = getClientId();
    const clientSecret = getClientSecret();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 || res.status === 401) {
        throw new ProviderAuthenticationError("spotify", "Refresh token invalid");
      }
      throw new ProviderTransientError("spotify", `Refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as SpotifyTokenResponse;
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      refreshToken: data.refresh_token,
    };
  }

  async getCurrentUser(accessToken: string): Promise<ProviderUser> {
    const res = await spotifyFetch(accessToken, "/me");
    if (!res.ok) {
      const body = await res.text();
      throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
    }
    const user = (await res.json()) as SpotifyUser;
    return {
      providerAccountId: user.id,
      displayName: user.display_name,
      email: user.email,
      imageUrl: user.images?.[0]?.url,
      country: user.country,
      product: user.product,
    };
  }

  async listPlaylists(accessToken: string, cursor?: string, limit: number = 50): Promise<PlaylistPage> {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) throw new Error("Invalid cursor");

    const params = new URLSearchParams({
      limit: Math.min(limit, 50).toString(),
      offset: offset.toString(),
    });

    const res = await spotifyFetch(accessToken, `/me/playlists?${params.toString()}`);
    if (!res.ok) {
      const body = await res.text();
      throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    let data: any;
    try {
      data = await res.json();
    } catch (err) {
      console.error("Failed to parse Spotify playlists JSON", err);
      throw new ProviderTransientError("spotify", "Invalid JSON from Spotify");
    }

    // Robust handling: data might be undefined or have different shape
    if (!data || typeof data !== "object") {
      console.error("Spotify playlists data is not an object", data);
      return {
        playlists: [],
        hasMore: false,
        total: 0,
      };
    }

    const items = data.items || [];
    const playlists = items.map((p: any) => {
      try {
        return mapSpotifyPlaylistToNormalized(p);
      } catch (mapErr) {
        console.warn("Failed to map Spotify playlist", mapErr, p);
        // Return minimal normalized playlist to avoid crashing
        return {
          provider: "spotify" as ProviderName,
          providerPlaylistId: p.id || "unknown",
          name: p.name || "Unknown Playlist",
          trackCount: 0,
          raw: p,
        } as NormalizedPlaylist;
      }
    });

    const hasMore = data.next !== null && data.next !== undefined;
    const nextCursor = hasMore ? (data.offset + data.limit).toString() : undefined;

    return {
      playlists,
      hasMore,
      nextCursor,
      total: data.total ?? items.length,
    };
  }

  async getPlaylist(accessToken: string, playlistId: string): Promise<NormalizedPlaylist> {
    const tryFetch = async (token: string) => {
      return spotifyFetch(token, `/playlists/${encodeURIComponent(playlistId)}`);
    };

    let res = await tryFetch(accessToken);

    // If 403 with user token, try client credentials for public playlists
    if (!res.ok && res.status === 403) {
      const body = await res.text();
      console.warn(`[Spotify] getPlaylist ${playlistId} 403 with user token, trying CC fallback. Body: ${body.slice(0, 300)}`);
      try {
        const ccToken = await getClientCredentialsToken();
        const ccRes = await tryFetch(ccToken);
        if (ccRes.ok) {
          console.log(`[Spotify] CC fallback SUCCESS for getPlaylist ${playlistId}`);
          res = ccRes;
        } else {
          const ccBody = await ccRes.text();
          console.error(`[Spotify] CC fallback failed for getPlaylist ${playlistId} ${ccRes.status}: ${ccBody.slice(0, 300)}`);
          throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
        }
      } catch (ccErr: any) {
        if (ccErr.code) throw ccErr;
        throw translateHttpError("spotify", 403, body, {});
      }
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Spotify] getPlaylist ${playlistId} failed ${res.status}: ${body.slice(0, 500)}`);
      throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new ProviderTransientError("spotify", "Invalid JSON from Spotify playlist");
    }
    return mapSpotifyPlaylistToNormalized(data);
  }

  async getPlaylistTracks(accessToken: string, playlistId: string, cursor?: string, limit: number = 100): Promise<TrackPage> {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) throw new Error("Invalid cursor");

    // Try with market=from_token first, if 403 try without market (some public playlists fail with market param)
    const tryFetch = async (withMarket: boolean): Promise<Response> => {
      const params = new URLSearchParams({
        limit: Math.min(limit, 100).toString(),
        offset: offset.toString(),
      });
      if (withMarket) params.set("market", "from_token");

      const url = `/playlists/${encodeURIComponent(playlistId)}/tracks?${params.toString()}`;
      console.log(`[Spotify] Fetching playlist tracks ${playlistId} withMarket=${withMarket}, url: ${url}, offset: ${offset}`);

      return spotifyFetch(accessToken, url);
    };

    let res = await tryFetch(true);
    let lastBody = "";

    // If 403 Forbidden with market param, retry without market - some public playlists require no market
    if (!res.ok && res.status === 403) {
      lastBody = await res.text();
      console.warn(`[Spotify] Playlist tracks ${playlistId} 403 with market=from_token, retrying without market. Body: ${lastBody.slice(0, 300)}`);
      
      res = await tryFetch(false);
      
      if (!res.ok) {
        lastBody = await res.text();
        console.error(`[Spotify] Playlist tracks ${playlistId} still 403 without market with user token. Body: ${lastBody.slice(0, 500)}`);
        
        // For public playlists not owned, try client credentials token as fallback
        // Per Spotify docs, Get Playlist Items only allows owned/collaborative with user token, but client credentials can access public playlists
        console.log(`[Spotify] Trying client credentials fallback for public playlist ${playlistId}`);
        try {
          const ccToken = await getClientCredentialsToken();
          
          const tryFetchCC = async (withMarket: boolean): Promise<Response> => {
            const params = new URLSearchParams({
              limit: Math.min(limit, 100).toString(),
              offset: offset.toString(),
            });
            if (withMarket) params.set("market", "from_token");
            const url = `/playlists/${encodeURIComponent(playlistId)}/tracks?${params.toString()}`;
            console.log(`[Spotify] CC fallback fetching ${playlistId} withMarket=${withMarket}`);
            return spotifyFetch(ccToken, url);
          };

          let ccRes = await tryFetchCC(false);
          
          if (!ccRes.ok && ccRes.status === 403) {
            ccRes = await tryFetchCC(true);
          }

          if (ccRes.ok) {
            console.log(`[Spotify] Client credentials fallback SUCCESS for public playlist ${playlistId}`);
            res = ccRes;
            lastBody = "";
          } else {
            const ccBody = await ccRes.text();
            console.error(`[Spotify] CC fallback also failed ${ccRes.status}: ${ccBody.slice(0, 500)}`);
            // Throw original user token error with better message
            throw translateHttpError("spotify", res.status, lastBody, Object.fromEntries(res.headers.entries()));
          }
        } catch (ccErr: any) {
          if (ccErr.code) throw ccErr; // Already a ProviderError
          console.error(`[Spotify] CC fallback exception`, ccErr);
          throw translateHttpError("spotify", 403, lastBody, {});
        }
      }
    }

    if (!res.ok) {
      const body = lastBody || (await res.text());
      console.error(`[Spotify] Playlist tracks ${playlistId} failed ${res.status}: ${body.slice(0, 500)}`);
      throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    let data: any;
    try {
      data = await res.json();
    } catch (err) {
      console.error("Failed to parse Spotify playlist tracks JSON", err);
      throw new ProviderTransientError("spotify", "Invalid JSON from Spotify tracks");
    }

    if (!data || typeof data !== "object") {
      console.error("Spotify playlist tracks data is not an object", data);
      return {
        tracks: [],
        hasMore: false,
        total: 0,
      };
    }

    const items = data.items || [];

    const tracks = items
      .map((item: any) => item.track)
      .filter((t: any): t is SpotifyTrack => t !== null && t !== undefined && t.id !== null && t.id !== undefined)
      .map((t: any) => {
        try {
          return mapSpotifyTrackToNormalized(t);
        } catch (mapErr) {
          console.warn("Failed to map Spotify track", mapErr, t);
          return null;
        }
      })
      .filter((t: any): t is NormalizedTrack => t !== null);

    const hasMore = data.next !== null && data.next !== undefined;
    const nextCursor = hasMore ? (data.offset + data.limit).toString() : undefined;

    return {
      tracks,
      hasMore,
      nextCursor,
      total: data.total ?? items.length,
    };
  }

  async searchTracks(accessToken: string, query: SearchQuery, limit: number = 5): Promise<NormalizedTrack[]> {
    // Prefer ISRC search if available
    let q: string;
    if (query.isrc) {
      q = `isrc:${query.isrc}`;
    } else {
      // Build query: track:"title" artist:"artist"
      const titlePart = query.title ? `track:"${query.title.replace(/"/g, "")}"` : "";
      const artistPart = query.artists.length > 0 ? `artist:"${query.artists[0].replace(/"/g, "")}"` : "";
      q = [titlePart, artistPart].filter(Boolean).join(" ");
      if (!q) q = query.title;
    }

    const params = new URLSearchParams({
      q,
      type: "track",
      limit: Math.min(limit, 10).toString(),
    });

    const res = await spotifyFetch(accessToken, `/search?${params.toString()}`);
    if (!res.ok) {
      const body = await res.text();
      throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as {
      tracks: {
        items: SpotifyTrack[];
      };
    };

    return data.tracks.items.map((t) => mapSpotifyTrackToNormalized(t));
  }

  async createPlaylist(accessToken: string, input: CreatePlaylistInput): Promise<NormalizedPlaylist> {
    // Need current user id
    const me = await this.getCurrentUser(accessToken);
    const res = await spotifyFetch(accessToken, `/users/${encodeURIComponent(me.providerAccountId)}/playlists`, {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        description: input.description || "",
        public: input.isPublic ?? false,
        collaborative: input.isCollaborative ?? false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
    }

    const data = (await res.json()) as SpotifyPlaylist;
    return mapSpotifyPlaylistToNormalized(data);
  }

  async addTracks(accessToken: string, playlistId: string, trackIds: string[], position?: number): Promise<void> {
    const caps = this.getCapabilities();
    // Batch into chunks of maxTracksPerAddRequest
    const chunks: string[][] = [];
    for (let i = 0; i < trackIds.length; i += caps.maxTracksPerAddRequest) {
      chunks.push(trackIds.slice(i, i + caps.maxTracksPerAddRequest));
    }

    for (const chunk of chunks) {
      const uris = chunk.map((id) => `spotify:track:${id}`);
      const body: Record<string, unknown> = { uris };
      if (position !== undefined) body.position = position;

      const res = await spotifyFetch(accessToken, `/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const respBody = await res.text();
        throw translateHttpError("spotify", res.status, respBody, Object.fromEntries(res.headers.entries()));
      }

      // If position specified, increment for next chunk to preserve order
      if (position !== undefined) {
        position += chunk.length;
      }
    }
  }

  async removeTracks(accessToken: string, playlistId: string, trackIds: string[]): Promise<void> {
    const uris = trackIds.map((id) => ({ uri: `spotify:track:${id}` }));
    const res = await spotifyFetch(accessToken, `/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "DELETE",
      body: JSON.stringify({ tracks: uris }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw translateHttpError("spotify", res.status, body, Object.fromEntries(res.headers.entries()));
    }
  }
}

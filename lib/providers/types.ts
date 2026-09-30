/**
 * Normalized domain models for music providers
 * Provider-specific IDs are retained as external identifiers, not universal IDs
 */

export type ProviderName = "spotify" | "apple_music" | "youtube_music" | "tidal" | "deezer";

export interface ProviderCapabilities {
  canReadPlaylists: boolean;
  canReadPlaylistTracks: boolean;
  canCreatePlaylists: boolean;
  canAddTracks: boolean;
  canRemoveTracks: boolean;
  supportsPublicPrivatePlaylists: boolean;
  supportsCollaborativePlaylists: boolean;
  maxTracksPerAddRequest: number;
  maxTracksPerPlaylist?: number;
  searchSupportsISRC: boolean;
}

export interface NormalizedTrack {
  provider: ProviderName;
  providerTrackId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  url?: string;
  imageUrl?: string;
  explicit?: boolean;
  previewUrl?: string;
  // Useful metadata retained for matching/diagnostics
  raw?: unknown;
}

export interface NormalizedPlaylist {
  provider: ProviderName;
  providerPlaylistId: string;
  name: string;
  description?: string;
  ownerName?: string;
  ownerId?: string;
  imageUrl?: string;
  trackCount?: number;
  isPublic?: boolean;
  isCollaborative?: boolean;
  url?: string;
  snapshotId?: string;
  raw?: unknown;
}

export interface PlaylistPage {
  playlists: NormalizedPlaylist[];
  hasMore: boolean;
  nextCursor?: string; // opaque cursor or offset
  total?: number;
}

export interface TrackPage {
  tracks: NormalizedTrack[];
  hasMore: boolean;
  nextCursor?: string;
  total?: number;
}

export interface SearchQuery {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
}

export interface CreatePlaylistInput {
  name: string;
  description?: string;
  isPublic?: boolean;
  isCollaborative?: boolean;
}

export interface ProviderUser {
  providerAccountId: string;
  displayName?: string;
  email?: string;
  imageUrl?: string;
  country?: string;
  product?: string;
}

// Provider contract
export interface MusicProvider {
  readonly name: ProviderName;
  getCapabilities(): ProviderCapabilities;

  // Auth lifecycle
  getAuthorizationUrl(state: string, redirectUri: string, scopes?: string[]): string;
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scopes?: string;
  }>;
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
    refreshToken?: string;
  }>;

  // User
  getCurrentUser(accessToken: string): Promise<ProviderUser>;

  // Playlists
  listPlaylists(accessToken: string, cursor?: string, limit?: number): Promise<PlaylistPage>;
  getPlaylist(accessToken: string, playlistId: string): Promise<NormalizedPlaylist>;
  getPlaylistTracks(accessToken: string, playlistId: string, cursor?: string, limit?: number): Promise<TrackPage>;

  // Search
  searchTracks(accessToken: string, query: SearchQuery, limit?: number): Promise<NormalizedTrack[]>;

  // Write
  createPlaylist(accessToken: string, input: CreatePlaylistInput): Promise<NormalizedPlaylist>;
  addTracks(accessToken: string, playlistId: string, trackIds: string[], position?: number): Promise<void>;
  removeTracks(accessToken: string, playlistId: string, trackIds: string[]): Promise<void>;
}

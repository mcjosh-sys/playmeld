"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonList } from "@/components/ui/skeleton";
import { Music, ListMusic, User, Clock, Globe, Lock, Users, ChevronLeft, ChevronRight, Youtube, AlertCircle, Repeat } from "lucide-react";
import { ConnectButton } from "@/components/connections/connect-button";
import { SyncPlaylistModal } from "@/components/playlists/sync-playlist-modal";

interface ConnectedAccount {
  id: string;
  provider: string;
  providerAccountId: string;
  displayName?: string;
  avatarUrl?: string;
  isActive: boolean;
}

interface Playlist {
  provider: string;
  providerPlaylistId: string;
  name: string;
  description?: string;
  ownerName?: string;
  trackCount?: number;
  isPublic?: boolean;
  isCollaborative?: boolean;
  imageUrl?: string;
  url?: string;
}

interface Track {
  provider: string;
  providerTrackId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  url?: string;
  imageUrl?: string;
}

interface PlaylistBrowserProps {
  accounts: ConnectedAccount[];
}

export function PlaylistBrowser({ accounts }: PlaylistBrowserProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || "");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [hasMorePlaylists, setHasMorePlaylists] = useState(false);
  const [nextCursorPlaylists, setNextCursorPlaylists] = useState<string | undefined>();
  const [cursorHistoryPlaylists, setCursorHistoryPlaylists] = useState<string[]>([]);

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [hasMoreTracks, setHasMoreTracks] = useState(false);
  const [nextCursorTracks, setNextCursorTracks] = useState<string | undefined>();
  const [cursorHistoryTracks, setCursorHistoryTracks] = useState<string[]>([]);

  const [showSyncModal, setShowSyncModal] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // Fetch playlists when account changes
  useEffect(() => {
    if (!selectedAccountId) return;
    fetchPlaylists();
    setSelectedPlaylist(null);
    setTracks([]);
    setCursorHistoryPlaylists([]);
    setCursorHistoryTracks([]);
  }, [selectedAccountId]);

  const fetchPlaylists = async (cursor?: string) => {
    if (!selectedAccountId) return;
    setPlaylistsLoading(true);
    setPlaylistsError(null);

    try {
      const params = new URLSearchParams({
        accountId: selectedAccountId,
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/playlists?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch playlists");
      }

      // Handle empty, one-page, multi-page per music-provider skill
      const result = data.data;
      setPlaylists(result.playlists || []);
      setHasMorePlaylists(result.hasMore || false);
      setNextCursorPlaylists(result.nextCursor);
    } catch (err) {
      console.error("Fetch playlists error", err);
      setPlaylistsError(err instanceof Error ? err.message : "Failed to fetch playlists");
      setPlaylists([]);
    } finally {
      setPlaylistsLoading(false);
    }
  };

  const handleNextPlaylists = () => {
    if (nextCursorPlaylists) {
      const currentCursor = cursorHistoryPlaylists[cursorHistoryPlaylists.length - 1] || "";
      setCursorHistoryPlaylists([...cursorHistoryPlaylists, currentCursor]);
      fetchPlaylists(nextCursorPlaylists);
    }
  };

  const handlePrevPlaylists = () => {
    if (cursorHistoryPlaylists.length > 0) {
      const prevCursors = [...cursorHistoryPlaylists];
      const prevCursor = prevCursors.pop();
      setCursorHistoryPlaylists(prevCursors);
      fetchPlaylists(prevCursor || undefined);
    } else {
      fetchPlaylists();
    }
  };

  const handleSelectPlaylist = async (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setTracks([]);
    setCursorHistoryTracks([]);
    fetchTracks(playlist.providerPlaylistId);
  };

  const [tracksErrorDetails, setTracksErrorDetails] = useState<string | null>(null);

  const fetchTracks = async (playlistId: string, cursor?: string) => {
    if (!selectedAccountId) return;
    setTracksLoading(true);
    setTracksError(null);
    setTracksErrorDetails(null);

    try {
      const params = new URLSearchParams({
        accountId: selectedAccountId,
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}/tracks?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        // Handle 403 Forbidden with helpful details
        if (res.status === 403) {
          const errorMsg = data.error || "Forbidden: No permission to access this playlist";
          const details = data.details || data.help || "Playlist may be private and not owned by connected account, or missing scopes.";
          throw new Error(`${errorMsg} | ${details}`);
        }
        throw new Error(data.error || data.details || "Failed to fetch tracks");
      }

      const result = data.data;
      setTracks(result.tracks || []);
      setHasMoreTracks(result.hasMore || false);
      setNextCursorTracks(result.nextCursor);
    } catch (err) {
      console.error("Fetch tracks error", err);
      const message = err instanceof Error ? err.message : "Failed to fetch tracks";
      // Split error and details if contains |
      if (message.includes(" | ")) {
        const [main, details] = message.split(" | ");
        setTracksError(main);
        setTracksErrorDetails(details);
      } else {
        setTracksError(message);
      }
      setTracks([]);
    } finally {
      setTracksLoading(false);
    }
  };

  const handleNextTracks = () => {
    if (selectedPlaylist && nextCursorTracks) {
      const currentCursor = cursorHistoryTracks[cursorHistoryTracks.length - 1] || "";
      setCursorHistoryTracks([...cursorHistoryTracks, currentCursor]);
      fetchTracks(selectedPlaylist.providerPlaylistId, nextCursorTracks);
    }
  };

  const handlePrevTracks = () => {
    if (selectedPlaylist && cursorHistoryTracks.length > 0) {
      const prevCursors = [...cursorHistoryTracks];
      const prevCursor = prevCursors.pop();
      setCursorHistoryTracks(prevCursors);
      fetchTracks(selectedPlaylist.providerPlaylistId, prevCursor || undefined);
    } else if (selectedPlaylist) {
      fetchTracks(selectedPlaylist.providerPlaylistId);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "—";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (accounts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-12 pb-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <ListMusic className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="font-semibold">No connected accounts</h3>
            <p className="text-sm text-muted-foreground">Connect Spotify or YouTube Music to browse your playlists. We handle pagination for empty, one-page, and multi-page playlists.</p>
          </div>
          <div className="flex gap-2 justify-center">
            <ConnectButton provider="spotify" label="Connect Spotify" />
            <ConnectButton provider="youtube_music" label="Connect YouTube" variant="outline" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Account Selector + Playlists */}
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Account</CardTitle>
            <CardDescription className="text-xs">Choose provider to browse playlists</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 focus-ring ${
                  selectedAccountId === acc.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-accent/50"
                }`}
                aria-label={`Select ${acc.displayName || acc.providerAccountId} account`}
                aria-pressed={selectedAccountId === acc.id}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${acc.provider === "spotify" ? "bg-[#1DB954]/10 text-[#1DB954]" : acc.provider === "youtube_music" ? "bg-[#FF0000]/10 text-[#FF0000]" : "bg-muted"}`}>
                  {acc.provider === "spotify" ? <Music className="w-4 h-4" /> : acc.provider === "youtube_music" ? <Youtube className="w-4 h-4" /> : acc.displayName?.[0] || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{acc.displayName || acc.providerAccountId}</div>
                  <div className="text-xs text-muted-foreground capitalize">{acc.provider.replace("_", " ")} • {acc.isActive ? "Active" : "Inactive"}</div>
                </div>
                {selectedAccountId === acc.id && <div className="w-2 h-2 bg-primary rounded-full" aria-hidden="true" />}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ListMusic className="w-4 h-4" aria-hidden="true" />
                  Playlists
                </CardTitle>
                <CardDescription className="text-xs">
                  {selectedAccount ? `${selectedAccount.displayName || selectedAccount.providerAccountId} • ${playlists.length} loaded` : "Select account"}
                </CardDescription>
              </div>
              <Badge variant="outline" className="tabular-nums text-xs">{playlists.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {playlistsLoading ? (
              <SkeletonList count={3} />
            ) : playlistsError ? (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-2">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs">
                  <p className="font-medium text-destructive">Failed to load playlists</p>
                  <p className="text-muted-foreground break-words">{playlistsError}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => fetchPlaylists()}>
                    Retry
                  </Button>
                </div>
              </div>
            ) : playlists.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <ListMusic className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium">No playlists found</p>
                <p className="text-xs text-muted-foreground">Empty collection handled - this account has no playlists, or they are private.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {playlists.map((pl) => (
                    <button
                      key={pl.providerPlaylistId}
                      onClick={() => handleSelectPlaylist(pl)}
                      className={`w-full flex gap-3 p-3 rounded-xl border text-left transition-all duration-200 focus-ring ${
                        selectedPlaylist?.providerPlaylistId === pl.providerPlaylistId ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-accent/50"
                      }`}
                      aria-label={`Select playlist ${pl.name}`}
                      aria-pressed={selectedPlaylist?.providerPlaylistId === pl.providerPlaylistId}
                    >
                      {pl.imageUrl ? (
                        <img src={pl.imageUrl} alt={`${pl.name} cover`} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <ListMusic className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate" title={pl.name}>{pl.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                          {pl.ownerName && <span className="flex items-center gap-1"><User className="w-3 h-3" aria-hidden="true" />{pl.ownerName}</span>}
                          {pl.trackCount !== undefined && <span className="tabular-nums">{pl.trackCount} tracks</span>}
                        </div>
                        <div className="flex gap-1 mt-1">
                          {pl.isPublic !== undefined && (
                            <Badge variant={pl.isPublic ? "secondary" : "outline"} className="text-[10px] gap-1">
                              {pl.isPublic ? <Globe className="w-3 h-3" aria-hidden="true" /> : <Lock className="w-3 h-3" aria-hidden="true" />}
                              {pl.isPublic ? "Public" : "Private"}
                            </Badge>
                          )}
                          {pl.isCollaborative && <Badge variant="outline" className="text-[10px]"><Users className="w-3 h-3 mr-1" aria-hidden="true" />Collab</Badge>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Pagination - handles empty, one-page, multi-page, boundary-sized, error on later page */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPlaylists}
                    disabled={cursorHistoryPlaylists.length === 0 || playlistsLoading}
                    className="gap-1"
                    aria-label="Previous page of playlists"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Page {cursorHistoryPlaylists.length + 1} • {playlists.length} items
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPlaylists}
                    disabled={!hasMorePlaylists || playlistsLoading}
                    className="gap-1"
                    aria-label="Next page of playlists"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tracks */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Music className="w-4 h-4" aria-hidden="true" />
                  {selectedPlaylist ? selectedPlaylist.name : "Select a playlist"}
                </CardTitle>
                <CardDescription className="text-xs break-words">
                  {selectedPlaylist
                    ? `${selectedPlaylist.description || "No description"} • ${selectedPlaylist.trackCount ?? tracks.length} tracks • ${selectedAccount?.provider || ""}`
                    : "Choose a playlist to view its tracks with improved YouTube parsing and duration matching"}
                </CardDescription>
              </div>
              {selectedPlaylist && (
                <Badge variant="outline" className="tabular-nums flex-shrink-0">
                  {tracks.length} tracks loaded
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedPlaylist ? (
              <div className="text-center py-16 space-y-3">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <Music className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium">No playlist selected</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">Select a playlist from the left to view its tracks. We handle empty, one-page, multi-page, and error during later page per music-provider skill.</p>
              </div>
            ) : tracksLoading ? (
              <SkeletonList count={5} />
            ) : tracksError ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs flex-1 min-w-0 space-y-2">
                  <p className="font-medium text-destructive">Failed to load tracks: {tracksError}</p>
                  {tracksErrorDetails && (
                    <p className="text-muted-foreground break-words leading-relaxed">{tracksErrorDetails}</p>
                  )}
                  {(tracksError.toLowerCase().includes("forbidden") || tracksError.toLowerCase().includes("permission")) && (
                    <div className="text-muted-foreground space-y-2 border-t pt-3 mt-3">
                      <p className="font-medium text-foreground">Why this happens (Spotify API restriction):</p>
                      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 p-3 rounded-xl space-y-1">
                        <p className="text-yellow-800 dark:text-yellow-200 font-medium">Spotify only allows reading tracks for owned or collaborative playlists</p>
                        <p className="text-yellow-700 dark:text-yellow-300 text-[11px] leading-relaxed">Per Spotify docs: Get Playlist Items endpoint is ONLY accessible for playlists owned by current user or where user is collaborator. Returns 403 if neither, even if public. This is documented at developer.spotify.com/documentation/web-api/reference/get-playlists-items</p>
                      </div>
                      <p className="font-medium text-foreground mt-3">Possible fixes:</p>
                      <p>• <span className="font-medium">Use owned playlist as source:</span> In Spotify app, create new playlist you own, add all tracks from public playlist {selectedPlaylist?.providerPlaylistId}, then sync owned copy (ID: {selectedPlaylist?.providerPlaylistId})</p>
                      <p>• <span className="font-medium">Ask owner to add you as collaborator:</span> Make playlist collaborative and invite your account {selectedAccount?.providerAccountId}</p>
                      <p>• <span className="font-medium">Follow playlist first:</span> On Spotify app, follow public playlist, then retry - sometimes helps but new API still requires owner/collaborator</p>
                      <p>• <span className="font-medium">Check scopes:</span> Need playlist-read-private and playlist-read-collaborative - disconnect and reconnect Spotify to get new scopes with offline access</p>
                      <p>• For YouTube: Ensure playlist is owned (mine=true)</p>
                      <p>• Playlist ID {selectedPlaylist?.providerPlaylistId} owned by another user - need to be owner or collaborator per Spotify policy</p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => window.open(`https://open.spotify.com/playlist/${selectedPlaylist?.providerPlaylistId}`, '_blank')}>
                          Open on Spotify
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => window.open('https://developer.spotify.com/documentation/web-api/reference/get-playlists-items', '_blank')}>
                          View Spotify Docs
                        </Button>
                      </div>
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => selectedPlaylist && fetchTracks(selectedPlaylist.providerPlaylistId)}>
                    Retry
                  </Button>
                </div>
              </div>
            ) : tracks.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-sm font-medium">Empty playlist</p>
                <p className="text-xs text-muted-foreground">This playlist has no tracks - empty collection handled correctly per sync-engine skill.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {tracks.map((track, idx) => (
                    <div key={`${track.providerTrackId}-${idx}`} className="flex gap-3 p-3 rounded-xl border hover:bg-accent/30 transition-colors">
                      <div className="text-xs text-muted-foreground tabular-nums w-6 flex-shrink-0 pt-1">{idx + 1}</div>
                      {track.imageUrl ? (
                        <img src={track.imageUrl} alt={`${track.title} cover`} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Music className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate" title={track.title}>{track.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {track.artists.join(", ")} {track.album ? `• ${track.album}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums flex-shrink-0 flex items-center gap-2">
                        <span className="hidden sm:inline flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {formatDuration(track.durationMs)}
                        </span>
                        {track.url && (
                          <a href={track.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline focus-ring rounded" aria-label={`Open ${track.title} on ${track.provider}`}>
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevTracks}
                    disabled={cursorHistoryTracks.length === 0 || tracksLoading}
                    className="gap-1"
                    aria-label="Previous page of tracks"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Page {cursorHistoryTracks.length + 1} • {tracks.length} tracks • {selectedPlaylist.provider === "youtube_music" ? "YouTube durations fetched" : "Spotify ISRC available"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextTracks}
                    disabled={!hasMoreTracks || tracksLoading}
                    className="gap-1"
                    aria-label="Next page of tracks"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {selectedPlaylist && tracks.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Ready to sync?</p>
                  <p className="text-xs text-muted-foreground">Transfer {selectedPlaylist.name} ({tracks.length} tracks) to another connected account via BullMQ</p>
                  <p className="text-xs text-muted-foreground mt-1">Improved YouTube matching: cleaned titles, parsed artist/title, duration tolerance 15s, official audio boost, threshold 60 for YouTube</p>
                </div>
                <div className="flex-shrink-0">
                  <Button size="default" className="gap-2 w-full sm:w-auto" disabled={accounts.length < 2} onClick={() => setShowSyncModal(true)}>
                    <Repeat className="w-4 h-4" aria-hidden="true" />
                    Sync Playlist
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {showSyncModal && selectedPlaylist && (
          <SyncPlaylistModal
            sourceAccountId={selectedAccountId}
            sourcePlaylist={selectedPlaylist}
            accounts={accounts}
            onClose={() => setShowSyncModal(false)}
          />
        )}
      </div>
    </div>
  );
}

export type { ProviderName, NormalizedTrack, NormalizedPlaylist, ProviderCapabilities } from "@/lib/providers/types";

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
  total?: number;
}

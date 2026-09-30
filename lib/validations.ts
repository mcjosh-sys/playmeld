import { z } from "zod";

export const createSyncJobSchema = z.object({
  sourceAccountId: z.string().min(1),
  destinationAccountId: z.string().min(1),
  sourcePlaylistId: z.string().min(1),
  createNewPlaylist: z.boolean().default(true),
  destinationPlaylistName: z.string().optional(),
  destinationPlaylistDescription: z.string().optional(),
  preserveDuplicates: z.boolean().default(false),
  preserveOrder: z.boolean().default(true),
});

export const connectAccountSchema = z.object({
  provider: z.enum(["spotify", "apple_music", "youtube_music", "tidal", "deezer"]),
});

export const paystackInitializeSchema = z.object({
  planCode: z.string().min(1),
  email: z.string().email(),
});

export type CreateSyncJobInput = z.infer<typeof createSyncJobSchema>;

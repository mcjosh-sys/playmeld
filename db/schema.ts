import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  index,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";

// Enums
export const providerEnum = pgEnum("provider", [
  "spotify",
  "apple_music",
  "youtube_music",
  "tidal",
  "deezer",
]);

export const syncJobStatusEnum = pgEnum("sync_job_status", [
  "pending",
  "running",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

export const syncItemStatusEnum = pgEnum("sync_item_status", [
  "matched",
  "unmatched",
  "added",
  "skipped",
  "failed",
]);

export const planEnum = pgEnum("plan", ["free", "starter", "pro", "enterprise"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "cancelled",
  "past_due",
  "unpaid",
  "pending",
]);

// Users - NextAuth compatible
export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("users_email_idx").on(t.email)]
);

// Accounts - NextAuth OAuth for auth (Google, GitHub)
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    uniqueIndex("accounts_provider_unique").on(t.provider, t.providerAccountId),
    index("accounts_user_idx").on(t.userId),
  ]
);

// Sessions - NextAuth
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

// Verification tokens - NextAuth
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("verification_tokens_unique").on(t.identifier, t.token)]
);

// Workspaces - tenancy boundary for billing
export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: planEnum("plan").notNull().default("free"),
    paystackCustomerCode: text("paystack_customer_code").unique(),
    paystackCustomerId: integer("paystack_customer_id"),
    paystackSubscriptionCode: text("paystack_subscription_code"),
    paystackPlanCode: text("paystack_plan_code"),
    subscriptionStatus: subscriptionStatusEnum("subscription_status"),
    subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("workspaces_slug_idx").on(t.slug),
    index("workspaces_owner_idx").on(t.ownerId),
    index("workspaces_paystack_customer_idx").on(t.paystackCustomerCode),
  ]
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | admin | member
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId),
    index("workspace_members_workspace_idx").on(t.workspaceId),
    index("workspace_members_user_idx").on(t.userId),
  ]
);

// Connected Accounts - user's linked music providers
export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerAccountEmail: text("provider_account_email"),
    displayName: text("display_name"),
    // Encrypted tokens - stored as ciphertext, not plaintext
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    // Provider metadata
    avatarUrl: text("avatar_url"),
    country: text("country"),
    product: text("product"), // e.g., spotify premium
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("connected_accounts_user_provider_account_unique").on(
      t.userId,
      t.provider,
      t.providerAccountId
    ),
    index("connected_accounts_user_idx").on(t.userId),
    index("connected_accounts_provider_idx").on(t.provider),
  ]
);

// Sync Jobs
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    sourceAccountId: text("source_account_id")
      .notNull()
      .references(() => connectedAccounts.id, { onDelete: "cascade" }),
    destinationAccountId: text("destination_account_id")
      .notNull()
      .references(() => connectedAccounts.id, { onDelete: "cascade" }),
    sourcePlaylistId: text("source_playlist_id").notNull(),
    sourcePlaylistName: text("source_playlist_name"),
    sourcePlaylistUrl: text("source_playlist_url"),
    destinationPlaylistId: text("destination_playlist_id"),
    destinationPlaylistName: text("destination_playlist_name"),
    destinationPlaylistUrl: text("destination_playlist_url"),
    status: syncJobStatusEnum("status").notNull().default("pending"),
    // Config as JSONB
    config: jsonb("config")
      .$type<{
        createNewPlaylist: boolean;
        preserveDuplicates: boolean;
        preserveOrder: boolean;
        isPublic?: boolean;
        description?: string;
      }>()
      .notNull()
      .default({
        createNewPlaylist: true,
        preserveDuplicates: false,
        preserveOrder: true,
      }),
    // Progress
    progress: jsonb("progress").$type<{
      phase: string;
      totalTracks: number;
      processedTracks: number;
      matchedTracks: number;
      unmatchedTracks: number;
      failedTracks: number;
      addedTracks: number;
      skippedTracks: number;
    }>(),
    totalTracks: integer("total_tracks"),
    processedTracks: integer("processed_tracks").default(0),
    matchedTracks: integer("matched_tracks").default(0),
    unmatchedTracks: integer("unmatched_tracks").default(0),
    failedTracks: integer("failed_tracks").default(0),
    // Error handling
    errorMessage: text("error_message"),
    errorCode: text("error_code"),
    retryCount: integer("retry_count").default(0),
    maxRetries: integer("max_retries").default(3),
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    index("sync_jobs_user_idx").on(t.userId),
    index("sync_jobs_workspace_idx").on(t.workspaceId),
    index("sync_jobs_status_idx").on(t.status),
    index("sync_jobs_created_at_idx").on(t.createdAt),
    index("sync_jobs_source_account_idx").on(t.sourceAccountId),
    index("sync_jobs_dest_account_idx").on(t.destinationAccountId),
  ]
);

// Sync Runs - each execution attempt of a job
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    syncJobId: text("sync_job_id")
      .notNull()
      .references(() => syncJobs.id, { onDelete: "cascade" }),
    status: syncJobStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sync_runs_job_idx").on(t.syncJobId),
    index("sync_runs_status_idx").on(t.status),
  ]
);

// Sync Items - per-track results
export const syncItems = pgTable(
  "sync_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    syncRunId: text("sync_run_id")
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    syncJobId: text("sync_job_id")
      .notNull()
      .references(() => syncJobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    sourceTrack: jsonb("source_track")
      .$type<{
        provider: string;
        providerTrackId: string;
        title: string;
        artists: string[];
        album?: string;
        durationMs?: number;
        isrc?: string;
        url?: string;
        imageUrl?: string;
        raw?: unknown;
      }>()
      .notNull(),
    destinationTrack: jsonb("destination_track").$type<{
      provider: string;
      providerTrackId: string;
      title: string;
      artists: string[];
      album?: string;
      durationMs?: number;
      isrc?: string;
      url?: string;
      imageUrl?: string;
      confidence?: number;
      raw?: unknown;
    }>(),
    status: syncItemStatusEnum("status").notNull(),
    confidence: integer("confidence"), // 0-100
    errorMessage: text("error_message"),
    isRetryable: boolean("is_retryable").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sync_items_run_idx").on(t.syncRunId),
    index("sync_items_job_idx").on(t.syncJobId),
    index("sync_items_status_idx").on(t.status),
  ]
);

// Paystack Events - idempotent webhook handling
export const paystackEvents = pgTable(
  "paystack_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("event_id").notNull().unique(), // Paystack event id or our generated id from payload
    type: text("type").notNull(), // e.g., charge.success, subscription.create
    processed: boolean("processed").notNull().default(false),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("paystack_events_event_id_idx").on(t.eventId),
    index("paystack_events_type_idx").on(t.type),
    index("paystack_events_processed_idx").on(t.processed),
  ]
);

// Subscriptions - detailed subscription tracking (alternative to workspace fields, for history)
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paystackCustomerCode: text("paystack_customer_code").notNull(),
    paystackSubscriptionCode: text("paystack_subscription_code").unique(),
    paystackPlanCode: text("paystack_plan_code").notNull(),
    paystackEmailToken: text("paystack_email_token"),
    status: subscriptionStatusEnum("status").notNull(),
    amount: integer("amount"), // in kobo
    currency: text("currency").default("NGN"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("subscriptions_workspace_idx").on(t.workspaceId),
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_status_idx").on(t.status),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  connectedAccounts: many(connectedAccounts),
  syncJobs: many(syncJobs),
  workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  syncJobs: many(syncJobs),
  subscriptions: many(subscriptions),
}));

export const connectedAccountsRelations = relations(connectedAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [connectedAccounts.userId],
    references: [users.id],
  }),
  sourceSyncJobs: many(syncJobs, { relationName: "sourceAccount" }),
  destinationSyncJobs: many(syncJobs, { relationName: "destinationAccount" }),
}));

export const syncJobsRelations = relations(syncJobs, ({ one, many }) => ({
  user: one(users, {
    fields: [syncJobs.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [syncJobs.workspaceId],
    references: [workspaces.id],
  }),
  sourceAccount: one(connectedAccounts, {
    fields: [syncJobs.sourceAccountId],
    references: [connectedAccounts.id],
    relationName: "sourceAccount",
  }),
  destinationAccount: one(connectedAccounts, {
    fields: [syncJobs.destinationAccountId],
    references: [connectedAccounts.id],
    relationName: "destinationAccount",
  }),
  runs: many(syncRuns),
  items: many(syncItems),
}));

export const syncRunsRelations = relations(syncRuns, ({ one, many }) => ({
  syncJob: one(syncJobs, {
    fields: [syncRuns.syncJobId],
    references: [syncJobs.id],
  }),
  items: many(syncItems),
}));

export const syncItemsRelations = relations(syncItems, ({ one }) => ({
  syncRun: one(syncRuns, {
    fields: [syncItems.syncRunId],
    references: [syncRuns.id],
  }),
  syncJob: one(syncJobs, {
    fields: [syncItems.syncJobId],
    references: [syncJobs.id],
  }),
}));

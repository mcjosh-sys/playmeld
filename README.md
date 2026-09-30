# PlayMeld

PlayMeld is a SaaS that allows users to connect different music platforms and synchronize playlists between them. Built with Next.js, BullMQ, Redis, Drizzle, Neon, Paystack.

Licensed under AGPL-3.0.

## Architecture

PlayMeld follows a modular monolith architecture with clear boundaries, now powered by BullMQ for background jobs:

```
Web / UI
   |
   v
Application/API layer
   |
   +--------------------+------------------+
   |                    |                  |
   v                    v                  v
Domain services     Provider adapters   BullMQ Queue (Redis)
   |                    |                  |
   v                    v                  v
Sync engine          Music APIs        Worker (5 concurrency, 10/sec limiter)
   |                    |                  |
   v                    v                  v
Persistence / jobs / sync records (Neon Postgres)
```

### Core Principles

- **Provider abstraction mandatory**: Application code depends on `MusicProvider` interface, not directly on Spotify/etc SDKs
- **Normalized domain models**: `User`, `ConnectedAccount`, `Playlist`, `Track`, `SyncJob`, `SyncRun`, `TrackMatch`, etc. Provider-specific IDs retained as external identifiers
- **Async sync via BullMQ**: `request sync -> create SyncJob -> enqueue to BullMQ (Redis) -> worker (5 concurrency, 10/sec) -> persist progress -> UI observes` with fallback cron for Vercel
- **Partial failure**: Represent successful, unmatched, skipped, failed tracks separately
- **Idempotency**: Retries safe with exponential backoff 5s/25s/125s, no uncontrolled duplicates
- **Capabilities**: Explicitly model what each provider supports
- **Authorization close to resource**: Every user-owned resource checked server-side
- **Observability**: Structured sync state without secrets in logs, queue metrics via `/api/queue/metrics`

## Stack

- **Framework**: Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui
- **Database**: Drizzle ORM + PostgreSQL (Neon) + plans + usage_records
- **Auth**: NextAuth v5 (Auth.js) with Drizzle adapter, Google + GitHub
- **Queue**: BullMQ 5.26 + ioredis 5.4 + Redis (local, Upstash, or Vercel KV)
- **Payments**: Paystack with competitive NGN pricing, free tier, yearly discounts 28-33% off
- **ngrok**: Local OAuth callbacks via canonical hostname `intensely-actual-chipmunk.ngrok-free.app`
- **Deployment**: Vercel (with cron fallback) + Docker containerization (multi-stage Dockerfile + docker-compose with Postgres + Redis + App + Worker)

## Competitive Pricing Model

Based on market research: Soundiiz $4.5/mo yearly, TuneMyMusic $4.5/mo, FreeYourMusic $14.99 one-time. PlayMeld is cheaper and built for Africa via Paystack.

### Plans (NGN + USD equivalents)

**Free - ₦0 / $0 forever:**
- 2 connected accounts (so you can actually try syncing)
- 3 syncs per month
- Up to 100 tracks per sync
- Manual sync only, basic matching, private playlists only
- Community support
- No credit card required

**Starter - ₦1,500/mo ($2.99) or ₦12,000/year ($24) - 33% off - Most Popular:**
- 4 connected accounts
- 30 syncs per month
- Unlimited tracks per sync, up to 5 playlists bulk
- Preserve order, advanced matching (ISRC + metadata), public & private
- Daily auto-sync (24h interval)
- Standard support

**Pro - ₦3,500/mo ($6.99) or ₦30,000/year ($60) - 28% off:**
- Unlimited connected accounts, unlimited syncs, unlimited tracks & playlists
- Preserve order & duplicates, advanced matching + confidence control
- Public, private & collaborative playlists
- Hourly auto-sync (1h interval)
- Priority support, early access to new providers
- Cancel anytime

**Enterprise - ₦15,000/mo ($29) or ₦150,000/year ($290):**
- Everything in Pro
- Team access up to 10 members, API access, SSO (coming), SLA, custom integrations, audit logs

**Limits enforced server-side** in both API (`/api/sync-jobs`) and worker (`lib/sync/worker.ts`) via `lib/billing/plans.ts`:
- `maxConnectedAccounts`, `maxSyncsPerMonth`, `maxTracksPerSync`, `canPreserveOrder`, `canPreserveDuplicates`, `canUseAdvancedMatching`, `canAutoSync`, `autoSyncIntervalHours`, etc.
- Usage tracked in `usage_records` table (userId, month YYYY-MM, syncCount)

**Yearly discounts:** Starter 33% off, Pro 28% off, Enterprise 16% off - competitive vs competitors.

### Plans in DB

Plans stored in `plans` table (id, name, description, priceMonthly kobo, priceYearly kobo, currency, paystackMonthlyPlanCode, paystackYearlyPlanCode, limits jsonb, features jsonb, isActive, isPopular).

Seed:
```bash
npm run db:seed:plans
```

Create Paystack plans via API:
```bash
npm run db:create-paystack-plans
# Creates 6 plans in Paystack: Starter Monthly/Yearly, Pro Monthly/Yearly, Enterprise Monthly/Yearly
# Updates DB with plan codes
# Outputs env vars for .env.local and Vercel
```

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (Neon via DATABASE_URL, or local via Docker)
- Redis (local, Upstash, or Vercel KV) for BullMQ
- ngrok installed (`ngrok version 3.39.11`) for local OAuth
- Spotify Developer app, Google OAuth, GitHub OAuth

### Environment

Copy `.env.example` to `.env.local`:

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379 # or Upstash rediss://...
UPSTASH_REDIS_URL= # alternative
KV_URL= # Vercel KV alternative
CRON_SECRET= # for Vercel cron verification

NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=openssl rand -base64 32

PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_STARTER_MONTHLY_PLAN_CODE=...
PAYSTACK_STARTER_YEARLY_PLAN_CODE=...
PAYSTACK_PRO_MONTHLY_PLAN_CODE=...
PAYSTACK_PRO_YEARLY_PLAN_CODE=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

NGROK_AUTHTOKEN=...
NGROK_HOSTNAME=intensely-actual-chipmunk.ngrok-free.app
```

Generate secrets:
```bash
openssl rand -base64 32 # NEXTAUTH_SECRET
openssl rand -base64 32 # TOKEN_ENCRYPTION_KEY
openssl rand -base64 32 # CRON_SECRET
```

### Install

```bash
npm install
```

### Database

```bash
npx drizzle-kit generate
npx drizzle-kit push --force
# or migrate

npm run db:seed:plans # seed competitive pricing plans
npm run db:seed # optional dev user/workspace
npm run db:create-paystack-plans # create Paystack plans via API (needs PAYSTACK_SECRET_KEY)
```

### Redis for BullMQ

**Local (Docker):**
```bash
docker run -d -p 6379:6379 redis:7-alpine
# or via docker-compose (includes Postgres + Redis + App + Worker)
docker-compose up -d postgres redis
```

**Upstash (for Vercel):**
- Create Redis at https://upstash.com
- Set `UPSTASH_REDIS_URL` or `REDIS_URL` with `rediss://` TLS URL
- ioredis handles TLS automatically

**Vercel KV:**
- Create KV at Vercel dashboard, set `KV_URL`

### Development

```bash
# Terminal 1: Next.js
npm run dev # http://localhost:3000

# Terminal 2: BullMQ Worker (needs Redis)
npm run worker:dev # watches lib/sync/worker.ts, concurrency 5, limiter 10/sec

# Terminal 3: ngrok for OAuth (optional)
./scripts/ngrok.sh 3000
# or
ngrok http --domain=intensely-actual-chipmunk.ngrok-free.app 3000
```

### Docker (Containerized)

```bash
# Build and run all services
docker-compose up --build

# Services:
# - postgres:5432 (playmeld:playmeld_dev_password@postgres:5432/playmeld)
# - redis:6379
# - app:3000 (Next.js)
# - worker (BullMQ worker, restart unless-stopped)

# Or build standalone Next.js for Docker
DOCKER_BUILD=true npm run build
docker build -t playmeld --target runner .
docker run -p 3000:3000 --env-file .env.local playmeld

# Worker standalone
docker build -t playmeld-worker --target worker .
docker run --env-file .env.local playmeld-worker
```

### Vercel Deployment

**Dynamic - works on Vercel + containerized:**

1. Push to GitHub (already done)
2. Import project in Vercel dashboard
3. Set env vars:
   - `DATABASE_URL` (Neon prod)
   - `REDIS_URL` or `UPSTASH_REDIS_URL` or `KV_URL` (Upstash Redis recommended for Vercel)
   - `NEXTAUTH_URL` = `https://yourdomain.vercel.app`
   - `NEXT_PUBLIC_APP_URL` = `https://yourdomain.vercel.app`
   - `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`
   - `PAYSTACK_PUBLIC_KEY` (live), `PAYSTACK_SECRET_KEY` (live), plan codes
   - `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `SPOTIFY_CLIENT_ID/SECRET`
4. Vercel will run `npm run build` - 20 routes including `/api/cron/process-pending-jobs`
5. Cron configured in `vercel.json`: runs every 5 min to monitor pending jobs (fallback when Redis not available)
6. For BullMQ worker on Vercel: **Vercel is serverless, worker needs separate service**
   - Option A: Deploy worker to Railway, Fly.io, or Render with same env + `npm run worker`
   - Option B: Use docker-compose worker service self-hosted
   - Option C: Use Vercel cron + `/api/sync-jobs/[id]/process` fallback (processes up to 5 pending jobs per cron run, but limited to 60s maxDuration)
7. Set `vercel.json` functions maxDuration: process route 60s, webhook 10s

**vercel.json:**
```json
{
  "crons": [{ "path": "/api/cron/process-pending-jobs", "schedule": "*/5 * * * *" }],
  "functions": {
    "app/api/sync-jobs/[id]/process/route.ts": { "maxDuration": 60 }
  }
}
```

### ngrok for OAuth

When you need public callback for Spotify/Google OAuth during local dev:

1. Start Next.js: `npm run dev` (port 3000)
2. Start ngrok: `ngrok http --domain=intensely-actual-chipmunk.ngrok-free.app 3000` or `./scripts/ngrok.sh`
3. Verify: `https://intensely-actual-chipmunk.ngrok-free.app/api/health`
4. Configure providers:
   - **Spotify Dashboard**: `https://intensely-actual-chipmunk.ngrok-free.app/api/connected-accounts/callback/spotify`
   - **Google Cloud**: `https://intensely-actual-chipmunk.ngrok-free.app/api/auth/callback/google` (Authorized redirect URI) + `https://intensely-actual-chipmunk.ngrok-free.app` (Authorized JS origin)
   - **GitHub**: `https://intensely-actual-chipmunk.ngrok-free.app/api/auth/callback/github`
   - **Paystack Webhook**: `https://intensely-actual-chipmunk.ngrok-free.app/api/webhooks/paystack`
5. Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to ngrok hostname for testing
6. Test OAuth flow
7. Shut down tunnel when done

Security: Never expose prod DB, admin, secrets via ngrok. Use canonical hostname, don't substitute random URL.

### Paystack

- Public key client-side where required, sourced from env
- Secret key server-side only, never in client bundles, logs, commits
- Webhook HMAC SHA512, header `x-paystack-signature`, timingSafeEqual
- Idempotent via `paystack_events` table
- Server-side plan enforcement via `lib/billing/plans.ts` and `lib/billing/paystack.ts`

Create plans:
```bash
npm run db:create-paystack-plans
```

Initialize transaction:
```typescript
POST /api/billing/paystack/initialize
{ "planCode": "PLN_xxx", "email": "user@example.com" }
```

Verify:
```
GET /api/billing/paystack/verify?reference=REF
```

Webhook:
```
POST /api/webhooks/paystack
Headers: x-paystack-signature
```

Plans API:
```
GET /api/plans # lists active plans from DB or config fallback
```

## Music Providers

### Spotify (Implemented)

- Docs: https://developer.spotify.com/documentation/web-api
- OAuth: Authorization Code Flow, state with userId/nonce/timestamp, 5min expiry
- Scopes: `playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-read-email user-read-private` minimal
- Pagination: limit/offset, handles empty/one-page/multi-page/error on later page, terminates via next null
- Rate limit: 429 with Retry-After parsed to ms, throws `ProviderRateLimitError` retryable
- Batch: max 100 tracks per add, chunked
- Endpoints: /me, /me/playlists, /playlists/{id}, /playlists/{id}/tracks, /search, /playlists POST, /playlists/{id}/tracks POST/DELETE
- Error hierarchy: `ProviderAuthenticationError`, `ProviderPermissionError`, `ProviderNotFoundError`, `ProviderRateLimitError`, `ProviderTransientError`, `ProviderUnsupportedOperationError`

Provider contract `lib/providers/types.ts`:
```typescript
MusicProvider
  getCapabilities() -> { canReadPlaylists, canReadPlaylistTracks, canCreatePlaylists, canAddTracks, canRemoveTracks, supportsPublicPrivate, supportsCollaborative, maxTracksPerAddRequest 100, searchSupportsISRC }
  getAuthorizationUrl(state, redirectUri, scopes?)
  exchangeCodeForTokens(code, redirectUri)
  refreshAccessToken(refreshToken)
  getCurrentUser(accessToken)
  listPlaylists(accessToken, cursor, limit)
  getPlaylist(accessToken, playlistId)
  getPlaylistTracks(accessToken, playlistId, cursor, limit)
  searchTracks(accessToken, query, limit)
  createPlaylist(accessToken, input)
  addTracks(accessToken, playlistId, trackIds, position?)
  removeTracks(accessToken, playlistId, trackIds)
```

Factory `lib/providers/factory.ts`: `getProvider(name)`, `getSupportedProviders()` returns ["spotify"], throws `ProviderUnsupportedOperationError` for others.

Future: Apple Music, YouTube Music, Tidal, Deezer implement same interface in `lib/providers/<provider>/`.

### Track Matching

Confidence pipeline:
1. ISRC exact match 100%
2. Strong metadata title+artist+album+duration tolerance 95%
3. Normalized title+artist 75%
4. Provider search candidates
5. Fuzzy only if >=70% threshold
6. Otherwise unmatched - never silent low-confidence

Normalization: unicode NFKD diacritics removal, case folding, whitespace, featuring handling (feat./ft./featuring), version indicators (Live, Remix, Acoustic, Instrumental, Clean, Explicit, edition) preserved for scoring.

Tests: ISRC exact PASS, low confidence unmatched PASS, empty candidates PASS.

## Sync Engine with BullMQ

Workflow:
```
Source playlist
  -> Read all source tracks (paginated, handles empty, 1-track, multi-page)
  -> Normalize tracks
  -> Resolve destination matches (search + matcher 70% threshold)
  -> Plan destination changes (idempotency check existing dest, dedup per config)
  -> Apply changes (create playlist if needed, add tracks batched 100 for Spotify)
  -> Record per-track results (matched, unmatched, added, skipped, failed)
  -> Finalize SyncRun
  -> Update usage_records
```

**BullMQ Queue (`lib/queue.ts`):**
- `getRedisConnection()` handles REDIS_URL, UPSTASH_REDIS_URL, KV_URL, localhost fallback, TLS for Upstash
- `getSyncQueue()` Queue "sync-jobs" with defaultJobOptions attempts 3, exponential backoff 5s/25s/125s, removeOnComplete 1h/1000 count, removeOnFail 24h
- `enqueueSyncJob(data: SyncJobData)` adds job "process-sync" with jobId `sync-${syncJobId}-${timestamp}`, returns BullMQ job id, fallback to DB if Redis unavailable
- `getQueueMetrics()` waiting/active/completed/failed/delayed
- `closeQueue()` graceful shutdown

**Worker (`lib/sync/worker.ts`):**
- `processSyncJob(job: Job<SyncJobData>)`:
  - Verifies job ownership (syncJobs.userId == userId) - security
  - Loads accounts with ownership verification
  - Checks usage limits server-side via `usage_records` and `getPlanLimits(planId)` - billing enforcement
  - Marks running, creates sync_run
  - Decrypts tokens (never logged)
  - Enforces track limit for plan (maxTracksPerSync)
  - Executes SyncEngine with onProgress (updates DB every 10 tracks + BullMQ job progress) and isCancelled check
  - Handles cancellation (mark cancelled)
  - Persists results: updates sync_jobs with status, destination, counts, error, timestamps, updates sync_runs, inserts sync_items batched 100, updates usage_records increment
  - Handles retryable errors: if ProviderError retryable and attempts < max, update retryCount and throw to trigger BullMQ backoff retry
  - Permanent failure: mark failed
- `createSyncWorker()` Worker "sync-jobs" concurrency 5, limiter max 10/sec to respect provider rate limits, handlers completed/failed/error/stalled
- If run directly `npm run worker`: checks DATABASE_URL, REDIS_URL fallback localhost, creates worker, graceful shutdown SIGTERM/SIGINT

**API Integration:**
- `POST /api/sync-jobs`: ownership checks, plan limits enforcement (maxConnectedAccounts, maxSyncsPerMonth, canPreserveDuplicates, canPreserveOrder) returns 403 if exceeded, creates job pending, enqueues via BullMQ, returns 202 with job + queue bullmqJobId, fallback to DB pending if Redis unavailable
- `POST /api/sync-jobs/[id]/process`: fallback worker endpoint for Vercel without Redis or manual trigger, same logic as worker but without queue, handles retries bounded
- `GET /api/queue/metrics`: auth, returns queue metrics or redis_not_available fallback message
- `GET /api/cron/process-pending-jobs`: Vercel cron every 5 min, verifies CRON_SECRET Bearer, finds pending jobs max 5, logs age, returns needs_processing list, note about separate worker service needed

**Vercel + Containerization Dynamic:**
- Vercel: serverless, cron fallback, worker separate service (Railway/Fly.io/Docker)
- Docker: `Dockerfile` multi-stage (base, deps, builder, runner for Next.js standalone, worker for BullMQ), `docker-compose.yml` with postgres:15-alpine, redis:7-alpine, app:3000, worker restart unless-stopped, healthchecks, volumes
- `.dockerignore` excludes node_modules, .next, .git, env, etc.
- `next.config.mjs` output standalone if DOCKER_BUILD=true, images remotePatterns for Spotify/Google/GitHub, experimental serverActions allowedOrigins includes localhost, ngrok, *.vercel.app
- `vercel.json` framework nextjs, functions maxDuration 60s for process, 10s webhook, crons every 5 min

## Security

- Server-side identity authoritative: `auth()` -> `session.user.id`, never trust client userId
- Ownership checks every resource: `connected_accounts.userId == session.user.id`, `sync_jobs.userId == session.user.id`, etc.
- Tokens AES-256-GCM encrypted at rest with `TOKEN_ENCRYPTION_KEY`, never logged, never in URLs, never returned to client, decrypt only server-side
- OAuth state validation: contains userId, nonce, timestamp, validates userId matches session, timestamp 5min window prevents replay
- Least privilege scopes (Spotify minimal)
- Background jobs verify ownership (worker checks syncJobs.userId == userId, connectedAccounts.userId == userId)
- IDOR/BOLA: ownership queries, 404 if not owned, tests via pattern
- Safe errors: no tokens, secrets, SQL internals, stack traces in prod, errorMessage sliced 500 chars
- Webhooks HMAC SHA512 verification mandatory, timingSafeEqual, idempotent via paystack_events eventId unique, handles replay
- Billing enforced server-side in both API and worker via `getPlanLimits` and `usage_records`, not trusting client
- No secrets in commits (grep verified), .env.local ignored, .env.example placeholders
- BullMQ: Redis connection errors handled, fallback to DB, no secrets in logs

## Testing

- **Unit**: matcher (ISRC exact, low confidence unmatched, empty) PASS, encryption roundtrip PASS, Paystack signature valid/invalid PASS, provider factory caps PASS
- **Integration**: API authz via ownership checks, plan limits 403, IDOR pattern
- **Manual E2E**: Connect Spotify via ngrok, list playlists paginated, transfer empty (0 tracks), 1-track, multi-page (>100), duplicate handling preserveDuplicates config, check destination creation and batch add, partial failure breakdown, billing initialize/verify/webhook, queue metrics, cron
- **Build**: `npm run build` PASS with 20 routes (including plans, queue/metrics, cron), middleware 161kB, warning about valkey-glide optional dep (ignored)
- **Security**: grep for secrets, token logs, .env.local not tracked, safe errors

## Project Structure

```
app/
  (auth)/login
  (dashboard)/dashboard, connections, playlists, syncs, settings
  api/auth/[...nextauth], connected-accounts/[provider]/authorize, connected-accounts/callback/[provider], connected-accounts, playlists, sync-jobs, sync-jobs/[id], sync-jobs/[id]/cancel, sync-jobs/[id]/process, billing/paystack/initialize, billing/paystack/verify, webhooks/paystack, health, plans, queue/metrics, cron/process-pending-jobs
components/ui/button, card, input, badge
lib/
  auth.ts, db.ts, encryption.ts, validations.ts, utils.ts, queue.ts
  providers/types.ts, errors.ts, factory.ts, spotify/client.ts
  sync/normalizer.ts, matcher.ts, planner.ts, engine.ts, worker.ts
  billing/plans.ts (competitive pricing), paystack.ts
db/schema.ts (14 tables: users, accounts, sessions, verification_tokens, workspaces, workspace_members, connected_accounts, sync_jobs, sync_runs, sync_items, paystack_events, subscriptions, plans, usage_records), migrations/0000_striped_shockwave.sql, 0001_giant_miracleman.sql, seed.ts, seed-plans.ts
scripts/ngrok.sh, seed-plans.ts, create-paystack-plans.ts
hooks/use-current-user.ts
types/index.ts
Dockerfile (multi-stage runner + worker), docker-compose.yml (postgres + redis + app + worker), vercel.json (crons), .dockerignore
next.config.mjs (standalone for Docker, images remotePatterns, allowedOrigins), tailwind.config.ts, drizzle.config.ts, tsconfig.json
```

## Deployment

**Vercel (Primary):**
- Framework Next.js, build `npm run build`, install `npm install`
- Env vars: DATABASE_URL (Neon prod), REDIS_URL or UPSTASH_REDIS_URL (Upstash), NEXTAUTH_URL, NEXT_PUBLIC_APP_URL, NEXTAUTH_SECRET, TOKEN_ENCRYPTION_KEY, CRON_SECRET, PAYSTACK live keys + plan codes, GOOGLE, GITHUB, SPOTIFY creds
- Functions maxDuration: process 60s, webhook 10s
- Crons: `/api/cron/process-pending-jobs` every 5 min fallback monitoring
- Worker separate service: Deploy `npm run worker` to Railway/Fly.io/Render with same env, or self-host Docker worker

**Docker (Containerized):**
- `docker-compose up --build` runs postgres:15-alpine (5432), redis:7-alpine (6379), app:3000, worker
- `Dockerfile` multi-stage: deps (npm ci), builder (npm run build), runner (standalone Next.js, public, .next/static, db), worker (bullmq + ioredis + lib/db)
- `DOCKER_BUILD=true` enables standalone output for Docker
- Healthchecks for postgres and redis
- Volumes for postgres_data and redis_data

**Environment Separation:**
- Prod and dev DB configs separate, never expose prod creds
- Paystack test keys `pk_test_...` `sk_test_...` for dev, live keys for prod via env separation
- Build must pass, no secrets in commits/logs/client bundles

## License

AGPL-3.0 - Source available at https://github.com/mcjosh-sys/playmeld

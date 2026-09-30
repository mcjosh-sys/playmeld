# PlayMeld

PlayMeld is a SaaS that allows users to connect different music platforms and synchronize playlists between them.

Licensed under AGPL-3.0.

## Architecture

PlayMeld follows a modular monolith architecture with clear boundaries:

```
Web / UI
   |
   v
Application/API layer
   |
   +--------------------+
   |                    |
   v                    v
Domain services     Provider adapters
   |                    |
   v                    v
Sync engine          Music APIs
   |
   v
Persistence / jobs / sync records
```

### Core Principles

- **Provider abstraction mandatory**: Application code depends on `MusicProvider` interface, not directly on Spotify/etc SDKs
- **Normalized domain models**: `User`, `ConnectedAccount`, `Playlist`, `Track`, `SyncJob`, `SyncRun`, `TrackMatch`, etc. Provider-specific IDs retained as external identifiers
- **Async sync**: `request sync -> create SyncJob -> enqueue -> worker -> persist progress -> UI observes`
- **Partial failure**: Represent successful, unmatched, skipped, failed tracks separately
- **Idempotency**: Retries safe, no uncontrolled duplicates
- **Capabilities**: Explicitly model what each provider supports
- **Authorization close to resource**: Every user-owned resource checked server-side
- **Observability**: Structured sync state without secrets in logs

## Stack

- Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui
- Drizzle ORM + PostgreSQL (Neon)
- NextAuth v5 (Auth.js) with Drizzle adapter
- Paystack for payments (test keys in env)
- ngrok for local OAuth callbacks (canonical hostname: `intensely-actual-chipmunk.ngrok-free.app`)

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (Neon provided via DATABASE_URL, or local)
- ngrok installed (`ngrok version 3.39.11`)
- Spotify Developer app (for provider integration)

### Environment

Copy `.env.example` to `.env.local` and fill:

```bash
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
TOKEN_ENCRYPTION_KEY=openssl rand -base64 32
PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
NGROK_AUTHTOKEN=...
```

Generate secrets:

```bash
openssl rand -base64 32 # for NEXTAUTH_SECRET
openssl rand -base64 32 # for TOKEN_ENCRYPTION_KEY (32 bytes base64)
```

### Install

```bash
npm install
```

### Database

```bash
npx drizzle-kit generate
npx drizzle-kit push --force
# or
npx drizzle-kit migrate

npm run db:seed # optional dev seed
```

### Development

```bash
npm run dev # http://localhost:3000
```

### ngrok for OAuth

When you need a public callback for Spotify OAuth:

1. Find your local port (default 3000 from package.json)
2. Start Next.js: `npm run dev`
3. Start ngrok:

```bash
ngrok http --domain=intensely-actual-chipmunk.ngrok-free.app 3000
```

4. Verify public endpoint: `https://intensely-actual-chipmunk.ngrok-free.app/api/health`
5. Configure Spotify Dashboard redirect URI:

```
https://intensely-actual-chipmunk.ngrok-free.app/api/connected-accounts/callback/spotify
```

6. Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to ngrok hostname for testing
7. Test OAuth flow
8. Shut down tunnel when done

Security: Never expose prod DB, admin interfaces, secrets through ngrok. Use canonical hostname, don't silently substitute random URL.

### Paystack

- Public key may be used client-side where Paystack requires it, sourced from env
- Secret key stays server-side only, never in client bundles, logs, commits
- Webhook verification: HMAC SHA512 of payload with secret key, header `x-paystack-signature`
- Idempotent webhook handling via `paystack_events` table (eventId unique)
- Server-side plan enforcement via `canAccessFeature` and `getPlanLimits`

Initialize transaction:

```typescript
POST /api/billing/paystack/initialize
{
  "planCode": "PLAN_CODE",
  "email": "user@example.com"
}
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

## Music Providers

### Spotify (Implemented)

- Docs: https://developer.spotify.com/documentation/web-api
- OAuth: Authorization Code Flow
- Scopes: `playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-read-email user-read-private`
- Pagination: limit/offset, handles empty, one-page, multi-page, error on later page
- Rate limit: 429 with Retry-After
- Batch: max 100 tracks per add
- Endpoints: /me, /me/playlists, /playlists/{id}/tracks, /search, /playlists, /playlists/{id}/tracks POST/DELETE

Provider contract in `lib/providers/types.ts`:

```typescript
MusicProvider
  getCapabilities()
  getAuthorizationUrl(state, redirectUri)
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

Error hierarchy: `ProviderAuthenticationError`, `ProviderPermissionError`, `ProviderNotFoundError`, `ProviderRateLimitError`, `ProviderTransientError`, `ProviderUnsupportedOperationError`

Future providers (Apple Music, YouTube Music, Tidal, Deezer) should implement same interface in `lib/providers/<provider>/`.

### Track Matching

Confidence-oriented pipeline:

1. ISRC exact match (100% confidence)
2. Strong metadata: title + artist + album + duration tolerance (95%)
3. Normalized title + artist (75%)
4. Provider search candidates
5. Fuzzy only if confidence sufficient
6. Otherwise unmatched

Never silently select low-confidence candidate.

Normalization: unicode NFKD, case folding, whitespace, featuring handling, version indicators (Live, Remix, Acoustic) preserved but used for scoring.

## Sync Engine

Workflow:

```
Source playlist
  -> Read source metadata
  -> Read all source tracks (paginated)
  -> Normalize tracks
  -> Resolve destination matches (search + matcher)
  -> Plan destination changes (idempotency check)
  -> Apply changes (create playlist, add tracks batched)
  -> Record per-track results
  -> Finalize SyncRun
```

- Async: job created pending, processed by worker (`/api/sync-jobs/[id]/process`), UI polls status
- Idempotency: check existing destination tracks before adding
- Duplicate handling: preserve duplicates if config says, else dedup
- Partial failure: breakdown preserved
- Retry: only transient (rate limit, network, 5xx), bounded with backoff, job system owns scheduling
- Cancellation: defined semantics, mark cancelled, stop subsequent work
- Progress: total, processed, matched, unmatched, failed, added, skipped, phase

API:

```
POST /api/sync-jobs { sourceAccountId, destinationAccountId, sourcePlaylistId, ... }
GET /api/sync-jobs
GET /api/sync-jobs/[id]
POST /api/sync-jobs/[id]/cancel
POST /api/sync-jobs/[id]/process
```

## Security

- Server-side identity authoritative: `auth()` -> `session.user.id`, never trust client userId
- Ownership checks on every resource: `connected_accounts.userId == session.user.id`, `sync_jobs.userId == session.user.id`
- Tokens encrypted at rest: AES-256-GCM with `TOKEN_ENCRYPTION_KEY`, never logged, never in URLs, never returned to client
- OAuth state validation, timestamp check to prevent replay
- Least privilege scopes
- Background jobs verify ownership
- IDOR/BOLA tests required
- Safe errors: no tokens, secrets, SQL internals, stack traces in prod
- Webhooks verify signature, handle replay/idempotency
- Billing enforced server-side, not trusting client

## Testing

- Unit: provider pagination, error translation, normalizer, matcher, planner, Paystack signature
- Integration: API authz, ownership, IDOR attempts
- Manual E2E: connect Spotify via ngrok, list playlists, transfer empty, 1-track, multi-page (>100), duplicate, check destination, partial failure

## Project Structure

```
app/
  (auth)/login
  (dashboard)/dashboard, connections, playlists, syncs, settings
  api/auth/[...nextauth], connected-accounts, playlists, sync-jobs, billing/paystack, webhooks/paystack, health
components/ui
lib/
  auth.ts, db.ts, encryption.ts, validations.ts, utils.ts
  providers/types.ts, errors.ts, factory.ts, spotify/client.ts
  sync/normalizer.ts, matcher.ts, planner.ts, engine.ts
  billing/paystack.ts
db/schema.ts, migrations/, seed.ts
hooks/
types/
```

## Deployment

- Environment separation: prod and dev DB configs separate, never expose prod creds
- Build: `npm run build` must pass
- No secrets in commits, logs, client bundles

## License

AGPL-3.0

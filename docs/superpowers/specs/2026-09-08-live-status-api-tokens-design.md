# Live Status API Tokens

**Date:** 2026-09-08
**Status:** Approved for implementation

## Problem

A clan member needs live server-status data (the Discord embed, plus BattleMetrics fields) on an ESP32 display. The website API is JWT-only (4-hour Discord session). API docs are gated by the Discord-role permission `view:api-docs`, so granting docs today means creating a whole role.

## Goals

1. Token-authenticated `GET /v1/live/status` that returns BattleMetrics attributes plus Discord-embed extras.
2. Admin page to mint, attach, revoke tokens and see per-token usage.
3. Per-user extra permission `view:api-docs` without a Discord role.
4. Tokens scoped to server-status only. Session JWTs cannot call the consumer route; API keys cannot call staff routes.

## Non-goals

- Consumer-only docs page (he gets existing Swagger).
- IP allowlists, compact mode, or additional consumer endpoints.
- Making `/v1/servers/status` authenticated.

## Auth

Two Bearer schemes:

| Prefix / shape | Use |
|---|---|
| JWT (existing) | Website session. Unchanged. |
| `rb_live_…` | Opaque API key. SHA-256 hashed at rest. Scope `server-status`. |

Secret format: `rb_live_` + 32 random bytes hex. Shown once. Prefix stored as the first 12 characters (`rb_live_xxxx`).

Disabled linked user does **not** disable the token. Revoke explicitly.

## Data model

`ApiToken`: name, tokenPrefix, tokenHash (unique), scope, optional userId, createdById, expiresAt, revokedAt, revokedById, lastUsedAt, requestCount.

`ApiTokenUsageDaily`: unique (tokenId, date UTC), okCount, errorCount, rateLimitedCount.

`UserPermission`: unique (userId, permission). Merged in `/v1/auth/sync` after Discord role perms. Role resync must not delete these.

## Endpoint

`GET /v1/live/status?server=&players=1`

- API key required. JWT → 401 `"API token required"`.
- Unknown / revoked / expired key → 401 `"Invalid or expired token"` (same body).
- Wrong scope → 403.
- 30 req/min per token → 429 + `Retry-After`.
- Unknown `?server=` → 404.
- Both BM and SquadJS down → 503 `"Server status unavailable"`.
- Cache ~20s. `ETag` / `If-None-Match` → 304.
- `players` default `null`; roster only with `?players=1`.
- Omit `ip`, `address`, `location`, `licenseId`.

Payload: BM fields (name, players, map, mode, version, queues, teams, rank, country, port, status, playTime, …) plus `live` (connected, layer, match timing, TPS 10m, team sizes, RB/prospect/wl/admin counts, seed indicator). Envelope `{ success, data }`.

## Admin UI

`/api-tokens` — permission `manage:api-tokens` (developer bypasses). Create (name, optional user, optional expiry), copy secret once, revoke, 30-day usage from daily rollups.

Member profile extra-permissions checkbox (`view:api-docs`), gated by `manage:roles`. Grantable extras are allowlisted; v1 only `view:api-docs`.

## Testing

See implementation tests: token hash lookup, JWT rejected on live-status, API key rejected on staff routes, rate limit, ETag, roster flag, extra perms surviving role sync, PII stripped.

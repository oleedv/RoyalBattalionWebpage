# REST v1 Migration Spec (breaking)

Branch: `rest-refactor-v1`. Single source of truth for the API refactor. Routes, `packages/web/lib/api-client.ts`, and `packages/web/public/openapi.yaml` are all derived from this document so they stay in sync.

## Global rules (apply to EVERY REST endpoint unless noted)

1. **Versioning** — every REST router is mounted under `/v1`. Root-level, NON-versioned exceptions (external / infra contracts that must not move):
   - `GET /admins.cfg` — fetched by the Squad game server at a fixed URL.
   - `GET /health`, `GET /live-server/health` — infra/Railway probes.
   - `GET /live-server/ws`, `GET /presence/ws` — WebSocket upgrades (non-REST transport, matched in Bun `fetch()` before Hono).
2. **Envelope** — all responses go through `success(c,data,status)` / `fail(c,error,status)` (`lib/crud-helpers.ts`). No hand-rolled `c.json({success…})`. `/admins.cfg` stays `text/plain` by design.
3. **Status codes** — create → `201`; successful `DELETE` → `204 No Content` (empty body); async enqueue (bot `pending_actions`) → `202 Accepted`; server-side failures → `500` (never the `fail()` default `400`).
4. **Verbs** — partial updates use `PATCH`; full replacement uses `PUT`; genuine side-effecting RPC stays `POST`.
5. **Dates** — all timestamps serialized as ISO-8601 (`.toISOString()`); missing dates are `null` (never `""` or a fabricated `now`).
6. **Missing resources** — return `404` (no `data:null` / `"Unknown"` placeholders, no 0-row-UPDATE reported as success).
7. **Pagination** — the shared `Paginated<T>` is enriched to `{ items, total, page, limit, hasNext }`. `lib/pagination.ts` provides `parsePageParams(c)` and `paginate(items,total,page,limit)`. Applied to collections that grow with usage. Small fixed-cardinality reference collections keep a **bare array** but get a defensive server-side `take` cap.

## Deliberate NON-changes (documented judgment calls)

These were in-scope for "do all" but are intentionally left as-is; reasons given so the decision is explicit:

- **`whitelist` & `tickets` list response SHAPE stays a bare array** (server-side cap added, not a `{items,…}` envelope). Reason: `whitelist/page.tsx` and `tickets/page.tsx` are in your uncommitted WIP; changing their data shape now would rework pages you're actively editing. Path (`/v1/...`), verbs, statuses, dates still change.
- **`GET /matches/public` NOT merged into `GET /matches?visibility=`.** Reason: `/public` is unauthenticated (homepage) while `/matches` requires `manage:matches`; folding them makes auth depend on a query param — a worse design and a homepage-break risk.
- **`GET /discord-bot/status` kept** (not folded into `/overview`). Reason: the frontend calls it independently (`getBotStatus`); dropping it churns the client for little gain. Redundancy noted only.

## Per-resource mapping (OLD → NEW). Everything below is additionally prefixed `/v1`.

### auth (`routes/auth.ts`)
| OLD | NEW | Notes |
|---|---|---|
| POST /auth/sync | POST /v1/auth/sync | RPC kept. Route via `success()/fail()`; stable error codes already (`ACCOUNT_DISABLED`, `NOT_IN_GUILD`). |
| GET /auth/me | GET /v1/auth/me | via helpers; dates ISO. |

### users (`routes/users.ts`)
| OLD | NEW | Notes |
|---|---|---|
| GET /users | GET /v1/users | **Paginated** (`?page&limit`, cap 100/def 50). |
| GET /users/:id/profile | GET /v1/users/:id/profile | 404 if absent. |
| GET /users/profile/by-steamid/:steamId | GET /v1/users/profile?steamId= | query, not path. |
| GET /users/by-steamid/:steamId | GET /v1/users?steamId= | id-resolution via filter. |
| GET /users/by-eosid/:eosId | GET /v1/users?eosId= | id-resolution via filter. |
| PUT /users/:id | PATCH /v1/users/:id | partial update. |
| POST /users/:id/disable + /enable | PATCH /v1/users/:id/status `{disabled, reason?}` | merged toggle; keeps developer gate + self/dev guards. |
| DELETE /users/:id | DELETE /v1/users/:id | 204. |
| POST /users/:id/comments | POST /v1/users/:id/comments | 201 (already). |
| DELETE /users/:userId/comments/:commentId | DELETE /v1/users/:id/comments/:commentId | 204; param renamed `:userId`→`:id`; scope delete by both. |
| POST /users/bulk-* (comment/delete/disable/enable/update) | POST /v1/users/bulk-* | kept (batch-by-body idiom); standardize result `{succeeded,failed,total}` where cheap; server errors 500. |
| POST /users/resolve-ids | POST /v1/users/resolve-ids | batch lookup kept. |
| POST /users/link-steam | POST /v1/users/link-steam | self-service kept; generic collision msg. |
| POST /users/sync-roles | POST /v1/users/sync-roles | RPC kept. |

### roles (`routes/roles.ts`)
| OLD | NEW | Notes |
|---|---|---|
| GET /roles | GET /v1/roles | bare array + cap. |
| POST /roles | POST /v1/roles | 201; include `isMemberRole` in payload. |
| DELETE /roles/:id | DELETE /v1/roles/:id | 204. |
| PUT /roles/:id/permissions | PUT /v1/roles/:id/permissions | full-replace kept as PUT; return payload incl. `isMemberRole`. |
| PUT /roles/:id/member-role + /whitelist-grant | PATCH /v1/roles/:id `{isMemberRole?, grantsWhitelist?}` | **merged** two boolean endpoints into one PATCH; returns the role. |

### whitelist (`routes/whitelist.ts`)
| OLD | NEW | Notes |
|---|---|---|
| GET /whitelist | GET /v1/whitelist | bare array + cap (shape unchanged — WIP). |
| GET /whitelist/candidates | GET /v1/whitelist/candidates | bare array + cap. |
| GET /whitelist/:id | GET /v1/whitelist/:id | 404 kept. |
| POST /whitelist | POST /v1/whitelist | 201 (already). |
| POST /whitelist/bulk | POST /v1/whitelist/bulk | partial-success `{created,skipped}`; 201→207-style body but keep 201. |
| POST /whitelist/bulk-update | POST /v1/whitelist/bulk-update | kept. |
| POST /whitelist/bulk-delete | POST /v1/whitelist/bulk-delete | kept. |
| PUT /whitelist/:id | PATCH /v1/whitelist/:id | partial. |
| POST /whitelist/:id/comments | POST /v1/whitelist/:id/comments | 201 (already). |
| DELETE /whitelist/:id, .../comments/:commentId | DELETE /v1/... | 204; comment delete scoped by both ids. |

### admin-groups / clans (`routes/admin-groups.ts`, `routes/clans.ts`)
| OLD | NEW | Notes |
|---|---|---|
| GET, POST /admin-groups | GET, POST /v1/admin-groups | POST 201; bare array + cap. |
| PUT /admin-groups/:id | PATCH /v1/admin-groups/:id | partial. |
| DELETE /admin-groups/:id | DELETE /v1/admin-groups/:id | 204. |
| GET, POST /clans | GET, POST /v1/clans | POST 201 (already); bare array + cap. |
| PUT /clans/:id | PATCH /v1/clans/:id | partial. |
| DELETE /clans/:id | DELETE /v1/clans/:id | 204. |

### tickets / prospects / legacy-tickets (`routes/tickets.ts` → split)
Promote `prospects` and `legacy-tickets` to top-level routers. Move the handlers out of `tickets.ts` into `routes/prospects.ts` and `routes/legacy-tickets.ts`.
| OLD | NEW | Notes |
|---|---|---|
| GET /tickets | GET /v1/tickets | bare array + cap (shape unchanged — WIP). |
| GET /tickets/:id | GET /v1/tickets/:id | 404. |
| GET /tickets/by-uuid/:uuid | GET /v1/tickets/by-uuid/:uuid | public. |
| GET /tickets/legacy | GET /v1/legacy-tickets | promoted. |
| GET /tickets/legacy/:id | GET /v1/legacy-tickets/:id | promoted; 404. |
| GET /tickets/by-uuid/legacy/:uuid | GET /v1/legacy-tickets/by-uuid/:uuid | promoted, public. |
| GET /tickets/prospects/list | GET /v1/prospects | promoted; drop `/list`. |
| GET /tickets/prospects/:id | GET /v1/prospects/:id | promoted; 404. |
| GET /tickets/by-uuid/prospect/:uuid | GET /v1/prospects/by-uuid/:uuid | promoted, public. |

### prospect mutations (currently `routes/discord-bot/seeding.ts`/`prospects.ts`) → top-level prospects
| OLD | NEW | Notes |
|---|---|---|
| POST /discord-bot/prospects/:id/pause + /unpause | PATCH /v1/prospects/:id `{paused:boolean}` | merged. |
| POST /discord-bot/prospects/:id/extend | PATCH /v1/prospects/:id `{extendDays:N}` | folded into same PATCH. |
| POST /discord-bot/prospects/:id/reassign-mentor | POST /v1/prospects/:id/mentor-reassignment `{mentorId}` | async → **202**. |
| GET /discord-bot/prospects/mentors | GET /v1/prospects/mentors | promoted. |

### matches (`routes/matches.ts`)
| OLD | NEW | Notes |
|---|---|---|
| GET /matches | GET /v1/matches | Paginated (enriched shape). |
| GET /matches/public | GET /v1/matches/public | kept (see non-changes); Paginated. |
| PUT /matches/:id | PATCH /v1/matches/:id | partial. |
| DELETE /matches/:id | DELETE /v1/matches/:id | 204. |
| POST /matches/resync | POST /v1/matches/resync | RPC kept; catch → 500. |

### server-config (`routes/server-config.ts`)
| OLD | NEW | Notes |
|---|---|---|
| GET /server-config | GET /v1/server-config | bare array + cap; via helpers. |
| POST /server-config | POST /v1/server-config | upsert; 201 on create path. |
| PUT /server-config/:server/sync | PATCH /v1/server-config/:server `{syncEnabled:boolean}` | client-supplied state (idempotent), not a blind toggle. |
| DELETE /server-config/:server | DELETE /v1/server-config/:server | 204. |

### squadjs-config (`routes/squadjs-config.ts`)
| OLD | NEW | Notes |
|---|---|---|
| GET /squadjs-config, /descriptions, /:env | GET /v1/squadjs-config… | via helpers; validate `:env` against enum → 404 on unknown. |
| PUT /squadjs-config/:env | PATCH /v1/squadjs-config/:env | partial (merges plugins). |

### discord-bot (`routes/discord-bot/*`) — namespace kept
| OLD | NEW | Notes |
|---|---|---|
| GET /discord-bot/overview, /status | GET /v1/discord-bot/overview, /status | via helpers; 404 where a single row is missing. |
| GET /discord-bot/messages, /logs | GET /v1/discord-bot/messages, /logs | unify pagination defaults/caps (50/200); enriched `Paginated`; real error statuses (not blanket 503). |
| GET/PATCH /discord-bot/seeding/config | GET /v1/…; **PATCH** (was PUT) | partial; don't clobber omitted fields with defaults. |
| GET /discord-bot/seeding/sessions, /rapport | GET /v1/… | dates ISO. |
| POST /discord-bot/seeding/send-now, /rapport/send | POST /v1/… → **202** | async enqueue; generic error (no raw exception text). |
| GET /discord-bot/timeouts | GET /v1/discord-bot/timeouts | bare array + cap. |
| POST /discord-bot/timeouts | POST /v1/discord-bot/timeouts | **201**; return the created row. |
| POST /discord-bot/timeouts/:id/expire | DELETE /v1/discord-bot/timeouts/:id | expiring = ending the active timeout; 204; 404 if none. |

### stats / servers / playtime / audit-logs / lobby / admins / seeding-tracker
| OLD | NEW | Notes |
|---|---|---|
| GET /stats/summary | GET /v1/stats/summary | via helpers. |
| GET /servers/status | GET /v1/servers/status | via helpers; bare array. |
| GET /playtime?steamId= | GET /v1/playtime?steamId= | via helpers (query kept — cross-DB aggregate, not a user sub-resource). |
| GET /audit-logs | GET /v1/audit-logs | enriched Paginated; echo page/limit. |
| DELETE /audit-logs/:id | DELETE /v1/audit-logs/:id | 204; write a `delete:audit-logs` audit entry. |
| POST /audit-logs/bulk-delete | POST /v1/audit-logs/bulk-delete | kept; audit the deletion. |
| GET /admins/team-count | GET /v1/admins/team-count | via helpers. |
| POST /lobby/create/:serverName | POST /v1/lobbies `{serverName}` | resourceful create; 201/proxy status. |
| GET /lobby/health, /stats | GET /v1/lobby/health, /stats | via helpers. |
| POST /lobby/steam/reconnect | POST /v1/lobby/steam/reconnect | RPC kept → 202. |
| GET /seeding-tracker/leaderboard + /search | GET /v1/seeding-tracker/players (`?q=` search, `?days=`, `?limit=`) | **merged**; bare array + cap. |
| GET /seeding-tracker/player/:steamId | GET /v1/seeding-tracker/players/:steamId | plural; 404 on unknown; ISO dates. |
| GET /seeding-tracker/stats | GET /v1/seeding-tracker/stats | via helpers. |

## Client + openapi

- `api-client.ts`: `BASE_URL` gains `/v1` (root exceptions call bare paths); `createCrudClient.update` → `PATCH`; `remove` expects `204` (no body); path/method updates per table; new/renamed functions for merged/promoted routes.
- `openapi.yaml`: regenerate paths under `/v1`, update methods/status/schemas, add `PaginatedMeta`.

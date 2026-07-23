# Royal Battalion Webpage

Admin dashboard and public-facing site for the Royal Battalion Squad community. A Bun workspace pairing a Next.js frontend with a Hono API, Prisma against MariaDB, and a live WebSocket relay into our SquadJS game-server stack.

![Bun](https://img.shields.io/badge/Bun-runtime-f9f1e1?logo=bun&logoColor=000)
![Next.js](https://img.shields.io/badge/Next.js_15-black?logo=next.js)
![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=000)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=fff)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma)
![MariaDB](https://img.shields.io/badge/MariaDB-003545?logo=mariadb)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?logo=tailwindcss&logoColor=fff)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)

## What this repo contains

Four Bun workspace packages plus a shared Prisma schema:

- **`packages/web`** -- Next.js 15 App Router frontend. Public pages, admin dashboard, NextAuth Discord login. Port `3000`.
- **`packages/api`** -- Hono REST + WebSocket API. JWT-authenticated, talks to MariaDB via Prisma and bridges live SquadJS events to the browser. Port `3001`.
- **`packages/lobby-service`** -- Small Hono service wrapping `steam-user` to track Squad Steam lobbies. Port `3002`.
- **`packages/shared`** -- TypeScript types, the canonical permission list, and country data consumed by both ends.
- **`prisma/schema.prisma`** -- Single source of truth for the primary database schema.

## Architecture

```
Browser
  |
  +---> Next.js (web)  --JWT-->  Hono API  --Prisma-->  MariaDB (primary)
  |                                 |
  |                                 +------raw SQL----->  Secretary DB (read-only)
  |                                 +------raw SQL----->  SquadJS DB (read-only)
  |                                 |
  |                                 +---Socket.IO--->  SquadJS servers (live data)
  |                                 +---SFTP-------->  Game servers (admins.cfg deploy)
  |                                 |
  +--WebSocket-- /live-server/ws    +---HTTP-------->  Lobby Service ---> Steam
       (real-time game events)
```

### Request flow

1. Browser loads Next.js (`packages/web`). NextAuth runs the Discord OAuth dance and caches tokens in a JWT session (`packages/web/lib/auth.ts`).
2. On first load after sign-in, the web app calls `/auth` on the API to exchange Discord identity for a signed API JWT (`packages/api/src/routes/auth.ts`, signed with `JWT_SECRET`).
3. Every subsequent API call goes through `packages/web/lib/api-client.ts`, which attaches the JWT as a Bearer token.
4. Hono runs each request through a fixed middleware chain (`packages/api/src/index.ts`): `secureHeaders` -> `requestLog` -> `globalRateLimit(200 rps)` -> `cors` -> `authMiddleware` (`packages/api/src/middleware/auth.ts`) -> per-route `requirePermission` (`packages/api/src/middleware/permissions.ts`).
5. Handlers read and write via Prisma against the primary MariaDB, and issue raw SQL against read-only pools for the Secretary and SquadJS databases (`packages/api/src/lib/secretary-db.ts`, `squadjs-db.ts`).
6. Live data: the browser opens `GET /live-server/ws?server=X&token=JWT`. The API verifies the token, checks `view:live-server`, subscribes to the matching SquadJS Socket.IO server (`packages/api/src/lib/squadjs-socket.ts`) and relays events to all connected UIs.

## Data model

All persistent state owned by this app lives in one MariaDB, modeled in `prisma/schema.prisma`. Logical groupings:

- **Identity & RBAC** -- `User`, `UserRole`, `DiscordRole`, `RolePermission`, `MemberComment`.
- **Whitelist** -- `WhitelistEntry`, `Clan`, `AdminGroup`, `WhitelistComment`.
- **Server config** -- `ServerConfig` (per-game-server SFTP creds, encrypted at rest via `packages/api/src/lib/crypto.ts`).
- **Gameplay** -- `Match` (SquadJS match ID, map, layer, VOD link, detail JSON).
- **Audit** -- `AuditLog` (actor, action, resource, detail JSON, timestamp).

Two more databases are reachable read-only:

- **Secretary DB** -- owned by the Discord bot (`RoyalSecretaryDiscordBot`). We read ticket/prospect/message data for admin UI views.
- **SquadJS DB** -- owned by our SquadJS deployment. We read match history, player playtime, and connection events for stats pages.

Both are read-only on purpose: they have authoritative writers elsewhere and we never want this service to corrupt them.

## Permissions (RBAC)

The permissions model is deliberately flat:

- Permissions are string literals, enumerated once in `packages/shared/types/roles.ts`.
- `DiscordRole` rows own sets of permissions via `RolePermission`. Roles are synced from Discord; permission assignment is editable in the Roles admin page.
- A `User` inherits the union of permissions from their `UserRole` links. `authMiddleware` loads them on every request; `requirePermission("manage:whitelist")` gates each route.

The 28 permissions currently in use:

```
view:whitelist            manage:whitelist
view:members              manage:members
view:tickets              manage:tickets
manage:roles              manage:matches
view:squadjs              manage:squadjs
view:live-server          manage:live-server
manage:whitelist-sync     view:discord-bot          manage:discord-bot
view:tickets:normal       view:tickets:community_officer
view:tickets:admin_officer view:tickets:comp_team    view:tickets:whitelist
view:audit-logs           view:seeding-tracker       view:api-docs
manage:clan-move          manage:randomize
manage:balance-teams      manage:rcon-console
developer
```

The `view:tickets:*` family provides per-department gating on top of `view:tickets`, applied in `packages/api/src/middleware/permissions.ts`.

## Real-time: WebSocket relay and presence

The API hosts two WebSocket endpoints. Both authenticate by JWT passed as a `token` query parameter (browsers cannot set headers on WebSocket upgrades) and enforce permissions on connect.

- **`GET /live-server/ws?server=<name>&token=<jwt>`** -- requires `view:live-server`. The API maintains a single Socket.IO client per configured SquadJS server (`packages/api/src/lib/squadjs-socket.ts`) and fans its events out to every connected browser. Relayed event types include `PLAYER_CONNECTED`, `PLAYER_DISCONNECTED`, `CHAT_MESSAGE`, `NEW_GAME`, `ROUND_ENDED`, `PLAYER_DIED`, and `TEAMKILL`. The UI lives at `packages/web/app/(protected)/live-server/`.
- **`GET /presence/ws?page=<path>&token=<jwt>`** -- tracks which admins are viewing which page, so edits don't stomp on each other.

SquadJS servers are configured via the `SQUADJS_SERVERS` env var (see below). `GET /live-server/health` reports the connection status of each upstream.

## API surface

Routes are grouped under `packages/api/src/routes/`. All require a valid JWT unless noted.

| Prefix | File | Purpose |
|--------|------|---------|
| `/auth` | `auth.ts` | Discord identity -> JWT exchange, token refresh |
| `/users` | `users.ts` | User CRUD, role assignment, suspension, profile comments |
| `/roles` | `roles.ts` | Discord role <-> permission mapping |
| `/whitelist` | `whitelist.ts` | Whitelist entries, clan + admin-group assignment, deploy trigger |
| `/admin-groups` | `admin-groups.ts` | Admin group (permission bundle) CRUD |
| `/clans` | `clans.ts` | Clan CRUD |
| `/tickets` | `tickets.ts` | Department-tiered support tickets |
| `/matches` | `matches.ts` | Match history CRUD, SquadJS sync, VOD links |
| `/servers` | `servers.ts` | Server list + live status summary |
| `/stats` | `stats.ts` | Aggregated player stats and playtime |
| `/squadjs-config` | `squadjs-config.ts` | SquadJS config editor (GitHub-backed) |
| `/server-config` | `server-config.ts` | Per-server SFTP settings (encrypted) |
| `/discord-bot` | `discord-bot/` | Bot overview, messages, prospects, seeding, timeouts, ticket actions, logs |
| `/audit-logs` | `audit-logs.ts` | Audit trail with user/resource/date filters |
| `/playtime` | `playtime.ts` | Per-player playtime from the SquadJS DB |
| `/seeding-tracker` | `seeding-tracker.ts` | Seeding event tracking + whitelist rewards |
| `/lobby` | `lobby.ts` | Proxy to the Lobby Service |

Public endpoints (no JWT):

- `GET /health` -- primary + secondary DB health.
- `GET /live-server/health` -- SquadJS upstream connection status.
- `GET /admins.cfg?server=<name>` -- IP-restricted. Served to Squad game servers to populate `/admins.cfg`. Generated by `packages/api/src/lib/cfg-generator.ts`.

A Swagger UI for the full API is mounted at `/api-docs` in the running web app (`packages/web/app/(protected)/api-docs/`).

## Tech stack

| Layer | Package | Version |
|-------|---------|---------|
| Runtime | Bun | latest |
| Frontend | next | 15.2.1 |
| Frontend | react | 19.0.0 |
| Styling | tailwindcss | 4.0.6 |
| Auth (web) | next-auth | 4.24.11 |
| Backend | hono | 4.7.4 |
| ORM | prisma / @prisma/adapter-mariadb | 7.4.1 |
| DB driver | mariadb / mysql2 | 3.5.1 / 3.17.4 |
| Validation | zod / @hono/zod-validator | 3.24.2 / 0.4.3 |
| JWT | jose | 6.0.8 |
| Real-time (upstream) | socket.io-client | 4.8.3 |
| SFTP deploy | ssh2-sftp-client | 12.0.1 |
| Steam (lobby) | steam-user | 5.2.0 |
| Logging | pino / pino-pretty | 10.3.1 / 13.1.3 |
| API docs (UI) | swagger-ui-react | 5.31.2 |
| Language | typescript | 5.7.3 |

Non-obvious choices worth knowing about: **Pino** for structured JSON logs (easy to ship to Loki), **jose** for JWT sign/verify across the Next/Hono boundary, **ssh2-sftp-client** to push `admins.cfg` files to game servers after whitelist changes, and **steam-user** in the lobby service to impersonate a Steam account and discover active lobbies.

## Project structure

```
packages/
  web/
    app/
      (auth)/          Login, signout
      (public)/        Home, server info, matches, prospect + ticket forms, policy pages
      (protected)/     Admin dashboard, whitelist, members, tickets, matches,
                       audit logs, roles, admin-groups, squadjs-config, live-server,
                       discord-bot (7 tabs), lobby-monitor, seeding-tracker, api-docs
      api/auth/        NextAuth route handler
    components/        Shared UI (data-table, modal, confirm-dialog, ...)
    lib/               NextAuth config, api-client, logger, formatting
    middleware.ts      Session + permission gate
  api/
    src/
      index.ts         Entry, middleware chain, WS endpoints
      routes/          One file per route group (see table above)
      middleware/      auth, permissions, rate-limit, request-log
      lib/             Prisma client, Discord, SFTP, encryption, SquadJS socket,
                       match sync, role sync, logger, cfg generator
      generated/       Prisma client output (not committed)
    entrypoint.sh      prisma db push; exec bun run src/index.ts
    Dockerfile
  lobby-service/
    src/               Steam lobby discovery + Hono HTTP surface
    Dockerfile
  shared/
    types/             user, roles (PERMISSIONS), api, match, tickets, discord-bot
    countries.ts
    index.ts
prisma/
  schema.prisma        Primary database schema
.env.example
package.json           Bun workspaces, root scripts
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) (latest)
- A MariaDB instance (the Prisma schema is pushed to it on first run)
- A Discord application with OAuth2 configured and a redirect URI pointing at `http://localhost:3000/api/auth/callback/discord`

Optional integrations -- leave the env vars unset to skip:

- SquadJS Socket.IO servers (without these, `/live-server/ws` simply has no upstream)
- SFTP target (whitelist deploy will fail fast)
- GitHub token (SquadJS config editor will be read-only)
- Lobby Service / Steam refresh token (lobby monitor will show nothing)

### Setup

```bash
bun install
cp .env.example .env            # fill in values - see the table below
bun run db:push                 # create/update the schema in MariaDB
bun run dev                     # web + api + lobby-service in parallel
```

Dev URLs:

- Web: <http://localhost:3000> (Turbopack, hot reload)
- API: <http://localhost:3001> (Bun `--watch`)
- Lobby Service: <http://localhost:3002>

## Environment variables

All variables live in `.env` at the repo root (read by every package). Grouped by concern:

| Group | Variable | Purpose |
|-------|----------|---------|
| Databases | `DATABASE_URL` | Primary MariaDB connection string (Prisma) |
| | `SECRETARY_DATABASE_URL` | Read-only connection to the Discord bot's DB |
| | `SQUADJS_DATABASE_URL` | Read-only connection to the SquadJS DB |
| Discord OAuth | `DISCORD_CLIENT_ID` | OAuth2 application ID |
| | `DISCORD_CLIENT_SECRET` | OAuth2 application secret |
| | `DISCORD_GUILD_ID` | Guild whose membership gates login |
| | `DISCORD_BOT_TOKEN` | Bot token used for background role sync |
| Discord Bot | `DISCORD_MEMBER_ROLE_IDS` | Comma-separated role IDs auto-flagged as member roles |
| NextAuth | `NEXTAUTH_URL` | Public URL of the web app |
| | `NEXTAUTH_SECRET` | Session JWT signing secret |
| API / JWT | `API_URL` | Public URL of the API (used by the web client) |
| | `JWT_SECRET` | Signing secret for API JWTs |
| SFTP | `SFTP_HOST` / `SFTP_PORT` / `SFTP_USER` / `SFTP_PASS` / `SFTP_PATH` | Default SFTP target for `admins.cfg` deploy (per-server overrides live in `ServerConfig`) |
| GitHub | `GITHUB_CONFIG_TOKEN` | Token for reading/writing the SquadJS config repo |
| SquadJS | `SQUADJS_SERVERS` | `name\|url\|token,name\|url\|token` list of upstream SquadJS Socket.IO servers |
| Lobby Service | `LOBBY_SERVICE_URL` | Internal URL the API uses to reach the lobby service |
| | `LOBBY_INTERNAL_KEY` | Shared secret for internal calls |
| | `STEAM_REFRESH_TOKEN` | Steam refresh token used by `steam-user` |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all packages in parallel |
| `bun run dev:web` | Next.js only (Turbopack) |
| `bun run dev:api` | Hono API only (`bun --watch`) |
| `bun run build` | Build every package |
| `bun run db:generate` | Generate Prisma client into `packages/api/src/generated/prisma/` |
| `bun run db:push` | Sync the schema to MariaDB without creating migrations (the fast path for local dev and for the Docker entrypoint) |
| `bun run db:migrate` | Create and run a named migration (use this when making a real schema change) |
| `bun run db:studio` | Open Prisma Studio |

## Deployment

Each service ships as its own container and runs on Railway.

- **Web** -- `packages/web/Dockerfile` builds a Next.js standalone bundle on Node 22 Alpine. Health check: `/`.
- **API** -- `packages/api/Dockerfile` runs Bun directly. `packages/api/entrypoint.sh` runs `prisma db push` (30s timeout, non-fatal on failure) before exec'ing the server. Health check: `/health`.
- **Lobby Service** -- `packages/lobby-service/Dockerfile`, Bun runtime, no DB.

Railway picks each service up via its `railway.json` (`packages/{web,api,lobby-service}/railway.json`) with `restartPolicyType: "ON_FAILURE"` and up to 10 retries. There is no separate CI -- pushes to the deploy branch trigger a Railway build.

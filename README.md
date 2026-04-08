# Royal Battalion Webpage

Admin dashboard and public website for the Royal Battalion Squad community. Built as a Bun monorepo with a Next.js frontend, Hono API, and real-time game server integration.

![Bun](https://img.shields.io/badge/Bun-runtime-f9f1e1?logo=bun&logoColor=000)
![Next.js](https://img.shields.io/badge/Next.js_15-black?logo=next.js)
![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=000)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=fff)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma)
![MariaDB](https://img.shields.io/badge/MariaDB-003545?logo=mariadb)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?logo=tailwindcss&logoColor=fff)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)

## Features

### Admin Dashboard
- **Whitelist Management** -- CRUD with bulk operations, expiration tracking, clan and admin group assignment
- **Member Management** -- User profiles, role assignment, account suspension, admin comments
- **Role-Based Access Control** -- 26 granular permissions mapped to Discord roles
- **Audit Logs** -- Full trail of every admin action with filtering
- **Match Manager** -- Match history with map/layer data, SquadJS sync, and VOD links

### Game Server Integration
- **Live Server Monitor** -- Real-time player lists, teams, squads, and game events streamed via WebSocket
- **SquadJS Config Editor** -- Edit and deploy SquadJS configuration directly from the dashboard
- **SFTP Config Deployment** -- Push server config files to game servers with per-server SFTP settings
- **Admin Config Generation** -- Auto-generated `/admins.cfg` endpoint consumed by Squad servers
- **Lobby Monitor** -- Steam lobby integration service for tracking active lobbies

### Discord Integration
- **OAuth Authentication** -- Login with Discord, guild membership verification
- **Bot Dashboard** -- Seven tabs: Overview, Messages, Prospects, Seeding, Timeouts, Ticket Actions, Logs
- **Ticket System** -- Department-based support tickets integrated with the Discord bot

### Real-time
- **WebSocket Relay** -- Proxies SquadJS Socket.IO events to the browser for live game data
- **User Presence** -- Multi-user presence tracking for collaborative dashboard editing

### Public Pages
- Server information and live status
- Match history browser
- Prospect application forms
- Seeding tracker
- Privacy policy and terms of service

### Security
- Discord OAuth + JWT authentication (4-hour token expiry)
- 26-permission RBAC verified on every API request
- Zod validation on all API endpoints
- AES-256-GCM encryption for sensitive stored data
- Rate limiting (200 req/sec global)
- Security headers (HSTS, CSP, X-Frame-Options)

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
  |                                 +---SFTP-------->  Game servers (config deploy)
  |                                 |
  +--WebSocket-- /live-server/ws    +---HTTP-------->  Lobby Service ---> Steam API
       (real-time game events)
```

- **Auth**: Discord OAuth on the frontend, JWT tokens for API calls
- **RBAC**: Permissions assigned to Discord roles, verified on every request
- **Databases**: Primary via Prisma, Secretary and SquadJS databases via raw SQL (read-only)
- **Real-time**: WebSocket relay proxies SquadJS Socket.IO events to the browser
- **Validation**: Zod schemas on all API endpoints

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Bun | latest |
| Frontend | Next.js | 15.2 |
| UI | React | 19 |
| Styling | Tailwind CSS | 4.0 |
| Backend | Hono | 4.7 |
| ORM | Prisma | 7.4 |
| Database | MariaDB | -- |
| Auth | NextAuth v4 | 4.24 |
| Real-time | Socket.IO | 4.8 |
| Deployment | Docker, Railway | -- |

## Project Structure

```
packages/
  web/             Next.js frontend (port 3000)
  api/             Hono REST API (port 3001)
  lobby-service/   Steam lobby integration service (port 3002)
  shared/          Shared TypeScript types
prisma/
  schema.prisma    Database schema
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (latest)
- MariaDB instance
- Discord application (OAuth2 credentials)

### Setup

1. Clone the repository and install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

3. Push the database schema:

```bash
bun run db:push
```

4. Start the development servers:

```bash
bun run dev        # All packages
bun run dev:web    # Frontend only (with Turbopack)
bun run dev:api    # API only (watch mode)
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all packages in dev mode |
| `bun run dev:web` | Start Next.js with Turbopack |
| `bun run dev:api` | Start API with watch mode |
| `bun run build` | Build all packages |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:push` | Push schema to database |
| `bun run db:migrate` | Create and run migrations |
| `bun run db:studio` | Open Prisma Studio |

## Deployment

Each service has its own multi-stage Dockerfile:

- **`packages/web/Dockerfile`** -- Next.js standalone build on Node 22 Alpine
- **`packages/api/Dockerfile`** -- Bun runtime, runs `prisma db push` on startup
- **`packages/lobby-service/Dockerfile`** -- Bun runtime for Steam integration

Deployed on Railway with health check endpoints (`/health` for API, `/` for web).

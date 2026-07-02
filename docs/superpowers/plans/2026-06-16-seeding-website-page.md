# Seeding Website Page (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the website's split seeding UI into one dedicated, permission-gated `/seeding` page, and fix the website-side server-scoping bug so the leaderboard/stats only count the configured seeding server.

**Architecture:** The bot (Plan A, separate repo) moved all seeding config into the `Royal_secretary.seeding_config` row and writes a `seeding_live_status` row each tick. This plan surfaces that on the website: extend the shared `SeedingConfig` type + config API with the new DB columns, add a validated server-list endpoint (from `squadjs_servers`) and a live-status endpoint, filter the `/seeding-tracker` queries by `tracker_server_id`, then build one `/seeding` page (staff leaderboard + live-status card + manager-only config/controls/rapport/history), retire the `/discord-bot` Seeding tab, and redirect the old `/seeding-tracker` route.

**Tech Stack:** Bun monorepo, Next.js 15 (React 19, app router) + Hono API + Prisma 7 / MariaDB. Tailwind v4. No test runner — **verification is TypeScript typecheck.**

**Spec:** `RoyalSecretaryDiscordBot/docs/superpowers/specs/2026-06-16-seeding-system-rework-design.md` §8.

**Dependency note:** Runtime correctness needs Plan A (bot) deployed first (it creates the new `seeding_config` columns + `seeding_live_status` table). This plan only needs those columns to *exist* at runtime; the code typechecks independently.

---

## Verification (read carefully — there is no test runner)

Run from the worktree root `C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\seeding-web`:

- **shared:** `bunx tsc --noEmit -p packages/shared/tsconfig.json` → MUST exit 0 (clean at baseline).
- **web:** `bunx tsc --noEmit -p packages/web/tsconfig.json` → MUST exit 0 (clean at baseline).
- **api:** `bunx tsc --noEmit -p packages/api/tsconfig.json` does NOT exit 0 at baseline — it has pre-existing Prisma-typing errors in these files ONLY: `lib/audit.ts`, `lib/match-assembler.ts`, `lib/match-sync.ts`, `routes/admin-groups.ts`, `routes/auth.ts`, `routes/clans.ts`, `routes/discord-bot/overview.ts`, `routes/matches.ts`, `routes/roles.ts`, `routes/stats.ts`, `routes/tickets.ts`, `routes/users.ts`, `routes/whitelist.ts`. The seeding files (`routes/seeding-tracker.ts`, `routes/discord-bot/seeding.ts`) are CLEAN at baseline. **api verification = `bunx tsc --noEmit -p packages/api/tsconfig.json 2>&1 | grep -E "seeding"` returns EMPTY** (no error references a seeding file). Any seeding-file error is a regression to fix.

**Commit discipline (critical):** This worktree is isolated from the user's `rcon-only` work, but still: commit ONLY the exact files each task names with `git add <files>`. NEVER `git add -A` / `git add .`. Conventional-commit messages, no emojis, no AI attribution / Co-Authored-By.

---

## File Structure

**Shared (`packages/shared/types/`):**
- `discord-bot.ts` — extend `SeedingConfig`; add `SeedingLiveStatus`, `SquadServerOption`.

**API (`packages/api/src/`):**
- `routes/discord-bot/seeding.ts` — extend GET/PUT `/seeding/config` with new columns; add GET `/seeding/servers` and GET `/seeding/live-status`.
- `routes/seeding-tracker.ts` — add `tracker_server_id` filter to all four queries (helper that reads it from `seeding_config`).

**Web (`packages/web/`):**
- `lib/api-client.ts` — add `getSeedingServers`, `getSeedingLiveStatus`; the existing `SeedingConfig`-typed functions pick up the new fields automatically.
- `app/(protected)/seeding/page.tsx` — NEW dedicated page (the whole feature).
- `app/(protected)/seeding/components/*` — extracted sections (leaderboard, player detail, charts, live-status card, admin config/controls/rapport/history).
- `app/(protected)/layout.tsx` — add `/seeding` nav entry.
- `app/(protected)/seeding-tracker/page.tsx` — replace body with a redirect to `/seeding`.
- `app/(protected)/discord-bot/page.tsx` — remove the `seeding` tab.
- `app/(protected)/discord-bot/components/OverviewTab.tsx` — seeding widget becomes a compact read-only card linking to `/seeding`.

---

## Task 1: Shared types — extend SeedingConfig, add live-status + server-option

**Files:** Modify `packages/shared/types/discord-bot.ts`

- [ ] **Step 1: Extend `SeedingConfig` and add two interfaces.** Replace the existing `SeedingConfig` interface with:

```typescript
export interface SeedingConfig {
  id: number;
  enabled: boolean;
  channelId: string | null;
  roleIds: string[];
  seedThreshold: number;
  resetThreshold: number;
  dailyTime: string | null;
  timezone: string | null;
  announcerServerId: number | null;
  trackerServerId: number | null;
  trackerEnabled: boolean;
  requiredSeedDays: number;
  rollingWindowDays: number;
  whitelistDurationDays: number;
  maxExtensionDays: number;
  progressionChannelId: string | null;
  leaderboardChannelId: string | null;
}

export interface SeedingLiveStatus {
  serverResolvedOk: boolean;
  socketConnected: boolean;
  currentPopulation: number | null;
  currentLayer: string | null;
  activeSessionId: number | null;
  updatedAt: string | null;
}

export interface SquadServerOption {
  id: number;
  name: string;
}
```

(Note: the legacy `roleId`/`serverName` fields are intentionally dropped — the bot now uses `roleIds` + `announcerServerId`/`trackerServerId`.)

- [ ] **Step 2: Typecheck shared.** Run: `bunx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: exit 0. (It will NOT break web/api yet because the API maps these fields in Task 2 and the web consumes them in later tasks — but if web references `roleId`/`serverName` it'll surface in Task 2/later typechecks, which we fix there.)

- [ ] **Step 3: Commit.**

```bash
git add packages/shared/types/discord-bot.ts
git commit -m "feat(seeding): extend SeedingConfig type, add live-status + server-option types"
```

---

## Task 2: API — config route new fields + server-list + live-status endpoints

**Files:** Modify `packages/api/src/routes/discord-bot/seeding.ts`

- [ ] **Step 1: Replace the GET `/seeding/config` handler** so it selects and maps the new columns. Replace the existing `seeding.get("/seeding/config", ...)` block with:

```typescript
// GET /seeding/config
seeding.get(
  "/seeding/config",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT id, enabled, channel_id, role_ids, seed_threshold, reset_threshold,
               daily_time, timezone, announcer_server_id, tracker_server_id, tracker_enabled,
               required_seed_days, rolling_window_days, whitelist_duration_days, max_extension_days,
               progression_channel_id, leaderboard_channel_id
         FROM seeding_config WHERE id = 1`
      );

      if (rows.length === 0) {
        return fail(c, "Seeding config not found", 404);
      }

      const r = rows[0];
      let roleIds: string[] = [];
      if (Array.isArray(r.role_ids)) roleIds = r.role_ids.map((x: unknown) => String(x));
      else if (typeof r.role_ids === "string" && r.role_ids.trim()) {
        try { const p = JSON.parse(r.role_ids); if (Array.isArray(p)) roleIds = p.map((x) => String(x)); } catch { /* ignore */ }
      }

      const config: SeedingConfig = {
        id: r.id,
        enabled: Boolean(r.enabled),
        channelId: r.channel_id,
        roleIds,
        seedThreshold: Number(r.seed_threshold),
        resetThreshold: Number(r.reset_threshold),
        dailyTime: r.daily_time,
        timezone: r.timezone,
        announcerServerId: r.announcer_server_id != null ? Number(r.announcer_server_id) : null,
        trackerServerId: r.tracker_server_id != null ? Number(r.tracker_server_id) : null,
        trackerEnabled: Boolean(r.tracker_enabled),
        requiredSeedDays: Number(r.required_seed_days),
        rollingWindowDays: Number(r.rolling_window_days),
        whitelistDurationDays: Number(r.whitelist_duration_days),
        maxExtensionDays: Number(r.max_extension_days),
        progressionChannelId: r.progression_channel_id,
        leaderboardChannelId: r.leaderboard_channel_id,
      };

      return success(c, config);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding config endpoint error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);
```

- [ ] **Step 2: Replace the PUT `/seeding/config` handler** so it persists the new fields (writes `role_ids` as a JSON string; writes the server ids + tracker rules; no longer writes the legacy `server_name`). Replace the existing `seeding.put("/seeding/config", ...)` block with:

```typescript
// PUT /seeding/config
seeding.put(
  "/seeding/config",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const body = await c.req.json<Partial<SeedingConfig>>();
      const roleIdsJson = JSON.stringify(Array.isArray(body.roleIds) ? body.roleIds.map((x) => String(x)) : []);

      await getSecretaryDb().$queryRaw(Prisma.sql`
        UPDATE seeding_config SET
          enabled = ${body.enabled ? 1 : 0},
          role_ids = ${roleIdsJson},
          seed_threshold = ${body.seedThreshold ?? 40},
          reset_threshold = ${body.resetThreshold ?? 20},
          daily_time = ${body.dailyTime ?? null},
          timezone = ${body.timezone ?? null},
          announcer_server_id = ${body.announcerServerId ?? null},
          tracker_server_id = ${body.trackerServerId ?? null},
          tracker_enabled = ${body.trackerEnabled ? 1 : 0},
          required_seed_days = ${body.requiredSeedDays ?? 10},
          rolling_window_days = ${body.rollingWindowDays ?? 30},
          whitelist_duration_days = ${body.whitelistDurationDays ?? 30},
          max_extension_days = ${body.maxExtensionDays ?? 60},
          progression_channel_id = ${body.progressionChannelId ?? null},
          leaderboard_channel_id = ${body.leaderboardChannelId ?? null}
         WHERE id = 1`
      );

      await audit(c, "discord_bot.update_seeding_config", "discord_bot");
      return success(c, { updated: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding config update error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);
```

- [ ] **Step 3: Add a server-list endpoint** (for the validated dropdown) and a **live-status endpoint**. Add the `SeedingLiveStatus` and `SquadServerOption` names to the `shared` import at the top of the file (it already imports `SeedingConfig, SeedingSession, SeedingRapport, SeedingRapportSeeder`). Then insert these two handlers immediately AFTER the PUT `/seeding/config` block:

```typescript
// GET /seeding/servers — canonical squadjs_servers list for the config dropdown
seeding.get(
  "/seeding/servers",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const pool = getSquadJSPool();
      const [rows] = await pool.query(`SELECT id, name FROM squadjs_servers ORDER BY id`);
      const servers: SquadServerOption[] = (rows as any[]).map((r) => ({ id: Number(r.id), name: String(r.name) }));
      return success(c, servers);
    } catch (err) {
      return fail(c, `Failed to load server list: ${err instanceof Error ? err.message : String(err)}`, 503);
    }
  }
);

// GET /seeding/live-status — last-known live state written by the bot each tick
seeding.get(
  "/seeding/live-status",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT server_resolved_ok, socket_connected, current_population, current_layer, active_session_id, updated_at
         FROM seeding_live_status WHERE id = 1`
      );
      if (rows.length === 0) {
        const empty: SeedingLiveStatus = {
          serverResolvedOk: false, socketConnected: false, currentPopulation: null,
          currentLayer: null, activeSessionId: null, updatedAt: null,
        };
        return success(c, empty);
      }
      const r = rows[0];
      const status: SeedingLiveStatus = {
        serverResolvedOk: Boolean(r.server_resolved_ok),
        socketConnected: Boolean(r.socket_connected),
        currentPopulation: r.current_population != null ? Number(r.current_population) : null,
        currentLayer: r.current_layer ?? null,
        activeSessionId: r.active_session_id != null ? Number(r.active_session_id) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      };
      return success(c, status);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding live-status endpoint error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);
```

- [ ] **Step 4: Typecheck api (seeding files only).** Run: `bunx tsc --noEmit -p packages/api/tsconfig.json 2>&1 | grep -E "seeding"`
Expected: EMPTY output (no seeding-file errors). If `discord-bot/seeding.ts` appears, fix it.

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/routes/discord-bot/seeding.ts
git commit -m "feat(seeding): config API exposes new fields + server-list + live-status endpoints"
```

---

## Task 3: API — server-scope the seeding-tracker queries

**Files:** Modify `packages/api/src/routes/seeding-tracker.ts`

The four query handlers (leaderboard, player, search, stats) currently count seed sessions on ALL servers. Scope them to `tracker_server_id` from `seeding_config` (secretary DB). When it's unset, return empty (the feature is unconfigured / "unavailable").

- [ ] **Step 1: Import the secretary DB and add a cached server-id helper.** At the top of the file, add to the imports:

```typescript
import getSecretaryDb, { resetSecretaryDb } from "../lib/secretary-db";
import { Prisma } from "../generated/prisma/client";
```

Then, right after `const seedingTracker = new Hono();`, add a helper that reads `tracker_server_id`:

```typescript
// The seeding tracker only counts the configured server. Read it from seeding_config.
async function getTrackerServerId(): Promise<number | null> {
  try {
    const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT tracker_server_id FROM seeding_config WHERE id = 1`
    );
    const v = rows[0]?.tracker_server_id;
    return v != null ? Number(v) : null;
  } catch {
    resetSecretaryDb();
    return null;
  }
}
```

- [ ] **Step 2: Scope the `/leaderboard` handler.** At the top of the handler (after parsing `days`/`limit`), add:

```typescript
  const serverId = await getTrackerServerId();
  if (serverId == null) return c.json({ success: true, data: [] satisfies SeedTrackerLeaderboardEntry[] });
```

Add `AND s.server_id = ?` to the query's WHERE (after the `s.status IN (...)` line, before the `s.seed_date >=` line) and prepend `serverId` to the params: change `pool.query(query, [days, limit])` to `pool.query(query, [serverId, days, limit])`. (The `?` order in the SQL must be: server_id, then the INTERVAL `days`, then LIMIT — verify placeholder order matches the params array.)

- [ ] **Step 3: Scope the `/player/:steamId` handler.** After `const steamId = ...`, add:

```typescript
  const serverId = await getTrackerServerId();
```

Then add `AND s.server_id = ${serverId placeholder}` to ALL FIVE squadjs queries (statsQuery, hourQuery, weekdayQuery, sessionsQuery, streakQuery) — each currently filters `WHERE p.steam_id = ? AND s.status IN ('completed','active')`; change each to `WHERE p.steam_id = ? AND s.server_id = ? AND s.status IN ('completed','active')` and update each `pool.query(q, [steamId])` to `pool.query(q, [steamId, serverId])`. The `nameQuery` (selects from `squadjs_players` only, no `s`) is unchanged. If `serverId` is null, these queries return no seed rows (correct "unavailable" behavior — the player detail will show zeros, which is acceptable). Keep the whitelist (Prisma) lookup unchanged.

- [ ] **Step 4: Scope the `/search` handler.** After validating `q`, add:

```typescript
  const serverId = await getTrackerServerId();
  if (serverId == null) return c.json({ success: true, data: [] satisfies SeedTrackerLeaderboardEntry[] });
```

Add `AND s.server_id = ?` to the WHERE (after `s.status IN (...)`) and change `pool.query(query, [\`%${q.trim()}%\`])` to `pool.query(query, [\`%${q.trim()}%\`, serverId])`. (Placeholder order: name LIKE first, then server_id — match the params.)

- [ ] **Step 5: Scope the `/stats` handler.** At the top, add:

```typescript
  const serverId = await getTrackerServerId();
  if (serverId == null) {
    return c.json({ success: true, data: { totalSeeders: 0, totalSeedHours: 0, avgQuality: 0, activeSeeders7d: 0, currentlySeedingCount: 0 } satisfies SeedTrackerStats });
  }
```

Add `AND s.server_id = ?` to the WHERE (after `s.status IN (...)`) and change `pool.query(query)` to `pool.query(query, [serverId])`.

- [ ] **Step 6: Typecheck api (seeding files only).** Run: `bunx tsc --noEmit -p packages/api/tsconfig.json 2>&1 | grep -E "seeding"`
Expected: EMPTY. Fix any error in `seeding-tracker.ts`.

- [ ] **Step 7: Commit.**

```bash
git add packages/api/src/routes/seeding-tracker.ts
git commit -m "fix(seeding): scope seeding-tracker queries to tracker_server_id"
```

---

## Task 4: Web api-client — server list + live-status functions

**Files:** Modify `packages/web/lib/api-client.ts`

- [ ] **Step 1: Read the file** to find the seeding-related functions (`getSeedingConfig`, `updateSeedingConfig`, `getSeedTrackerLeaderboard`, etc.) and copy their exact style (how they build the request, headers, return type, and the `ApiResponse<T>` wrapper).

- [ ] **Step 2: Add two functions** following that exact style. Import the new types (`SeedingLiveStatus`, `SquadServerOption`) from `shared` wherever the file imports `SeedingConfig`. Add:

```typescript
export function getSeedingServers(token: string): Promise<ApiResponse<SquadServerOption[]>> {
  return apiFetch<SquadServerOption[]>("/discord-bot/seeding/servers", token);
}

export function getSeedingLiveStatus(token: string): Promise<ApiResponse<SeedingLiveStatus>> {
  return apiFetch<SeedingLiveStatus>("/discord-bot/seeding/live-status", token);
}
```

**IMPORTANT:** match the file's ACTUAL helper (it may be `apiFetch`, `get`, or inline `fetch`) and the exact path prefix used by the other `/discord-bot/seeding/...` client functions — read `getSeedingConfig` and mirror it precisely. Adjust the bodies to whatever pattern the file uses.

- [ ] **Step 3: Typecheck web.** Run: `bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: exit 0. (If `updateSeedingConfig`/`getSeedingConfig` callers now mismatch the changed `SeedingConfig` shape — e.g. old `roleId`/`serverName` usage in SeedingTab — those surface here; if so, they're handled when SeedingTab is rebuilt in Task 6. To keep this task green, if the ONLY new errors are inside `discord-bot/components/SeedingTab.tsx`, note them and proceed; otherwise fix.)

- [ ] **Step 4: Commit.**

```bash
git add packages/web/lib/api-client.ts
git commit -m "feat(seeding): api-client getSeedingServers + getSeedingLiveStatus"
```

---

## Task 5: Web — new /seeding page (player half) + nav entry

**Files:**
- Create: `packages/web/app/(protected)/seeding/page.tsx`
- Create: `packages/web/app/(protected)/seeding/components/SeedingLeaderboard.tsx` (+ any chart subcomponents you extract)
- Modify: `packages/web/app/(protected)/layout.tsx`

This task stands up the new page and moves the **player-facing half** (leaderboard + search + player detail with the hourly/weekday charts + recent sessions) out of the existing `app/(protected)/seeding-tracker/page.tsx`.

- [ ] **Step 1: Read `app/(protected)/seeding-tracker/page.tsx` in full.** It contains: a Leaderboard/Search tab UI, top stat cards, the leaderboard table, the player-detail view, and the `HourlyChart`/`WeekdayChart` components, all wired to `getSeedTrackerLeaderboard`/`getSeedTrackerPlayer`/`searchSeedTracker`/`getSeedTrackerStats` and gated by `hasPermission("view:seeding-tracker")`. Also read a sibling protected page (e.g. `app/(protected)/discord-bot/page.tsx`) to copy the page shell/layout/styling conventions.

- [ ] **Step 2: Create `app/(protected)/seeding/page.tsx`.** Build the new page shell with section tabs/anchors. For THIS task, implement the **Leaderboard** and **Search** and **Player detail** sections by moving the corresponding JSX + data-fetching + the chart components out of `seeding-tracker/page.tsx` (extract the leaderboard/search/player-detail into `components/SeedingLeaderboard.tsx` and chart components as needed, imported by the page). Preserve the existing behavior and styling exactly. Gate these sections behind `hasPermission("view:seeding-tracker")` (same as today). Do NOT yet add the live-status card or admin sections (Task 6). Leave `seeding-tracker/page.tsx` in place for now (Task 7 redirects it).

- [ ] **Step 3: Add the nav entry.** In `app/(protected)/layout.tsx`, find the `NAV_ITEMS` array and add an entry for the new page, following the existing item shape exactly. Place it where the old "Seeding Tracker" item is (you can rename that item to "Seeding" pointing at `/seeding`, or add a new one — read the file and choose the cleaner edit):

```typescript
{ label: "Seeding", href: "/seeding", requiredPermissions: ["view:seeding-tracker", "manage:discord-bot"] },
```

(The `requiredPermissions` array means "any of" per the existing nav filter — confirm by reading how `requiredPermissions` is evaluated; mirror existing usage.)

- [ ] **Step 4: Typecheck web.** Run: `bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: exit 0. Fix any error in the new files.

- [ ] **Step 5: Commit.**

```bash
git add packages/web/app/\(protected\)/seeding/ packages/web/app/\(protected\)/layout.tsx
git commit -m "feat(seeding): new /seeding page with leaderboard/search/player detail + nav"
```

---

## Task 6: Web — live-status card + admin sections on /seeding

**Files:**
- Modify: `packages/web/app/(protected)/seeding/page.tsx`
- Create: `packages/web/app/(protected)/seeding/components/SeedingLiveStatus.tsx`
- Create: `packages/web/app/(protected)/seeding/components/SeedingAdmin.tsx`

- [ ] **Step 1: Read `app/(protected)/discord-bot/components/SeedingTab.tsx` in full.** It contains the Seeding Configuration form (enabled, thresholds, dailyTime, timezone, and the old free-text serverName), the Controls ("Send Seeding Call Now"), the Rapport (date picker + load + send-to-Discord), and the Session History table — wired to `getSeedingConfig`/`updateSeedingConfig`/`sendSeedingNow`/`getSeedingRapport`/`sendSeedingRapport`/`getSeedingSessions`.

- [ ] **Step 2: Create `components/SeedingLiveStatus.tsx`.** A read-only card that calls `getSeedingLiveStatus(token)` (poll every ~20s, matching the SeedingTab refresh pattern) and renders: current population + current layer + active-session indicator when `socketConnected`; otherwise a clear **"Server unavailable"** banner when `!serverResolvedOk` (misconfigured) or when `updatedAt` is older than 120s or `!socketConnected` (outage). Follow the existing card styling.

- [ ] **Step 3: Create `components/SeedingAdmin.tsx`.** Move the SeedingTab config/controls/rapport/history UI here, with these CHANGES:
  - The config form binds to the NEW `SeedingConfig` shape. Replace the free-text `serverName` input with TWO **dropdowns** — "Announcer server" (`announcerServerId`) and "Tracker server" (`trackerServerId`) — populated from `getSeedingServers(token)` (`SquadServerOption[]`, value = `id`, label = `name`; include a blank "— none —" option mapping to `null`).
  - Replace the single `roleId` field with a **role-list editor** for `roleIds` (string[]) — a simple add/remove list of Discord role IDs (text input + add button + removable chips). Keep it minimal.
  - Add inputs for the tracker rules: `trackerEnabled` (toggle), `requiredSeedDays`, `rollingWindowDays`, `whitelistDurationDays`, `maxExtensionDays` (number inputs), and `progressionChannelId` / `leaderboardChannelId` (text inputs).
  - Keep `enabled`, `seedThreshold`, `resetThreshold`, `dailyTime`, `timezone` as they were.
  - Save via `updateSeedingConfig(token, config)` (now carrying all the new fields). Keep Controls (sendSeedingNow), Rapport (getSeedingRapport/sendSeedingRapport), and Session History (getSeedingSessions) exactly as in SeedingTab.
  - Gate the whole admin component behind `hasPermission("manage:discord-bot")`.

- [ ] **Step 4: Wire both into `seeding/page.tsx`.** Render `SeedingLiveStatus` (visible to anyone with `view:seeding-tracker`) above the leaderboard, and render `SeedingAdmin` only when `hasPermission("manage:discord-bot")`. Use clear section headings.

- [ ] **Step 5: Typecheck web.** Run: `bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: exit 0. Fix any errors in the new files.

- [ ] **Step 6: Commit.**

```bash
git add packages/web/app/\(protected\)/seeding/
git commit -m "feat(seeding): live-status card + manager admin sections on /seeding"
```

---

## Task 7: Web — retire old surfaces (redirect, remove tab, overview card)

**Files:**
- Modify: `packages/web/app/(protected)/seeding-tracker/page.tsx`
- Modify: `packages/web/app/(protected)/discord-bot/page.tsx`
- Modify: `packages/web/app/(protected)/discord-bot/components/OverviewTab.tsx`
- Delete: `packages/web/app/(protected)/discord-bot/components/SeedingTab.tsx`

- [ ] **Step 1: Redirect the old tracker route.** Replace the entire body of `app/(protected)/seeding-tracker/page.tsx` with a client redirect to `/seeding`, following Next 15 app-router conventions. Read a sibling page for the import style, then use:

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SeedingTrackerRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/seeding"); }, [router]);
  return null;
}
```

(If the project prefers server-side `redirect()` from `next/navigation` in a server component, use that instead — match the codebase. The goal: visiting `/seeding-tracker` lands on `/seeding`.)

- [ ] **Step 2: Remove the Seeding tab from the discord-bot page.** In `app/(protected)/discord-bot/page.tsx`: remove the `{ key: "seeding", label: "Seeding" }` entry from the `TABS` array, remove the `SeedingTab` import, and remove the `{activeTab === "seeding" && <SeedingTab .../>}` render branch. If `"seeding"` is the default `activeTab`, change the default to another existing tab (e.g. `"overview"`). Read the file and make the minimal consistent edit.

- [ ] **Step 3: Slim the OverviewTab seeding widget.** In `app/(protected)/discord-bot/components/OverviewTab.tsx`, replace the seeding widget's body with a compact read-only status line (enabled + seedThreshold if available, or just a heading) plus a link to `/seeding` (use the project's existing `Link`/anchor pattern, e.g. `import Link from "next/link"` → `<Link href="/seeding">Manage seeding →</Link>`). Keep it small; don't fetch new data beyond what OverviewTab already has.

- [ ] **Step 4: Delete `SeedingTab.tsx`.** Run: `git rm packages/web/app/\(protected\)/discord-bot/components/SeedingTab.tsx`. First confirm via Grep that nothing else imports `SeedingTab` besides `discord-bot/page.tsx` (which Step 2 cleaned). If another importer exists, fix it.

- [ ] **Step 5: Typecheck web.** Run: `bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: exit 0. Fix any dangling references.

- [ ] **Step 6: Commit.**

```bash
git add packages/web/app/\(protected\)/seeding-tracker/page.tsx packages/web/app/\(protected\)/discord-bot/
git commit -m "refactor(seeding): redirect old tracker route, remove Seeding tab, link overview to /seeding"
```

---

## Task 8: Full typecheck + version bump

**Files:** Modify the root or web `package.json` version (match how Plan A bumped the bot — find the version field the project uses for the web app).

- [ ] **Step 1: Full typecheck sweep.**
  - `bunx tsc --noEmit -p packages/shared/tsconfig.json` → exit 0.
  - `bunx tsc --noEmit -p packages/web/tsconfig.json` → exit 0.
  - `bunx tsc --noEmit -p packages/api/tsconfig.json 2>&1 | grep -E "seeding"` → EMPTY.
  If any fail, STOP and fix before bumping.

- [ ] **Step 2: Grep for orphaned references.** Use Grep across `packages/web` for `SeedingTab`, `roleId` (in a `SeedingConfig` context), and `serverName` (seeding context) — confirm no dangling references to the removed tab/fields. Confirm `/seeding-tracker` is only referenced by the redirect page + the nav (if you kept a nav alias) — fix stragglers.

- [ ] **Step 3: Bump the version.** Find the version field used for the web app (per the memory note "webpage starts 1.0.0; bump on each push"). The root `package.json` version was `1.1.1` at branch base (`chore(release): 1.1.1`); bump the minor: set it to `1.2.0`.

- [ ] **Step 4: Commit.**

```bash
git add package.json
git commit -m "chore: bump version to 1.2.0 for seeding page consolidation"
```

---

## Self-Review

**Spec coverage (§8):**
- One dedicated `/seeding` page → Tasks 5, 6.
- Permission-gated sections (staff leaderboard, manager admin) → Tasks 5 (view:seeding-tracker), 6 (manage:discord-bot).
- Live-status card reading the bot's `seeding_live_status` → Tasks 2 (endpoint), 6 (card).
- Validated server dropdown from `squadjs_servers` → Tasks 2 (endpoint), 6 (dropdowns).
- `server_id` filter on the tracker API → Task 3.
- Config exposes the new DB fields (role_ids, server ids, tracker rules, channels) → Tasks 1, 2, 6.
- Retire `/discord-bot` SeedingTab + redirect old `/seeding-tracker` → Task 7.
- Permissions reuse `view:seeding-tracker` + `manage:discord-bot` → Tasks 5, 6.

**Placeholder scan:** Tasks 5/6/7 are deliberately *structural reuse* tasks (move existing JSX from named files, follow existing patterns) rather than full-JSX dumps — appropriate for a UI rebuild in an existing codebase with no test runner. Every such task names the exact source file to read, the exact data contracts (endpoints + types from Tasks 1–4), the exact permission gates, and acceptance criteria (typecheck + behavior preserved). Tasks 1–4 (backend + client) contain complete code.

**Type consistency:** `SeedingConfig` (Task 1) is produced by the API (Task 2) and consumed by the client/admin form (Tasks 4, 6) with matching field names (`roleIds`, `announcerServerId`, `trackerServerId`, `trackerEnabled`, `requiredSeedDays`, `rollingWindowDays`, `whitelistDurationDays`, `maxExtensionDays`, `progressionChannelId`, `leaderboardChannelId`). `SeedingLiveStatus`/`SquadServerOption` (Task 1) flow API (Task 2) → client (Task 4) → components (Task 6). `getTrackerServerId` (Task 3) reads `tracker_server_id` consistent with the column from Plan A.

**Open item (from spec §11):** live-status staleness threshold — implemented as 120s in Task 6 Step 2.

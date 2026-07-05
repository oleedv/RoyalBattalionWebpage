# Birthday Announcements — Implementation Plan

**For agentic workers:** Execute tasks in order. Each task is self-contained: it lists the exact files to create/modify (with line anchors), an **Interfaces** contract (Consumes / Produces — exact names + types so downstream tasks stay consistent), numbered bite-sized steps with real, copy-pasteable code (no placeholders), a concrete **Verify** step using the real project command, and a **Commit** one-liner (Conventional Commits, no AI attribution — commits are run later, keep them as steps). Do not invent test frameworks for the webpage. Trust the code blocks here over your assumptions; every one was written against the real files.

**Goal:** When a member's birthday is complete (a real date, not the Jan-1 placeholder) and the feature is enabled from the dashboard, the Discord bot posts one gold embed per birthday member in the configured channel (default the royal lounge) once per day at a configured time/timezone, tagging the birthday member and the member role. Members self-serve their privacy (opt out of the announcement; opt in to show their age). Admins control enable/channel/time/timezone from the main dashboard.

**Architecture:**
- **Webpage DB `royal_battalion`** (Prisma, MySQL/MariaDB) holds the config (`BirthdayConfig` singleton) and the two per-member privacy flags (`User.birthdayOptOut`, `User.birthdayShowAge`). Written by the webpage via the normal generated Prisma client; read by the bot via its optional `website` pool. One DB, one pool, no sync job — changes take effect within one scheduler tick (~60s).
- **Webpage API** (Hono, `packages/api`): a new admin route `GET`/`PATCH /v1/discord-bot/birthday` (Prisma, upsert singleton) and a new self-service route `PATCH /v1/users/me/birthday-prefs` (updates only the caller's own row).
- **Webpage UI** (`packages/web`, Next.js App Router): an admin-gated "Birthday announcements" card + two self-service toggles on the dashboard profile card.
- **Bot** (`RoyalSecretaryDiscordBot`, Bun + discord.js v14 + MariaDB): a new `birthdayScheduler` mirroring `seedingScheduler`, registered in `events/ready.js` via `safeInit`, ticking on the existing ~60s cadence. Reads config + eligibility from the `website` pool; idempotency log `birthday_post_log` lives in `Royal_secretary` (created via `initSchema`).

**Tech Stack:** Bun monorepo. `packages/api` (Hono, port 3001), `packages/web` (Next.js 15 / React 19), `packages/shared` (TS types). Prisma 7 client generated to `packages/api/src/generated/prisma`; schema at repo-root `prisma/schema.prisma`; migrations applied with `bunx prisma db push` (no migrations folder). Bot: ESM, discord.js v14, `mariadb` pools via `query(sql, params, poolName)`, Pino logger, `bun test` runner (colocated `*.test.js`).

---

## Global Constraints

Copy these exact values everywhere they appear; do not paraphrase.

- **Admin gate:** `manage:discord-bot` for writes (PATCH); `view:discord-bot` **or** `manage:discord-bot` for reads (GET). These are real `Permission` values (`packages/shared/types/roles.ts`). `developer` implicitly satisfies any gate (see `requirePermission` + `PermissionProvider.hasPermission`).
- **Default channel id (royal lounge):** `460898033794809856` (bot `config.prospects.loungeChannelId`, prod). Used as the admin card's default channel value.
- **Member role id (mass ping target):** bot `config.prospects.memberRoleId` = `528574587747958794` (prod).
- **Timezone default:** `Europe/Oslo`. **Post-time default:** `09:00` (HH:MM, 24h).
- **Config store deviation (IMPORTANT):** `BirthdayConfig` lives in the webpage's own DB `royal_battalion` and is accessed by the API via the **normal generated Prisma client** (`import prisma from "../../lib/db"`), **NOT** `getSecretaryDb()`. (The seeding route writes the bot's `Royal_secretary` via a secondary raw connection — the birthday feature deliberately does not.)
- **Webpage has NO test framework.** Verify webpage tasks with `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` (builds `shared` via `tsc`, `web` via `next build` which typechecks the **web** package, `api` via `bun build`). Add a documented manual check (curl / SQL) where a build can't prove behavior. Do NOT add vitest/jest/bun-test to the webpage.
- **⚠️ Webpage typecheck gate (read once, applies to every API-side task — Tasks 2, 3, 4).** `bun run build` does **NOT** typecheck the `api` package (`bun build` skips type errors) — so build passing does **not** by itself prove API-side type correctness. The only API typecheck is `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api && bunx tsc --noEmit`, and **it is dirty at baseline**: it exits non-zero with ~20 PRE-EXISTING errors unrelated to this feature (e.g. `src/routes/auth.ts:141`, `src/lib/audit.ts:29`, `src/lib/match-assembler.ts`, `src/lib/match-sync.ts`, `src/routes/admin-groups.ts`, `src/routes/clans.ts`, `src/routes/matches.ts`, `src/routes/discord-bot/overview.ts`). **Do NOT try to fix those — they are out of scope.** Your gate for an API change is: (a) `bun run build` still passes, **and** (b) `bunx tsc --noEmit` produces **NO NEW** errors mentioning `birthday`, `BirthdayConfig`, `birthdayOptOut`, `birthdayShowAge`, or `birthday-prefs`. If unsure whether an error is new, run `bunx tsc --noEmit 2>&1 | Select-String -Pattern 'birthday' -CaseSensitive:$false` (PowerShell) and confirm it prints nothing. Capture the baseline error list before starting Task 2 if you want a clean diff.
- **Bot verification:** `cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun test` (runs the suite incl. the new unit test) plus a throwaway bundle-smoke `bun build src/index.js --target bun --outdir ./.buildcheck` (catches import/syntax errors across the whole graph once `ready.js` imports the new scheduler; delete `.buildcheck` after).
- **No emojis** in code, commit messages, or generated content (global rule) — including the Discord embed copy. Keep birthday copy text-only.
- **Version bump on every push:** webpage → bump `C:/Users/OleEd/Azure/RoyalBattalionWebpage/package.json` `version` `2.3.0` → `2.4.0` (minor). Bot → bump `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/package.json` `version` `2.29.1` → `2.30.0` (minor). Done in Task 12.
- **Commits:** Conventional Commits one-liners, no `Co-Authored-By` / no AI attribution.
- **Deploy mapping:** Bot — push `main` = staging, merge `main → production` = prod (no slash-command re-registration needed). Webpage — Railway auto-deploys from the `production` branch. **Order:** ship the webpage schema (`db push`) FIRST so the table/columns exist before the bot reads them.
- **Rollout risk:** the bot's `website` pool is optional (`connection.js` `OPTIONAL_POOLS`) and may be unconfigured in an environment — then the feature is silently inert. The scheduler guards via `isConfigured()`. The deploy checklist (Task 12) must confirm the `website` pool is wired.

---

## Task 1 — Webpage Prisma schema: `BirthdayConfig` + two `User` columns

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/prisma/schema.prisma` — `User` model (lines 10–30, add two fields); append new `BirthdayConfig` model after `AuditLog` (after line 175).

**Interfaces**
- Produces (Prisma models / DB): `User.birthdayOptOut Boolean @default(false)`, `User.birthdayShowAge Boolean @default(false)`; model `BirthdayConfig { id String @id @default("singleton"); enabled Boolean @default(false); channelId String?; postTime String @default("09:00"); timezone String @default("Europe/Oslo") }`.
- Produces (generated client): `prisma.birthdayConfig` accessor + `birthdayOptOut` / `birthdayShowAge` on `prisma.user`.

**Steps**

1. In the `User` model, add the two columns immediately after the `dateOfBirth` line (line 20). Change:
```prisma
  dateOfBirth    DateTime?
  hasLoggedIn    Boolean         @default(false)
```
to:
```prisma
  dateOfBirth     DateTime?
  birthdayOptOut  Boolean         @default(false)
  birthdayShowAge Boolean         @default(false)
  hasLoggedIn     Boolean         @default(false)
```

2. Append the singleton config model at the end of the file (after the `AuditLog` model closing brace, line 175):
```prisma

/// Singleton (single row, id = "singleton") controlling the Discord birthday
/// announcer. Read by the bot via its optional `website` pool; written by the
/// webpage via the normal Prisma client. postTime is "HH:MM" 24h.
model BirthdayConfig {
  id        String  @id @default("singleton")
  enabled   Boolean @default(false)
  channelId String?
  postTime  String  @default("09:00")
  timezone  String  @default("Europe/Oslo")
  updatedAt DateTime @updatedAt
}
```

3. Regenerate the client (required — the API build references `prisma.birthdayConfig`):
```
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run db:generate
```

4. Apply the schema to the target database (dev/local now; prod at rollout — see Task 12). Needs a reachable `DATABASE_URL`:
```
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run db:push
```

**Verify**
- `bun run db:generate` succeeds and `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api/src/generated/prisma/models/BirthdayConfig.ts` now exists; `.../models/User.ts` contains `birthdayOptOut` and `birthdayShowAge`.
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` passes.
- Manual (after `db:push`, against the pushed DB): `SHOW COLUMNS FROM User LIKE 'birthday%';` returns two rows; `SHOW COLUMNS FROM BirthdayConfig;` returns `id, enabled, channelId, postTime, timezone, updatedAt`.

**Commit**
```
feat(db): add BirthdayConfig singleton and user birthday privacy columns
```

---

## Task 2 — Shared types + producers (`User` fields, `BirthdayConfig` type)

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/shared/types/user.ts` — `User` interface (lines 1–18).
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/shared/types/discord-bot.ts` — add `BirthdayConfig` interface (top of file).
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api/src/routes/users.ts` — `mapUser` (lines 68–92) must include the new fields (its return type is `UserWithRoles`, so the build breaks otherwise).
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api/src/routes/auth.ts` — `/me` handler's `userWithRoles` literal (lines 173–195) for correctness (the `/sync` handler already carries them via `...user` spread).

**Interfaces**
- Produces (types): `User.birthdayOptOut: boolean`, `User.birthdayShowAge: boolean` (so `UserWithRoles` / `UserWithRolesAndComments` inherit them); `BirthdayConfig { enabled: boolean; channelId: string | null; postTime: string; timezone: string }`.
- Consumes: nothing new.

**Steps**

1. In `packages/shared/types/user.ts`, add the two fields after `dateOfBirth` (line 11):
```ts
  dateOfBirth: string | null;
  birthdayOptOut: boolean;
  birthdayShowAge: boolean;
  hasLoggedIn: boolean;
```

2. In `packages/shared/types/discord-bot.ts`, add at the very top (before `SeedingConfig`):
```ts
export interface BirthdayConfig {
  enabled: boolean;
  channelId: string | null;
  postTime: string; // "HH:MM" 24h
  timezone: string;
}
```
(`shared/index.ts` already re-exports `./types/discord-bot` and `./types/user`, so no barrel edit is needed.)

3. In `packages/api/src/routes/users.ts` `mapUser` (return typed `UserWithRoles`), add the two fields next to `dateOfBirth` (line 79). Change:
```ts
    dateOfBirth: u.dateOfBirth?.toISOString() ?? null,
    hasLoggedIn: u.hasLoggedIn ?? false,
```
to:
```ts
    dateOfBirth: u.dateOfBirth?.toISOString() ?? null,
    birthdayOptOut: u.birthdayOptOut ?? false,
    birthdayShowAge: u.birthdayShowAge ?? false,
    hasLoggedIn: u.hasLoggedIn ?? false,
```

4. In `packages/api/src/routes/auth.ts` `/me` handler, add the two fields next to `dateOfBirth` (line 183). Change:
```ts
    dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
    hasLoggedIn: user.hasLoggedIn,
```
to:
```ts
    dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
    birthdayOptOut: user.birthdayOptOut,
    birthdayShowAge: user.birthdayShowAge,
    hasLoggedIn: user.hasLoggedIn,
```
(The `/sync` handler builds its user via `{ ...user, ... }`, so after Task 1's regenerate the two booleans flow through automatically — the dashboard's context user gets them from `/sync`.)

**Verify** (this task widens a required interface, so the API typecheck matters — see the **Webpage typecheck gate** in Global Constraints)
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` passes. (Note: this typechecks `web` + `shared` but NOT the `api` producers — so on its own it does **not** prove `mapUser`/`auth.ts` were updated.)
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api && bunx tsc --noEmit` produces NO NEW errors mentioning `birthday`/`birthdayOptOut`/`birthdayShowAge` (baseline pre-existing errors remain — do not fix them). If you skipped step 3 or 4, this is where the widened required fields surface as a NEW `User`/`UserWithRoles` type error — that is the signal to add the missing producer field.

**Commit**
```
feat(shared): add birthday privacy fields to User type and BirthdayConfig type
```

---

## Task 3 — Admin API route `GET`/`PATCH /v1/discord-bot/birthday` (+ mount)

**Files**
- Create `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api/src/routes/discord-bot/birthday.ts`.
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api/src/routes/discord-bot/index.ts` — import + mount (lines 1–19).

**Interfaces**
- Consumes (types): `BirthdayConfig` (shared); Prisma model `birthdayConfig`.
- Produces (HTTP): `GET /v1/discord-bot/birthday` → `ApiResponse<BirthdayConfig>` (gated `view:discord-bot`|`manage:discord-bot`); `PATCH /v1/discord-bot/birthday` accepting `Partial<BirthdayConfig>` → `ApiResponse<BirthdayConfig>` (gated `manage:discord-bot`). Singleton row `id = "singleton"`.

**Steps**

1. Create `packages/api/src/routes/discord-bot/birthday.ts`:
```ts
import { Hono } from "hono";
import { z } from "zod";
import type { BirthdayConfig } from "shared";
import prisma from "../../lib/db";
import { requirePermission } from "../../middleware/permissions";
import { validate } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { success } from "../../lib/crud-helpers";
import { logger } from "../../lib/logger";

const birthday = new Hono();

const SINGLETON_ID = "singleton";

const DEFAULTS: BirthdayConfig = {
  enabled: false,
  channelId: null,
  postTime: "09:00",
  timezone: "Europe/Oslo",
};

// GET /birthday — returns the singleton (defaults when the row does not exist yet).
birthday.get(
  "/birthday",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const row = await prisma.birthdayConfig.findUnique({ where: { id: SINGLETON_ID } });
    const config: BirthdayConfig = row
      ? { enabled: row.enabled, channelId: row.channelId, postTime: row.postTime, timezone: row.timezone }
      : DEFAULTS;
    return success(c, config);
  }
);

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  channelId: z.string().regex(/^\d{5,25}$/, "channelId must be a numeric Discord ID").nullable().optional(),
  postTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "postTime must be HH:MM (24h)").optional(),
  timezone: z.string().min(1).max(64).optional(),
});

// PATCH /birthday — partial update; upserts the singleton so the first save creates it.
birthday.patch(
  "/birthday",
  requirePermission("manage:discord-bot"),
  validate("json", patchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const data = {
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.channelId !== undefined && { channelId: body.channelId }),
      ...(body.postTime !== undefined && { postTime: body.postTime }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
    };

    const row = await prisma.birthdayConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    await audit(c, "discord_bot.update_birthday_config", "discord_bot", null, body as Record<string, unknown>);

    logger.info("discord-bot", "Birthday config updated", body);
    const config: BirthdayConfig = { enabled: row.enabled, channelId: row.channelId, postTime: row.postTime, timezone: row.timezone };
    return success(c, config);
  }
);

export default birthday;
```

2. Mount it in `packages/api/src/routes/discord-bot/index.ts`. Add the import next to the others and the `route` next to the others:
```ts
import seeding from "./seeding";
import birthday from "./birthday";
import timeouts from "./timeouts";
```
```ts
discordBot.route("/", seeding);
discordBot.route("/", birthday);
discordBot.route("/", timeouts);
```
(`discordBot.use("*", authMiddleware)` already applies to every sub-router.)

**Verify** (see the **Webpage typecheck gate** in Global Constraints)
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` passes, **and** `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api && bunx tsc --noEmit` shows NO NEW `birthday`-related errors (the ~20 pre-existing baseline errors are expected and out of scope — do not fix them).
- Manual (API running, with a `manage:discord-bot` JWT in `$T`):
  - `curl -s -H "Authorization: Bearer $T" http://localhost:3001/v1/discord-bot/birthday` → `{"success":true,"data":{"enabled":false,"channelId":null,"postTime":"09:00","timezone":"Europe/Oslo"}}`.
  - `curl -s -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"enabled":true,"channelId":"460898033794809856","postTime":"09:00","timezone":"Europe/Oslo"}' http://localhost:3001/v1/discord-bot/birthday` → echoes the saved config; a second GET reflects it; `SELECT * FROM BirthdayConfig;` shows one row id=`singleton`.
  - Without the permission → HTTP 403 `Insufficient permissions`.

**Commit**
```
feat(api): add admin birthday-config route under discord-bot
```

---

## Task 4 — Self-service API route `PATCH /v1/users/me/birthday-prefs`

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api/src/routes/users.ts` — insert the new handler immediately after the `link-steam` handler (after line 66), so it sits in the self-service cluster and well before any `/:id` routes.

**Interfaces**
- Consumes (auth): `authMiddleware` sets `c.get("userId")` (the caller's own id).
- Produces (HTTP): `PATCH /v1/users/me/birthday-prefs` accepting `{ birthdayOptOut?: boolean; birthdayShowAge?: boolean }` (≥1 present) → `ApiResponse<{ birthdayOptOut: boolean; birthdayShowAge: boolean }>`. Updates ONLY the caller's row; no other fields.

**Steps**

1. In `packages/api/src/routes/users.ts`, right after the closing `});` of the `users.post("/link-steam", ...)` handler (line 66), insert:
```ts
const birthdayPrefsSchema = z
  .object({
    birthdayOptOut: z.boolean().optional(),
    birthdayShowAge: z.boolean().optional(),
  })
  .refine((d) => d.birthdayOptOut !== undefined || d.birthdayShowAge !== undefined, {
    message: "Provide at least one of birthdayOptOut or birthdayShowAge",
  });

// Self-service: a member edits only their OWN birthday privacy flags (mirrors
// /link-steam — auth only, keyed on the session user id, no admin permission).
users.patch("/me/birthday-prefs", authMiddleware, rateLimit(20), validate("json", birthdayPrefsSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.birthdayOptOut !== undefined && { birthdayOptOut: body.birthdayOptOut }),
        ...(body.birthdayShowAge !== undefined && { birthdayShowAge: body.birthdayShowAge }),
      },
      select: { birthdayOptOut: true, birthdayShowAge: true },
    });
    return success(c, updated);
  } catch (err) {
    logger.error("users", "Failed to update birthday prefs", { userId, err });
    return fail(c, "Failed to update birthday preferences.", 500);
  }
});
```
All identifiers used (`z`, `validate`, `authMiddleware`, `rateLimit`, `prisma`, `success`, `fail`, `logger`) are already imported at the top of `users.ts`. `/me/birthday-prefs` is a two-segment path that does not collide with the one-segment `/:id` or the `/:id/<static>` routes.

**Verify** (see the **Webpage typecheck gate** in Global Constraints)
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` passes, **and** `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/api && bunx tsc --noEmit` shows NO NEW `birthday`/`birthday-prefs`-related errors (the ~20 pre-existing baseline errors are expected and out of scope — do not fix them).
- Manual (API running, any logged-in member JWT in `$T`):
  - `curl -s -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"birthdayOptOut":true}' http://localhost:3001/v1/users/me/birthday-prefs` → `{"success":true,"data":{"birthdayOptOut":true,"birthdayShowAge":false}}`; the caller's own `User` row changed, no one else's.
  - `-d '{}'` → HTTP 400 with the refine message.

**Commit**
```
feat(api): add self-service birthday-prefs route for members
```

---

## Task 5 — Web api-client functions

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/web/lib/api-client.ts` — add `BirthdayConfig` to the shared import block (lines 1–40); add three exported functions near the other discord-bot / user functions.

**Interfaces**
- Consumes (HTTP): the routes from Tasks 3 & 4.
- Produces (functions): `getBirthdayConfig(token) → ApiResponse<BirthdayConfig>`; `updateBirthdayConfig(token, data: Partial<BirthdayConfig>) → ApiResponse<BirthdayConfig>`; `updateBirthdayPrefs(token, data: { birthdayOptOut?: boolean; birthdayShowAge?: boolean }) → ApiResponse<{ birthdayOptOut: boolean; birthdayShowAge: boolean }>`.

**Steps**

1. Add `BirthdayConfig` to the type import list (append inside the `import type { ... } from "shared";` block, e.g. after `SeedingLiveStatus,` on line 39):
```ts
  SeedingLiveStatus,
  BirthdayConfig,
} from "shared";
```

2. Append the three functions (e.g. right after `getSeedingLiveStatus`, ~line 812):
```ts
// Birthday announcer — admin config
export function getBirthdayConfig(
  token: string
): Promise<ApiResponse<BirthdayConfig>> {
  return request<BirthdayConfig>("/discord-bot/birthday", {
    headers: authHeaders(token),
  });
}

export function updateBirthdayConfig(
  token: string,
  data: Partial<BirthdayConfig>
): Promise<ApiResponse<BirthdayConfig>> {
  return request<BirthdayConfig>("/discord-bot/birthday", {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

// Birthday announcer — member self-service privacy flags
export function updateBirthdayPrefs(
  token: string,
  data: { birthdayOptOut?: boolean; birthdayShowAge?: boolean }
): Promise<ApiResponse<{ birthdayOptOut: boolean; birthdayShowAge: boolean }>> {
  return request<{ birthdayOptOut: boolean; birthdayShowAge: boolean }>(
    "/users/me/birthday-prefs",
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }
  );
}
```

**Verify**
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` passes.

**Commit**
```
feat(web): add birthday config and prefs api-client functions
```

---

## Task 6 — Dashboard admin card ("Birthday announcements")

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/web/app/(protected)/dashboard/page.tsx` — imports (lines 6–10); add a `BirthdayAdminCard` component; render it admin-gated in the page body.

**Interfaces**
- Consumes: `getBirthdayConfig`, `updateBirthdayConfig` (Task 5); `usePermissions().hasPermission("manage:discord-bot")`; `apiToken`.
- Produces: an admin-only card (enable toggle, channel input defaulting to `460898033794809856`, post time, timezone) that persists via `updateBirthdayConfig`.

**Steps**

1. Extend the api-client import (line 6) and add the `BirthdayConfig` type import (line 9):
```ts
import { linkSteam, getDashboardStats, getBirthdayConfig, updateBirthdayConfig, updateBirthdayPrefs } from "@/lib/api-client";
```
```ts
import type { UserWithRoles, BirthdayConfig } from "shared";
```
(`updateBirthdayPrefs` is used in Task 7; import it now.)

2. Add the `BirthdayAdminCard` component. Insert it just above `export default function DashboardPage()` (line 237):
```tsx
/* ── Birthday admin card ────────────────────────────────────────────── */

const DEFAULT_LOUNGE_CHANNEL_ID = "460898033794809856";

function BirthdayAdminCard({ token }: { token: string }) {
  const [config, setConfig] = useState<BirthdayConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBirthdayConfig(token).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        // Pre-fill the royal-lounge default when no channel is set yet.
        setConfig({ ...res.data, channelId: res.data.channelId ?? DEFAULT_LOUNGE_CHANNEL_ID });
      } else {
        setError(res.error || "Failed to load birthday config");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateBirthdayConfig(token, config);
    setSaving(false);
    if (res.success && res.data) {
      setConfig({ ...res.data, channelId: res.data.channelId ?? DEFAULT_LOUNGE_CHANNEL_ID });
      setSaved(true);
    } else {
      setError(res.error || "Failed to save");
    }
  }

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
          Birthday announcements
        </h2>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            disabled={!config}
            onChange={(e) => config && setConfig({ ...config, enabled: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Enabled
        </label>
      </div>

      {!config ? (
        <p className="text-sm text-text-muted">{error || "Loading..."}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
                Channel ID
              </span>
              <input
                type="text"
                value={config.channelId ?? ""}
                onChange={(e) => setConfig({ ...config, channelId: e.target.value.trim() || null })}
                placeholder={DEFAULT_LOUNGE_CHANNEL_ID}
                className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
                Post time
              </span>
              <input
                type="time"
                value={config.postTime}
                onChange={(e) => setConfig({ ...config, postTime: e.target.value })}
                className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
                Timezone
              </span>
              <input
                type="text"
                value={config.timezone}
                onChange={(e) => setConfig({ ...config, timezone: e.target.value.trim() })}
                placeholder="Europe/Oslo"
                className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-sm bg-accent px-4 py-1.5 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-xs text-success">Saved.</span>}
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
```

3. Render it admin-gated. In the returned JSX, after the `{/* ── My Squad Stats ── */}` block (after line 459, `<PlayerStatsSection />`), add:
```tsx
      {/* ── Birthday announcements (admin) ─────────────────────────── */}
      {hasPermission("manage:discord-bot") && <BirthdayAdminCard token={apiToken} />}
```
`apiToken` is narrowed to `string` by the `if (!apiToken) return ...` guard at line 309, and `hasPermission` is already destructured from `usePermissions()` at line 239.

**Verify**
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` passes.
- Manual: log in as a `manage:discord-bot` (or `developer`) user → the card appears, loads current config, channel pre-fills `460898033794809856` when unset; edit + Save → "Saved." and a page reload shows persisted values. Log in as a non-admin → the card is absent.

**Commit**
```
feat(web): add admin birthday announcements card to dashboard
```

---

## Task 7 — Dashboard self-service toggles (profile card)

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/packages/web/app/(protected)/dashboard/page.tsx` — add a `BirthdayPrefsToggles` component; render it inside the profile card next to the read-only DOB.

**Interfaces**
- Consumes: `updateBirthdayPrefs` (Task 5, imported in Task 6); `displayUser.birthdayOptOut` / `displayUser.birthdayShowAge` (initial state, present on the sync context user after Task 2); `apiToken`.
- Produces: two toggles that persist via `PATCH /users/me/birthday-prefs`.

**Steps**

1. Add the `BirthdayPrefsToggles` component just above `export default function DashboardPage()` (near `BirthdayAdminCard`):
```tsx
/* ── Birthday self-service toggles ──────────────────────────────────── */

function BirthdayPrefsToggles({
  token,
  initialOptOut,
  initialShowAge,
}: {
  token: string;
  initialOptOut: boolean;
  initialShowAge: boolean;
}) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [showAge, setShowAge] = useState(initialShowAge);
  const [error, setError] = useState<string | null>(null);

  // Keep in sync if the context user re-syncs (token refresh every ~2 min).
  useEffect(() => {
    setOptOut(initialOptOut);
    setShowAge(initialShowAge);
  }, [initialOptOut, initialShowAge]);

  async function update(next: { birthdayOptOut?: boolean; birthdayShowAge?: boolean }) {
    setError(null);
    const res = await updateBirthdayPrefs(token, next);
    if (res.success && res.data) {
      setOptOut(res.data.birthdayOptOut);
      setShowAge(res.data.birthdayShowAge);
    } else {
      setError(res.error || "Failed to save");
      // Revert the optimistic flip.
      if (next.birthdayOptOut !== undefined) setOptOut(!next.birthdayOptOut);
      if (next.birthdayShowAge !== undefined) setShowAge(!next.birthdayShowAge);
    }
  }

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="mb-1.5 text-[10px] font-medium tracking-wider text-text-muted uppercase">
        Birthday
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={optOut}
            onChange={(e) => {
              setOptOut(e.target.checked);
              update({ birthdayOptOut: e.target.checked });
            }}
            className="h-4 w-4 accent-accent"
          />
          Don&apos;t announce my birthday
        </label>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showAge}
            onChange={(e) => {
              setShowAge(e.target.checked);
              update({ birthdayShowAge: e.target.checked });
            }}
            className="h-4 w-4 accent-accent"
          />
          Show my age in the announcement
        </label>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
```

2. Render it inside the profile card, right after the Steam-link form block and before the profile card's closing `</div>` (after line 455, the `{!displayUser?.steamId && ( ... )}` block):
```tsx
        {/* Birthday privacy self-service */}
        {displayUser && (
          <BirthdayPrefsToggles
            token={apiToken}
            initialOptOut={displayUser.birthdayOptOut}
            initialShowAge={displayUser.birthdayShowAge}
          />
        )}
```
`displayUser` is `UserWithRoles | null` (guarded); its `birthdayOptOut` / `birthdayShowAge` exist after Task 2 and are populated by the `/auth/sync` context user.

**Verify**
- `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build` passes.
- Manual: on `/dashboard`, the profile card shows the two toggles seeded from the caller's own record; toggling either persists (`PATCH /users/me/birthday-prefs` returns 200) and survives a reload.

**Commit**
```
feat(web): add member birthday privacy toggles to dashboard profile
```

---

## Task 8 — Bot: `birthday_post_log` idempotency table via `initSchema`

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/src/database/schema.js` — add a `CREATE TABLE IF NOT EXISTS` before the final `log.info('Database schema initialized')` (line 664).

**Interfaces**
- Produces (DB, `Royal_secretary`): `birthday_post_log (user_id VARCHAR(20), post_date DATE, posted_at TIMESTAMP, PRIMARY KEY (user_id, post_date))`. `user_id` stores the Discord user id; `post_date` is `YYYY-MM-DD` in the config timezone.

**Steps**

1. In `schema.js`, immediately before `log.info('Database schema initialized');` (line 664), insert:
```js
  // ── Birthday announcer idempotency ──
  // One post per member per day. user_id holds the Discord user id; post_date is
  // 'YYYY-MM-DD' in the configured timezone. Inserted only after a successful send,
  // so a mid-batch restart resumes with the remaining members and never re-posts.
  await query(`
    CREATE TABLE IF NOT EXISTS birthday_post_log (
      user_id   VARCHAR(20) NOT NULL,
      post_date DATE        NOT NULL,
      posted_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, post_date)
    )
  `);
```
This uses the default `secretary` pool (like every other statement in `initSchema`), so the table lands in `Royal_secretary`.

**Verify**
- `cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun build src/index.js --target bun --outdir ./.buildcheck` succeeds (no syntax error), then delete `./.buildcheck`.
- Manual (bot booted against a DB): `SHOW CREATE TABLE birthday_post_log;` shows the composite primary key `(user_id, post_date)`.

**Commit**
```
feat(bot): create birthday_post_log idempotency table in initSchema
```

---

## Task 9 — Bot: pure `birthdayLogic` (+ unit test) and `birthdayService`

**Files**
- Create `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/src/services/birthday/birthdayLogic.js`.
- Create `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/src/services/birthday/birthdayLogic.test.js`.
- Create `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/src/services/birthday/birthdayService.js`.

**Interfaces**
- Produces (pure, `birthdayLogic.js`): `localYmd(now, tz) → {year,month,day}`; `localDateString(now, tz) → "YYYY-MM-DD"`; `localTimeString(now, tz) → "HH:MM"`; `isLeapYear(year) → boolean`; `birthdayTargets(now, tz) → Array<{month,day}>`; `isEligibleBirthday(dob, now, tz) → boolean`; `computeAge(dobYear, now, tz) → number`.
- Produces (DB, `birthdayService.js`): `isConfigured() → boolean` (re-exported from `whitelistService`); `getBirthdayConfig() → {enabled,channelId,postTime,timezone}|null` (website pool); `getEligibleBirthdayMembers(targets) → rows[]` with fields `id, discordId, dobYear, dobMonth, dobDay, avatarUrl, displayName, discordName, birthdayShowAge` (website pool); `loadPostedToday(postDate) → Set<string>|null` (secretary; `null` = read error → caller skips); `recordPosted(discordId, postDate) → void` (secretary).
- Consumes: `query` (`../../database/connection.js`), `isConfigured` (`../whitelistService.js`).

**Steps**

1. Create `src/services/birthday/birthdayLogic.js`:
```js
// Pure date helpers for the birthday announcer. No Discord/DB imports, so the
// eligibility logic is unit-testable in isolation.

// {year, month, day} of `now` in the given IANA timezone.
export function localYmd(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// 'YYYY-MM-DD' for `now` in `timezone` (matches the post_date DATE column).
export function localDateString(now, timezone) {
  const { year, month, day } = localYmd(now, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 'HH:MM' (24h) for `now` in `timezone`.
export function localTimeString(now, timezone) {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat('en', { hour: '2-digit', hour12: false, timeZone: timezone }).format(now),
      10,
    );
    const minute = parseInt(
      new Intl.DateTimeFormat('en', { minute: '2-digit', timeZone: timezone }).format(now),
      10,
    );
    return `${String(hour % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  } catch {
    return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  }
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Month/day pairs that count as "today's birthday" in `timezone`. Normally just
// today; on Feb 28 of a common (non-leap) year, Feb 29 birthdays are celebrated
// too, so (2,29) is added.
export function birthdayTargets(now, timezone) {
  const { year, month, day } = localYmd(now, timezone);
  const targets = [{ month, day }];
  if (month === 2 && day === 28 && !isLeapYear(year)) {
    targets.push({ month: 2, day: 29 });
  }
  return targets;
}

// True when `dob` (Date|string|null) is a real birthday matching today in
// `timezone`. Excludes null and the Jan-1 placeholder. Month/day are read via UTC
// components, so callers must build the Date from UTC parts (Date.UTC(...)) to
// stay timezone-agnostic.
export function isEligibleBirthday(dob, now, timezone) {
  if (!dob) return false;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return false;
  const bMonth = d.getUTCMonth() + 1;
  const bDay = d.getUTCDate();
  if (bMonth === 1 && bDay === 1) return false; // placeholder DOB
  return birthdayTargets(now, timezone).some((t) => t.month === bMonth && t.day === bDay);
}

// Age reached on the celebrated day: today's local year minus the birth year.
// Correct for both a normal birthday and a Feb-29 birthday celebrated on Feb 28.
export function computeAge(dobYear, now, timezone) {
  return localYmd(now, timezone).year - dobYear;
}
```

2. Create `src/services/birthday/birthdayLogic.test.js`:
```js
import { test, expect } from 'bun:test';
import {
  isLeapYear,
  birthdayTargets,
  isEligibleBirthday,
  computeAge,
  localDateString,
  localTimeString,
} from './birthdayLogic.js';

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const TZ = 'UTC';

test('isLeapYear', () => {
  expect(isLeapYear(2024)).toBe(true);
  expect(isLeapYear(2026)).toBe(false);
  expect(isLeapYear(2000)).toBe(true);
  expect(isLeapYear(1900)).toBe(false);
});

test('null and invalid DOB are ineligible', () => {
  expect(isEligibleBirthday(null, utc(2026, 5, 15), TZ)).toBe(false);
  expect(isEligibleBirthday('not-a-date', utc(2026, 5, 15), TZ)).toBe(false);
});

test('Jan-1 placeholder is excluded even when today is Jan 1', () => {
  expect(isEligibleBirthday(utc(1990, 1, 1), utc(2026, 1, 1), TZ)).toBe(false);
});

test('matching month/day is eligible; non-matching is not', () => {
  expect(isEligibleBirthday(utc(1990, 5, 15), utc(2026, 5, 15), TZ)).toBe(true);
  expect(isEligibleBirthday(utc(1990, 5, 16), utc(2026, 5, 15), TZ)).toBe(false);
});

test('Feb-29 birthday celebrated on Feb 28 in a common year', () => {
  expect(isEligibleBirthday(utc(2000, 2, 29), utc(2026, 2, 28), TZ)).toBe(true);
});

test('Feb-29 birthday NOT celebrated on Feb 28 in a leap year', () => {
  expect(isEligibleBirthday(utc(2000, 2, 29), utc(2028, 2, 28), TZ)).toBe(false);
  expect(isEligibleBirthday(utc(2000, 2, 29), utc(2028, 2, 29), TZ)).toBe(true);
});

test('birthdayTargets adds Feb-29 only on common-year Feb 28', () => {
  expect(birthdayTargets(utc(2026, 2, 28), TZ)).toEqual([{ month: 2, day: 28 }, { month: 2, day: 29 }]);
  expect(birthdayTargets(utc(2028, 2, 28), TZ)).toEqual([{ month: 2, day: 28 }]);
  expect(birthdayTargets(utc(2026, 5, 15), TZ)).toEqual([{ month: 5, day: 15 }]);
});

test('computeAge = local year minus birth year', () => {
  expect(computeAge(1990, utc(2026, 5, 15), TZ)).toBe(36);
  expect(computeAge(2000, utc(2026, 2, 28), TZ)).toBe(26);
});

test('localDateString / localTimeString', () => {
  expect(localDateString(new Date('2026-07-05T09:30:00Z'), 'UTC')).toBe('2026-07-05');
  expect(localTimeString(new Date('2026-07-05T09:30:00Z'), 'UTC')).toBe('09:30');
});
```

3. Create `src/services/birthday/birthdayService.js`:
```js
import { query } from '../../database/connection.js';
import { isConfigured } from '../whitelistService.js';
import logger from '../../logger.js';

const log = logger.child({ module: 'birthdayService' });

// Re-export so the scheduler can guard on the optional `website` pool (same guard
// the SL grant cron uses — getPool('website') throws when the pool is unconfigured).
export { isConfigured };

// Read the singleton BirthdayConfig row from the webpage DB (royal_battalion) via
// the optional `website` pool. Returns null when unset/unavailable.
export async function getBirthdayConfig() {
  try {
    const rows = await query(
      `SELECT enabled, channelId, postTime, timezone FROM BirthdayConfig WHERE id = 'singleton' LIMIT 1`,
      [],
      'website',
    );
    const r = rows?.[0];
    if (!r) return null;
    return {
      enabled: !!r.enabled,
      channelId: r.channelId ?? null,
      postTime: r.postTime || '09:00',
      timezone: r.timezone || 'Europe/Oslo',
    };
  } catch (err) {
    log.warn({ err }, 'Failed to read BirthdayConfig');
    return null;
  }
}

// Distinct active member-role holders whose birthday matches one of `targets`
// today. `targets` is an array of { month, day } (birthdayLogic.birthdayTargets).
// YEAR/MONTH/DAY are extracted in SQL so matching is timezone-agnostic w.r.t. how
// the driver reconstructs the DATETIME.
export async function getEligibleBirthdayMembers(targets) {
  if (!Array.isArray(targets) || targets.length === 0) return [];
  const targetClause = targets
    .map(() => '(MONTH(u.dateOfBirth) = ? AND DAY(u.dateOfBirth) = ?)')
    .join(' OR ');
  const params = targets.flatMap((t) => [t.month, t.day]);
  try {
    return await query(
      `SELECT DISTINCT u.id AS id, u.discordId AS discordId,
              YEAR(u.dateOfBirth) AS dobYear, MONTH(u.dateOfBirth) AS dobMonth, DAY(u.dateOfBirth) AS dobDay,
              u.avatarUrl AS avatarUrl, u.displayName AS displayName, u.discordName AS discordName,
              u.birthdayShowAge AS birthdayShowAge
       FROM User u
       JOIN UserRole ur ON ur.userId = u.id
       JOIN DiscordRole r ON r.id = ur.roleId AND r.isMemberRole = 1
       WHERE u.disabled = 0
         AND u.birthdayOptOut = 0
         AND u.dateOfBirth IS NOT NULL
         AND NOT (MONTH(u.dateOfBirth) = 1 AND DAY(u.dateOfBirth) = 1)
         AND (${targetClause})`,
      params,
      'website',
    );
  } catch (err) {
    log.error({ err }, 'Eligibility query failed');
    return [];
  }
}

// Discord ids already posted for `postDate` (secretary DB). Returns null on a read
// error so the caller skips the tick rather than risk a double-post.
export async function loadPostedToday(postDate) {
  try {
    const rows = await query(`SELECT user_id FROM birthday_post_log WHERE post_date = ?`, [postDate]);
    return new Set(rows.map((r) => String(r.user_id)));
  } catch (err) {
    log.error({ err, postDate }, 'Failed to load birthday_post_log');
    return null;
  }
}

// Idempotency insert; INSERT IGNORE tolerates a concurrent/duplicate insert.
export async function recordPosted(discordId, postDate) {
  await query(`INSERT IGNORE INTO birthday_post_log (user_id, post_date) VALUES (?, ?)`, [
    String(discordId),
    postDate,
  ]);
}
```

**Verify**
- `cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun test` — the new `birthdayLogic.test.js` passes and the existing suite stays green.
- `cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun build src/index.js --target bun --outdir ./.buildcheck` succeeds (import graph is not yet wired to these files, so this only proves syntax; the full wiring is verified in Task 11). Delete `./.buildcheck`.

**Commit**
```
feat(bot): add birthday date logic (with unit tests) and data service
```

---

## Task 10 — Bot: gold embed builder

**Files**
- Create `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/src/services/birthday/birthdayEmbeds.js`.

**Interfaces**
- Consumes: `createEmbed` (`../../utils/embed.js`).
- Produces: `buildBirthdayEmbed({ displayName, avatarUrl, showAge, age }) → EmbedBuilder` — gold `0xFFD700`, avatar thumbnail, celebratory text-only copy, age line only when `showAge` and `age` is finite.

**Steps**

1. Create `src/services/birthday/birthdayEmbeds.js`:
```js
import { createEmbed } from '../../utils/embed.js';

const GOLD = 0xffd700;

// Gold birthday embed. `age` is included only when showAge is true. Text-only copy
// (no emojis) per the project style rule; createEmbed() adds the footer + timestamp.
export function buildBirthdayEmbed({ displayName, avatarUrl, showAge, age }) {
  const name = displayName || 'Royal Battalion member';
  const embed = createEmbed('Birthday').setColor(GOLD).setTitle(`Happy Birthday, ${name}!`);

  const lines = [`The Royal Battalion wishes ${name} a fantastic birthday.`];
  if (showAge && Number.isFinite(age)) {
    lines.push(`Celebrating ${age} years today.`);
  }
  lines.push('Drop a message and help us celebrate.');
  embed.setDescription(lines.join('\n'));

  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}
```

**Verify**
- `cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun build src/index.js --target bun --outdir ./.buildcheck` succeeds. Delete `./.buildcheck`.
- (Optional) `bun -e "const {buildBirthdayEmbed}=await import('./src/services/birthday/birthdayEmbeds.js'); console.log(JSON.stringify(buildBirthdayEmbed({displayName:'Ada',avatarUrl:null,showAge:true,age:30}).toJSON()))"` prints an embed with `"color":16766720` (0xFFD700), the title, and the age line.

**Commit**
```
feat(bot): add gold birthday embed builder
```

---

## Task 11 — Bot: `birthdayScheduler` + register in `ready.js`

**Files**
- Create `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/src/services/birthday/birthdayScheduler.js`.
- Modify `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/src/events/ready.js` — import + `safeInit` registration.

**Interfaces**
- Consumes: `createScheduler` (`../../utils/scheduler.js`); `config` (`../../config.js`) for `config.prospects.memberRoleId` and `config.seeding.schedulerCheckMs`; `getBirthdayConfig`, `getEligibleBirthdayMembers`, `loadPostedToday`, `recordPosted`, `isConfigured` (`./birthdayService.js`); `buildBirthdayEmbed` (`./birthdayEmbeds.js`); `birthdayTargets`, `isEligibleBirthday`, `computeAge`, `localDateString`, `localTimeString` (`./birthdayLogic.js`); `reportError` (`../admin/errorAlertService.js`).
- Produces: `startScheduler(client)`, `stopScheduler()`, `isSchedulerActive()`. Ticks every ~60s; posts one gold embed per eligible member with `content = "<@id> <@&memberRoleId>"` and `allowedMentions { users:[id], roles:[memberRoleId] }`; records idempotency after each successful send.

**Steps**

1. Create `src/services/birthday/birthdayScheduler.js`:
```js
import { createScheduler } from '../../utils/scheduler.js';
import config from '../../config.js';
import logger from '../../logger.js';
import { reportError } from '../admin/errorAlertService.js';
import {
  getBirthdayConfig,
  getEligibleBirthdayMembers,
  loadPostedToday,
  recordPosted,
  isConfigured,
} from './birthdayService.js';
import { buildBirthdayEmbed } from './birthdayEmbeds.js';
import {
  birthdayTargets,
  isEligibleBirthday,
  computeAge,
  localDateString,
  localTimeString,
} from './birthdayLogic.js';

const log = logger.child({ module: 'birthdayScheduler' });

// Reuse the shared ~60s cadence knob (settings.{env}.js seeding.schedulerCheckMs).
const CHECK_MS = config.seeding?.schedulerCheckMs || 60000;

const scheduler = createScheduler({
  name: 'birthdayDailyCheck',
  intervalMs: CHECK_MS,
  tick: checkBirthdays,
});

export function isSchedulerActive() {
  return scheduler.isActive();
}

export function startScheduler(client) {
  log.info('Starting birthday scheduler');
  scheduler.start(client);
}

export function stopScheduler() {
  scheduler.stop();
}

async function checkBirthdays(client) {
  // The webpage `website` pool is optional; if it's not wired in this environment,
  // config + eligibility both live there, so the feature is inert. Guard silently.
  if (!isConfigured()) return;

  const cfg = await getBirthdayConfig();
  if (!cfg || !cfg.enabled || !cfg.channelId) return;

  const tz = cfg.timezone || 'Europe/Oslo';
  const now = new Date();
  const postTime = cfg.postTime || '09:00';
  if (localTimeString(now, tz) < postTime) return; // not yet time today (tz-correct)

  const postDate = localDateString(now, tz);

  // Who already got a post today. On a read error, skip this tick (avoid double-post).
  const posted = await loadPostedToday(postDate);
  if (posted === null) return;

  const targets = birthdayTargets(now, tz);
  const members = await getEligibleBirthdayMembers(targets);
  const remaining = members.filter((m) => !posted.has(String(m.discordId)));
  if (remaining.length === 0) return;

  // Resolve the guild from the configured channel (one fetch yields both).
  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel || !channel.guild) {
    log.warn({ channelId: cfg.channelId }, 'Birthday channel not found or not in a guild');
    return;
  }
  const guild = channel.guild;
  const memberRoleId = config.prospects?.memberRoleId;

  for (const row of remaining) {
    try {
      // Belt-and-suspenders: re-check the tested predicate against the SQL-provided
      // Y/M/D so the authoritative logic (and its unit tests) gate every post.
      const dob = new Date(Date.UTC(row.dobYear, row.dobMonth - 1, row.dobDay));
      if (!isEligibleBirthday(dob, now, tz)) continue;

      // Skip members who have left the guild — no dead ping. Not logged, so a
      // same-day rejoin can still be celebrated.
      const guildMember = await guild.members.fetch(String(row.discordId)).catch(() => null);
      if (!guildMember) continue;

      const showAge = !!row.birthdayShowAge;
      const age = showAge ? computeAge(row.dobYear, now, tz) : null;
      const avatarUrl = guildMember.displayAvatarURL({ size: 256 }) || row.avatarUrl || null;
      const displayName = guildMember.displayName || row.displayName || row.discordName;

      const embed = buildBirthdayEmbed({ displayName, avatarUrl, showAge, age });

      const mentions = [`<@${row.discordId}>`];
      const allowedRoles = [];
      if (memberRoleId) {
        mentions.push(`<@&${memberRoleId}>`);
        allowedRoles.push(String(memberRoleId));
      }

      await channel.send({
        content: mentions.join(' '),
        embeds: [embed],
        allowedMentions: { users: [String(row.discordId)], roles: allowedRoles },
      });

      // Record only after a successful send: safe against double-posts AND a
      // mid-batch restart (a crash after N sends resumes with the remaining members).
      await recordPosted(String(row.discordId), postDate);
      log.info({ discordId: row.discordId, postDate }, 'Posted birthday announcement');
    } catch (err) {
      // Send/DB failures are logged, not thrown — the batch continues (existing convention).
      log.error({ err, discordId: row.discordId }, 'Failed to post birthday announcement');
      reportError(err, { source: 'scheduler:birthday:post' }).catch(() => {});
    }
  }
}
```

2. Register in `src/events/ready.js`. Add the import next to `startSeedingScheduler` (after line 9):
```js
import { startScheduler as startSeedingScheduler } from '../services/seeding/seedingScheduler.js';
import { startScheduler as startBirthdayScheduler } from '../services/birthday/birthdayScheduler.js';
```
Add the `safeInit` line right after the `seedingScheduler` one (after line 49):
```js
    await safeInit('seedingScheduler', () => startSeedingScheduler(client));
    await safeInit('birthdayScheduler', () => startBirthdayScheduler(client));
```

**Verify**
- `cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun build src/index.js --target bun --outdir ./.buildcheck` succeeds — now that `ready.js` imports the scheduler, this bundles the full graph (logic, service, embeds, scheduler) and fails on any missing export / bad import. Delete `./.buildcheck`.
- `cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun test` stays green.
- Manual (staging bot with the `website` pool configured): set `BirthdayConfig` via the dashboard `enabled=true`, `channelId` = a test channel, `postTime` = one minute ahead in `timezone`; set a test member's `dateOfBirth` (via the members admin page) to today's month/day and ensure they hold a member role. Within ~1 tick after `postTime`, exactly one gold embed posts, pinging the member + member role; `SELECT * FROM birthday_post_log WHERE post_date = CURDATE();` has a row; a second tick posts nothing more.

**Commit**
```
feat(bot): add birthday announcer scheduler and register at ready
```

---

## Task 12 — Integration, version bumps, and rollout

**Files**
- Modify `C:/Users/OleEd/Azure/RoyalBattalionWebpage/package.json` — `version` `2.3.0` → `2.4.0`.
- Modify `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/package.json` — `version` `2.29.1` → `2.30.0`.

**Interfaces**
- Consumes: everything from Tasks 1–11.
- Produces: version bumps + an ordered deploy that guarantees the webpage schema/columns exist before the bot reads them.

**Steps**

1. Bump the webpage version. In `C:/Users/OleEd/Azure/RoyalBattalionWebpage/package.json`:
```json
  "version": "2.4.0",
```

2. Bump the bot version. In `C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot/package.json`:
```json
  "version": "2.30.0",
```

3. Final builds before any deploy:
```
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage && bun run build
cd C:/Users/OleEd/Azure/RoyalSecretaryDiscordBot && bun test
```

4. **Rollout order (schema first):**
   1. **Webpage first.** Merge the webpage changes to the `production` branch (Railway auto-deploys staging+prod). Ensure the schema is applied to the target DB(s) — run `bun run db:push` against `royal_battalion` (and staging equivalent) so `BirthdayConfig` + the two `User` columns exist. Confirm `SHOW COLUMNS FROM BirthdayConfig;` and `SHOW COLUMNS FROM User LIKE 'birthday%';`.
   2. **Bot next.** Push `main` → deploys staging; verify on staging (see checklist), then merge `main → production` for prod. No slash-command re-registration is needed (no new command).

5. **Deploy checklist (bot, per environment):**
   - Confirm the optional `website` pool is configured: the container has `WEBSITE_DB_NAME` set, and the boot log line (`[boot] bot environment`) shows a non-null `websiteDb`. If the `website` pool is absent, the announcer is silently inert (`isConfigured()` guard) — set `WEBSITE_DB_NAME` and redeploy.
   - Confirm `birthday_post_log` was created by `initSchema` on boot (`SHOW TABLES LIKE 'birthday_post_log';`).
   - Confirm `config.prospects.memberRoleId` and the chosen channel id are correct for the environment (prod member role `528574587747958794`, royal lounge `460898033794809856`).
   - Enable via the dashboard admin card (Task 6): set `enabled`, `channelId`, `postTime`, `timezone`. Do a live smoke test with a near-future `postTime` and a member whose DOB is today, then reset `postTime` to `09:00`.

**Verify**
- Both build/test commands in step 3 pass with the bumped versions.
- Post-deploy: dashboard card loads/saves in prod; a real birthday (or the smoke test) produces exactly one embed and one `birthday_post_log` row; opted-out members and Jan-1/null DOBs never post; a member who left the guild is skipped.

**Commit** (two commits, one per repo)
```
chore(release): bump webpage to 2.4.0 for birthday announcements
```
```
chore(release): bump bot to 2.30.0 for birthday announcer
```

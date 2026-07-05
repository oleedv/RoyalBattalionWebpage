# Birthday Announcements — Design Spec

**Date:** 2026-07-05
**Status:** Approved design, pre-implementation
**Repos touched:** `RoyalBattalionWebpage` (data model, dashboard, config, self-service) + `RoyalSecretaryDiscordBot` (scheduler, embed, tagging)

## 1. Overview

When a member's birthday is complete (a real date, not the Jan 1 placeholder) and the feature is enabled from the dashboard, the Discord bot posts a celebratory embed in the royal lounge once per day, tagging the birthday member and the member role. Members control their own privacy (opt out of the shout-out, opt in to showing their age). Admins control the global on/off, target channel, and post time from the dashboard.

## 2. Goals / Non-goals

### Goals
- Daily, timezone-correct birthday shout-outs for eligible members.
- Dashboard-controlled enable/disable + channel + post time (no code deploy to reconfigure).
- Per-member self-service privacy: opt-out of announcements, opt-in to show age.
- Reuse existing conventions (config-in-DB bridge, self-service endpoint pattern, scheduler pattern, embed helper, mention/allowedMentions convention).

### Non-goals (YAGNI)
- Self-service editing of the birthday *date* itself (stays admin-set via the existing ticket-to-fix flow).
- Combined multi-member embeds (we post one per member).
- DM birthday wishes.
- Historical backfill / "missed birthday" catch-up.

## 3. Decisions (locked)

| Branch | Decision |
|---|---|
| Birthday data source | Live from `royal_battalion.User.dateOfBirth` via the bot's optional `website` pool |
| "Member" definition | `User` holding a Discord role where `DiscordRole.isMemberRole = true` (the real registry — **not** the whitelist, which is per-server access control) |
| Global config store | New singleton table in the **webpage DB** (`royal_battalion`), written via Prisma, read by the bot via the `website` pool |
| Eligibility | `dateOfBirth` not null, **not** Jan 1, `disabled = false`, not opted out, month/day = today |
| Whose birthday counts | Active member-role holders, still present in the guild at post time |
| Tag | `<@member> <@&MemberRole>` — real ping to the birthday member **and** the member role |
| Multiple birthdays same day | One embed **per member** |
| Feb 29 | Celebrated on **Feb 28** in common (non-leap) years |
| Schedule | Daily at **09:00 Europe/Oslo** (both time and timezone configurable) |
| Opt-out | Per-member **self-service** opt-out |
| Age display | Per-member **self-service opt-in** to show age (default: hidden) |
| Admin config UI | Card on the **main `/dashboard` page**, admin-gated |
| Embed style | Gold accent (`0xFFD700`) + member avatar thumbnail + celebratory copy |
| Admin permission gate | `manage:discord-bot` (consistent with existing bot toggles) |
| Idempotency store | New small table in the bot's `Royal_secretary` DB, keyed `(user_id, post_date)` |

## 4. Data model changes (webpage DB, `royal_battalion`)

Prisma schema (`prisma/schema.prisma`):

- **New singleton model `BirthdayConfig`:**
  - `id String @id @default("singleton")` (or the existing singleton convention used in the codebase — a single row)
  - `enabled Boolean @default(false)`
  - `channelId String?`
  - `postTime String @default("09:00")` — `HH:MM`, 24h
  - `timezone String @default("Europe/Oslo")`
- **Two new columns on `User`:**
  - `birthdayOptOut Boolean @default(false)`
  - `birthdayShowAge Boolean @default(false)`

`User.dateOfBirth` is unchanged and remains admin-set.

## 5. Dashboard UI (webpage)

### 5a. Admin config card — main `/dashboard`
A "Birthday announcements" card rendered only for admins (conditional render behind `manage:discord-bot`, matching how other admin-only cards on the dashboard gate on permissions):
- Enable toggle
- Channel picker/input (defaults to the royal-lounge channel ID `460898033794809856` as the suggested value)
- Post time (`HH:MM`)
- Timezone (default `Europe/Oslo`)

Persisted via a **new admin-gated API route** `GET`/`PATCH /discord-bot/birthday`, following the seeding-config route pattern (`api/src/routes/discord-bot/seeding.ts`, which uses `requirePermission('manage:discord-bot')`). Uses Prisma (not raw SQL) since it writes the webpage's own DB.

### 5b. Member self-service — dashboard profile card
Two toggles added to the profile card every logged-in member already sees (next to the existing read-only DOB display, `dashboard/page.tsx:405-416`):
- "Don't announce my birthday" → `birthdayOptOut`
- "Show my age in the announcement" → `birthdayShowAge`

Persisted via a **new self-service endpoint** `PATCH /me/birthday-prefs` that updates **only the caller's own `User` row** (keyed by session user id), mirroring the existing self-service pattern of `POST /link-steam` (`api/src/routes/users.ts:41-66`, no admin permission required, validates the caller owns the record). It updates only `birthdayOptOut` and `birthdayShowAge` — no other fields.

## 6. Bot behavior (`RoyalSecretaryDiscordBot`)

### 6a. Scheduler
- New `src/.../birthdayScheduler.js`, registered at startup in `events/ready.js` via `safeInit`, ticking on the existing ~60s scheduler (`utils/scheduler.js`), mirroring `seedingScheduler.js`.
- Each tick:
  1. If the `website` pool is not configured → return (guard, like `sl-reward/grantCron.js:51`).
  2. Read `BirthdayConfig` (fresh, no cache). If `!enabled || !channelId` → return.
  3. Compute "now" in `BirthdayConfig.timezone` (native `Intl.DateTimeFormat`, as seeding does). If local time hasn't reached `postTime`, or today's date already fully processed → return.
  4. Run the batch (6b–6d).

### 6b. Eligibility query (webpage DB via `website` pool)
Select distinct members where:
- joined `User → UserRole → DiscordRole` with `DiscordRole.isMemberRole = 1`
- `User.disabled = 0`
- `User.birthdayOptOut = 0`
- `User.dateOfBirth IS NOT NULL`
- `NOT (MONTH(dateOfBirth) = 1 AND DAY(dateOfBirth) = 1)`
- `(MONTH(dateOfBirth), DAY(dateOfBirth))` matches today's month/day in the configured timezone
- **Feb-29 rule:** when today is Feb 28 in a common (non-leap) year, also include `(MONTH=2, DAY=29)` birthdays.
- `DISTINCT`/`GROUP BY` on user id (a member may hold more than one member role).

Selected fields: `id, discordId, dateOfBirth, avatarUrl, displayName, discordName, birthdayShowAge`.

### 6c. Per-member post
For each eligible member:
1. Resolve the guild member by `discordId`; if they've left the guild, skip (no dead ping).
2. Build a gold embed via `createEmbed()` (`utils/embed.js`, keeps footer + timestamp): celebratory title, member avatar as thumbnail, celebratory description. Include age (computed from `dateOfBirth`) **only if `birthdayShowAge`**.
3. `content = "<@" + discordId + "> <@&" + memberRoleId + ">"`, `allowedMentions: { users: [discordId], roles: [memberRoleId] }`. Member role = bot's `config.prospects.memberRoleId` (prod `528574587747958794`).
4. `channel.send(...).catch(err => log.error(...))` — failures logged, not thrown (existing convention).
5. Record `(user_id, post_date)` in the idempotency log (6d).

Note: eligibility uses `isMemberRole` (the webpage registry, possibly multiple roles), while the mass-ping targets the single configured `memberRoleId` (existing ping convention). Accepted asymmetry.

### 6d. Idempotency
- New small table in `Royal_secretary`, e.g. `birthday_post_log (user_id VARCHAR, post_date DATE, PRIMARY KEY (user_id, post_date))`, created via the bot's `initSchema` (schema self-applies on boot).
- At batch start, load the set of `user_id` already logged for today's `post_date`.
- Post only for eligible members **not** already logged; insert the log row as each send succeeds.
- This is safe against both double-posts and mid-batch restarts (a crash after N sends resumes with the remaining members, never re-posts the first N).

## 7. Config bridge & risk

- **Bridge:** dashboard writes config to the webpage DB via Prisma (native path); the bot reads it via the `website` pool it already uses for birthday data. One DB, one pool, no sync job; changes take effect within one scheduler tick (~60s).
- **⚠️ Risk:** the bot's `website` pool is *optional* (`connection.js` `OPTIONAL_POOLS`) and may be unconfigured in a given environment — the SL grant cron guards on exactly this (`grantCron.js:51`). If the pool isn't wired where birthdays should run, the feature is silently inert. The scheduler guards gracefully; **deploy checklist must confirm the `website` pool is configured** in the target environment(s).

## 8. Edge cases

- Feb 29 → celebrated Feb 28 in common years.
- Member left the guild → skipped (resolve-by-discordId miss).
- Opted-out members → excluded at the query level.
- Jan 1 and null birthdays → excluded (placeholder / incomplete).
- Multiple member roles per user → deduped.
- Timezone-correct day rollover via configured `timezone`.
- Send failures → logged, not thrown; batch continues.
- No channel set / feature disabled → scheduler no-ops.

## 9. Deployment & versioning

- **Webpage:** schema applied via `bunx prisma db push` (no migrations folder) for `BirthdayConfig` + the two `User` columns; new API routes; dashboard UI. Bump the **root** `package.json` `version` (the canonical webpage version, currently `2.3.0` → `2.4.0` minor; sub-package versions under `packages/*` are left untouched). Railway auto-deploys from the `production` branch.
- **Bot:** new scheduler + `birthday_post_log` schema (self-applies via `initSchema`); reads new webpage table/columns via `website` pool. Bump root `package.json` `version` (currently `2.29.1` → `2.30.0` minor). Deploy per branch mapping (push `main` = staging, merge `main → production` = prod). No new slash command, so no command re-registration needed.
- **Order:** ship the webpage migration first (so the table/columns exist) before the bot starts reading them, to avoid read errors during rollout.

## 10. Open items to confirm at implementation time

- Confirm the `website` pool is configured in staging and prod bot environments (else feature is inert).
- Confirm the exact singleton-id convention to reuse for `BirthdayConfig` (match any existing singleton pattern in the webpage schema).
- Confirm the dashboard profile card's data-loading path exposes (or can expose) the caller's `birthdayOptOut` / `birthdayShowAge` for initial toggle state.
- Confirm `manage:discord-bot` is the intended admin gate (vs `manage:members`).

## 11. Out of scope

Self-service birthday-date editing; combined multi-birthday embeds; DM wishes; historical backfill; per-server birthday variation (birthdays are per-person/global).

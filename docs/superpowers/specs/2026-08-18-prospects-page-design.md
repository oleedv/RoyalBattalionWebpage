# Prospects Page: Segregate from Tickets, Live Settings, Cooldowns

Date: 2026-08-18
Status: Approved (design)
Scope:

- `RoyalBattalionWebpage` — `packages/web`, `packages/api`, `packages/shared`
- `RoyalSecretaryDiscordBot` — secretary-DB schema, apply/deny/vote-start/vote-end config reads

## Problem

Prospect applications share the staff Tickets page as a second tab. Mentor grouping lives on the Discord Bot page. Hours, vote thresholds, and prospect length live in `settings.*.js` and cannot be changed without a deploy. Denied applicants are not actually blocked from re-applying; staff have no list or override for a re-apply ban.

## Decisions (confirmed)

- Live settings, Seeding-style: persist in the secretary DB; the bot reads the row on the next apply / vote-start / vote-end check. File values are first-insert defaults only.
- Two clocks: `periodDays` (prospect length) and `cooldownDays` (default deny re-apply ban). Independent. Defaults both 28.
- Three routes under one sidebar item, with a Tickets-style **top tab bar** (not a second sidebar).
- Remove the entire Discord Bot **Prospects** tab. Overview may keep prospect counts.
- Tickets page becomes support tickets only.
- Clean-break RBAC. Three permissions. No auto-grant from ticket or Discord Bot roles. `developer` still bypasses.
- Existing denied applicants are **not** backfilled onto cooldown. Only new denies and staff-created rows.
- Changing `cooldownDays` does not rewrite existing cooldown rows.
- Changing a setting does not rewrite a vote already posted; it applies on the next check.
- `voteDaysBefore` stays in file config. Not a website setting.

## Pages and navigation

One Operations sidebar item: **Prospects** → `/prospects`. Icon: reuse a distinct icon from Tickets (not `Ticket`; use `UserPlus` or equivalent already available in `lucide-react`).

Every prospect route shares the same header + tab strip used on Tickets today (flex buttons in a bordered bar). Tabs are `<Link>`s so each is a real route:

| Tab            | Route                   | Visible when                                      |
|----------------|-------------------------|---------------------------------------------------|
| Applications   | `/prospects`            | `view:prospects` or `manage:prospects`            |
| Mentors        | `/prospects/mentors`    | `view:prospects` or `manage:prospects`            |
| Settings       | `/prospects/settings`   | any of the three prospect permissions             |

Opening a hidden tab URL returns the same in-page “Insufficient permissions.” pattern other protected pages use. Middleware treats `/prospects` as a protected path (same cookie check as `/tickets`).

Dashboard “Pending Prospects” card currently links to `/tickets`. It must link to `/prospects`.

### `/prospects` — Applications

Move the Tickets “Prospect Applications” list here unchanged in behavior: search, status filter, page size, pagination, expand-to-detail (fields, votes, timeline, messages, denial banner), download, open `/prospect/[uuid]` in a new tab.

Public `/prospect/[uuid]` is unchanged and stays unauthenticated.

### `/prospects/mentors` — Mentors

Move the Discord Bot mentor view here unchanged in behavior: open prospects grouped by mentor, Unclaimed first, pause / unpause, extend days, reassign, open public detail.

Mentor mutations require `manage:prospects` (not `manage:discord-bot`).

### `/prospects/settings` — Settings + cooldowns

Top: settings card. Bottom: active cooldown list.

`view:prospects` and `view:prospect-settings` see both sections read-only. `manage:prospects` can save settings and add / edit / remove cooldowns.

## Settings

Singleton `prospect_config` (`id = 1`) in the secretary DB.

| Field               | UI label                 | Default | Validation                                      |
|---------------------|--------------------------|---------|-------------------------------------------------|
| `vote_start_hours`  | Hours to start vote      | 6       | integer `>= 0`, `<= vote_accept_hours`          |
| `vote_accept_hours` | Hours to accept          | 16      | integer `>= 0`                                  |
| `period_days`       | Prospect length (days)   | 28      | integer `>= 1`                                  |
| `cooldown_days`     | Deny cooldown (days)     | 28      | integer `>= 1`                                  |
| `min_yes_votes`     | Minimum yes votes        | 10      | integer `>= 1`                                  |
| `min_yes_rate`      | Yes share                | 0.80    | stored as 0–1; UI is 1–100 percent              |

Failed PATCH leaves the previous row and shows the error. Missing row: GET returns the defaults above; bot uses the same defaults so a restart never blocks apply.

### Tooltips

Every setting control has an info tooltip (hover, focus, tap; same interaction model as dashboard `InfoTip`). Exact copy:

- **Hours to start vote** — “Minimum in-game hours on our server before the bot will post a membership vote. Staff can still force a vote from the ticket.”
- **Hours to accept** — “Minimum in-game hours required to be accepted when the vote ends. The vote can start earlier; they cannot pass without this many hours.”
- **Prospect length (days)** — “How long a prospect period lasts, from start to automatic vote end. Independent of the deny cooldown.”
- **Deny cooldown (days)** — “How long a newly denied applicant must wait before applying again. Does not change cooldowns already on the list.”
- **Minimum yes votes** — “The vote needs at least this many Yes ballots. Unsure does not count.”
- **Yes share** — “Of Yes + No ballots, at least this percent must be Yes. Unsure does not count.”

### Vote rule UI

Two knobs, because the bot already checks both:

1. Minimum yes votes (integer stepper)
2. Yes share (percent input or slider, 1–100)

Under the knobs, a live verdict line using the current numbers. At defaults (10 yes, 80%) the line is exactly:

> A **10–2** vote passes. A **9–1** vote fails (need 10 yes). A **12–4** vote fails (75% < 80%).

A shared helper computes the three pairs from the knobs (Unsure never counts):

- **Pass:** `yes = minYesVotes`, `no = max(0, floor(yes * (1 - rate) / rate))` — largest no that still passes both gates. Defaults: 10–2.
- **Fail by count:** `yes = minYesVotes - 1`, `no = 1`, omitted from the sentence when `minYesVotes === 1`. Defaults: 9–1.
- **Fail by share:** smallest `yes >= minYesVotes` and `no` such that `yes/(yes+no) < rate` and the percent is a clean illustration. Defaults lock to 12–4 (75%). For other knobs: `yes = minYesVotes`, `no = floor(yes * (1 - rate) / rate) + 1`.

Unsure is never part of the ratio. Tooltip already says so.

## Cooldowns

New table `prospect_cooldowns`:

```
id INT PK AI
user_id VARCHAR(20) NOT NULL
expires_at TIMESTAMP NOT NULL
created_by VARCHAR(20) NOT NULL
reason VARCHAR(500) NULL
prospect_id INT NULL
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
INDEX (user_id)
INDEX (expires_at)
```

One **active** row per user (`expires_at > NOW()`). Creating a new cooldown for a user who already has an active row replaces/updates that row (no stacked bans).

List on Settings shows active rows only: display name, Discord id, expires at, remaining time, created by, reason if present.

Staff actions (`manage:prospects`):

- **Add** — Discord user id + days (default `cooldown_days`) + optional reason
- **Edit** — set a new duration in days from now (result shown as the new expiry). Same preset-or-custom pattern as ticket timeouts.
- **Remove** — delete the row (they may apply immediately)

Bot:

- On **deny**, insert/replace a cooldown: `expires_at = NOW() + cooldown_days`, `created_by` = acting staff or bot user, `prospect_id` set, reason optional (deny reason if present).
- On **apply** (`handleApply` and `createProspect`), reject if an active cooldown exists. Message includes the expiry (`<t:unix:R>` in Discord).
- Accept and closed-without-deny do **not** create a cooldown.

Closed-without-deny and accepted users are not listed unless staff add them.

## Bot config reads

Replace `config.prospects.voteStartHours`, `voteAcceptHours`, `periodDays`, `minYesVotes`, `minYesRate` **reads that decide apply/vote/period** with a helper, e.g. `getProspectConfig()`, that:

1. `SELECT`s `prospect_config` where `id = 1`
2. On miss or DB error, returns the defaults in the Settings table
3. Is called at apply, vote-start (scheduler + force vote), vote-end / finalize, and period-end queries (`getProspectsNeedingVote`, `getProspectsNeedingVoteEnd`, `getProspectDates`)

`voteDaysBefore`, channel IDs, role IDs stay in `settings.*.js`.

File keys `voteStartHours`, `voteAcceptHours`, `periodDays` remain as first-insert defaults when the bot creates the singleton (same comment style as `seeding.defaultThreshold`). Add `cooldownDays: 28`, `minYesVotes: 10`, `minYesRate: 0.80` next to them for that first insert. After the row exists, editing the files has no effect.

Deny-reason strings in `evaluateVoteOutcome` must use the live `voteAcceptHours`, not the hardcoded “16-hour” phrase.

## RBAC

Add to `PERMISSIONS` in `packages/shared/types/roles.ts`:

```
view:prospects
view:prospect-settings
manage:prospects
```

Roles page, new **Prospects** group (no tier subgroups):

- View Prospects — Applications, Mentors, and Settings (read-only)
- View Prospect Settings — Settings only (read-only). No application or mentor list.
- Manage Prospects — save settings, cooldown mutations, mentor actions; also opens all three tabs

Nav item requiredPermissions: all three. Settings-only users see the sidebar item. Opening `/prospects` or `/prospects/mentors` without `view:prospects` / `manage:prospects` redirects to `/prospects/settings`.

API:

| Endpoint                         | Permission                                              |
|----------------------------------|---------------------------------------------------------|
| `GET /v1/prospects`              | `view:prospects` or `manage:prospects`                  |
| `GET /v1/prospects/:id`          | `view:prospects` or `manage:prospects`                  |
| `GET /v1/prospects/mentors`      | `view:prospects` or `manage:prospects`                  |
| `PATCH` pause/unpause/extend     | `manage:prospects`                                      |
| `POST` mentor-reassignment       | `manage:prospects`                                      |
| `GET /v1/prospects/config`       | any of the three                                        |
| `PATCH /v1/prospects/config`     | `manage:prospects`                                      |
| `GET /v1/prospects/cooldowns`    | any of the three                                        |
| `POST /v1/prospects/cooldowns`   | `manage:prospects`                                      |
| `PATCH /v1/prospects/cooldowns/:id` | `manage:prospects`                                   |
| `DELETE /v1/prospects/cooldowns/:id` | `manage:prospects`                                  |
| `GET /v1/prospects/by-uuid/:uuid`| unchanged (public)                                      |

Today `GET /` and `GET /:id` use `view:tickets` / `manage:tickets`. `GET /mentors` and mutations use Discord Bot perms. All of those switch to the table above. Ticket-only roles lose prospect API access.

Audit: config PATCH and cooldown create/update/delete write audit log entries (`prospect.update_config`, `prospect.cooldown_create`, `prospect.cooldown_update`, `prospect.cooldown_delete`).

## Tickets and Discord Bot cleanup

- Remove the Support / Prospects tab bar from `/tickets`. Page title stays “Tickets”. Prospect components, prospect state, and prospect fetches leave that file.
- Remove the Prospects tab and `ProspectsTab` import from Discord Bot `page.tsx`. Delete or stop routing to `ProspectsTab.tsx` (file may be deleted once unused).
- Discord Bot Overview prospect counts stay.

## Components and shared types

- Shared tab bar component used by the three prospect routes (active tab from pathname).
- Settings form + tooltip + verdict line as a settings-page section.
- Cooldown list as a settings-page section (TimeoutsTab is the UX reference, not a shared import unless a small extract is cleaner).
- Shared types: `ProspectConfig`, `ProspectCooldown`, extend `Permission`.
- Vote verdict helper lives in shared or api-adjacent pure functions so the UI line and tests share one implementation.

## Error handling

- Config GET never 500s for a missing row; return defaults.
- Config PATCH validation errors are 400 with a field-level message.
- Cooldown add with a bad/empty Discord id is 400.
- Bot apply-on-cooldown is an ephemeral error with expiry; no channel is created.
- Bot deny still succeeds if the cooldown insert fails; log the failure. Staff can add the row on the site.
- Website pages show the existing `text-danger` / toast patterns; no silent save.

## Testing

- Vote verdict helper: defaults produce the 10–2 / 9–1 / 12–4 story; other knob pairs recompute.
- `evaluateVoteOutcome` deny copy uses the configured accept hours.
- Config PATCH rejects start hours > accept hours and yes-share outside 1–100.
- Cooldown: deny creates a row; apply is blocked until expiry; remove allows apply; no backfill of old denies.
- `getProspectConfig` falls back to defaults when the row is missing.
- Roles catalog includes the three perms. Nav does not treat `view:tickets` as Prospects access.
- Settings-only role: GET config/cooldowns 200; GET `/v1/prospects` 403; PATCH config 403.
- Viewer role: GET config 200; PATCH config 403; GET applications 200.

## Out of scope

- Changing `voteDaysBefore`, forum tags, or Discord channel/role IDs from the website
- Backfilling cooldowns for historical denials
- Prospect apply flow on the public website (still Discord)
- Reworking the public `/prospect/[uuid]` page
- Granting the new permissions to existing Discord roles

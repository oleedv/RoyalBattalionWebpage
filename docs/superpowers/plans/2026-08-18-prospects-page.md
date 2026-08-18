# Prospects Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move prospects off Tickets and Discord Bot onto `/prospects` (Applications / Mentors / Settings), with live DB-backed settings, deny cooldowns, and new RBAC.

**Architecture:** Website talks to secretary DB via existing raw-SQL Hono routes. Bot reads the same `prospect_config` / `prospect_cooldowns` tables on apply, vote-start, and vote-end. File `settings.*.js` values are first-insert defaults only.

**Tech Stack:** Next.js (web), Hono + Prisma raw SQL (api), shared TS types, RoyalSecretaryDiscordBot (Bun, MariaDB).

## Global Constraints

- Tickets-style top tab bar; no second sidebar
- Permissions: `view:prospects`, `view:prospect-settings`, `manage:prospects` — clean break, no ticket fallback
- Settings GET returns defaults if the row is missing
- Deny does not fail if cooldown insert fails
- Existing denied users are not backfilled
- `voteDaysBefore` stays in file config
- Conventional commit one-liners, no AI attribution

## File map

**Create (webpage)**
- `packages/shared/types/prospects.ts` — types + vote verdict + config validation
- `packages/shared/types/prospects.test.ts`
- `packages/web/app/(protected)/prospects/layout.tsx`
- `packages/web/app/(protected)/prospects/page.tsx`
- `packages/web/app/(protected)/prospects/mentors/page.tsx`
- `packages/web/app/(protected)/prospects/settings/page.tsx`
- `packages/web/app/(protected)/prospects/components/ProspectTabs.tsx`
- `packages/web/app/(protected)/prospects/components/ApplicationsList.tsx`
- `packages/web/app/(protected)/prospects/components/MentorView.tsx`
- `packages/web/app/(protected)/prospects/components/SettingsCard.tsx`
- `packages/web/app/(protected)/prospects/components/CooldownList.tsx`
- `packages/web/app/(protected)/prospects/components/InfoTip.tsx`

**Modify (webpage)**
- `packages/shared/types/roles.ts`, `packages/shared/index.ts`
- `packages/api/src/routes/prospects.ts`
- `packages/web/lib/api-client.ts`
- `packages/web/components/shell/nav-config.ts`
- `packages/web/middleware.ts`
- `packages/web/app/(protected)/roles/page.tsx`
- `packages/web/app/(protected)/tickets/page.tsx`
- `packages/web/app/(protected)/discord-bot/page.tsx`
- `packages/web/app/(protected)/dashboard/page.tsx`
- delete `packages/web/app/(protected)/discord-bot/components/ProspectsTab.tsx`

**Create (bot)**
- `src/services/prospect/prospectConfig.js`
- `src/services/prospect/__tests__/prospectConfig.test.js`
- `src/services/prospect/prospectCooldowns.js`
- `src/services/prospect/__tests__/prospectCooldowns.test.js`

**Modify (bot)**
- `src/database/schema.js`
- `src/services/prospect/prospectVoteRules.js` + tests
- `src/services/prospect/prospectService.js`
- `src/services/prospect/prospectScheduler.js`
- `src/services/prospect/prospectVoting.js`
- `src/services/prospect/prospectEmbeds.js`
- `src/handlers/prospectButtons.js`
- `settings.development.js`, `settings.staging.js`, `settings.production.js`

---

### Task 1: Shared types, verdict helper, config validation
### Task 2: Bot vote deny-copy uses live hours
### Task 3: Bot schema + getProspectConfig + cooldowns
### Task 4: Bot apply/deny/vote/period reads live config
### Task 5: API permissions + config/cooldown routes
### Task 6: Web nav, middleware, roles
### Task 7: Prospects pages (tabs, applications, mentors, settings)
### Task 8: Tickets + Discord Bot cleanup, dashboard link
### Task 9: Verify tests

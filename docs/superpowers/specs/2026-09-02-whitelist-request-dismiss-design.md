# Whitelist Request Dismiss + Revamp

**Date:** 2026-09-02
**Status:** Approved for implementation (user: plan, implement, and push)

## Problem

The Requests tab on `/whitelist` is a computed list of users who have a Discord role with `grantsWhitelist` and a linked Steam ID, but no whitelist entry on the selected server.

Dismiss is a client-side `Set<string>` in React state. It:

- Resets on page reload
- Is cleared when switching servers
- Is not shared across staff
- Does not affect the sidebar badge (which also always queries `server=main` because the API defaults the missing query param)

That is why dismissing a request "does not go away."

## Goals

1. Dismissing a request hides it for **30 days**, for every staff member, across reloads.
2. After 30 days (or on explicit restore) it reappears if the user is still eligible and still not actively whitelisted.
3. Revamp the request pipeline: correct eligibility, richer candidate payload, restore UI, accurate badge.
4. Add structured logs + audit events so dismiss / restore / list are observable.

## Non-goals

- Ticketing / Discord ticket integration for whitelist requests
- Changing whitelist entry CRUD, SFTP deploy, or groups/clans
- Per-staff (private) dismissals

## Design

### Persistence

New table `WhitelistRequestDismissal`:

- Unique `(userId, server)` — one row per candidate per server
- `dismissedAt`, `expiresAt` (`dismissedAt + 30d`), `dismissedBy`, `dismissedByName`, optional `reason`
- `restoredAt` null means the dismiss is in force (until expiry)

Re-dismissing an expired or restored row resets the clock. Restore sets `restoredAt`.

Dismiss is **global** (all staff) and **per-server** (dismiss on Main does not hide the Battle request).

### Eligibility

A user is a **pending request** on a server when all of:

- not disabled
- has a Steam ID
- has at least one role with `grantsWhitelist`
- does **not** have an **active** whitelist entry on that server
- does **not** have an **active** dismissal on that server

Active whitelist entry: `deactivatedAt IS NULL` AND (`expiresAt IS NULL` OR `expiresAt > now`).

Expired or deactivated entries no longer hide the user from Requests. (Today they do, because the candidate query treats any row as "already whitelisted.")

### API

All under `/v1/whitelist`, `manage:whitelist`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/candidates?server=` | Pending + dismissed + counts |
| GET | `/candidates/summary` | Pending counts per server (nav badge) |
| POST | `/candidates/:userId/dismiss` | Dismiss for 30 days |
| POST | `/candidates/:userId/restore` | Undo dismiss |

`GET /candidates` changes from a bare array to:

```
{ pending, dismissed, meta: { server, pendingCount, dismissedCount, eligibleCount, alreadyWhitelistedCount, truncated } }
```

Only two clients exist (whitelist page, protected layout). Both are updated.

### Observability

- `logger.info("whitelist.candidates", ...)` on list / summary / dismiss / restore with counts, ids, duration_ms
- `logger.warn` when the eligible-user query hits the 1000 cap (`truncated: true`)
- Audit: `whitelist.request.dismiss`, `whitelist.request.restore` with name, steamId, server, expiresAt
- HTTP request log already covers status/duration via `requestLog`

### UI

- Requests tab reads pending from the API (no client-only Set)
- Dismissed section (collapsed) with who dismissed, remaining time, Restore
- Candidate cards show avatar, granting role(s), membership date
- Approve surfaces API errors
- Sidebar badge uses `/candidates/summary` (sum of pending across servers) and refreshes on dismiss/approve/restore

## Testing

Pure partition / TTL / eligibility logic in `packages/shared` with bun tests. Permission-route test extended for the new endpoints. Audit label tests for the new actions.

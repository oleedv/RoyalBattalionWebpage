# Auto-remove whitelist when a member is disabled

**Date:** 2026-06-17
**Status:** Approved design, pending implementation plan

## Problem

On the Members page, an admin can disable a member, but disabling currently has
no effect on that member's whitelist. A disabled member keeps their in-game
whitelist until someone manually removes the `WhitelistEntry`. We want disabling
to immediately pull their whitelist from the game, and re-enabling to restore it.

## Decisions

- **Restore on re-enable (soft):** disable deactivates the member's whitelist
  entries (removed in-game, row kept); enable reactivates them.
- **Hide deactivated entries** from the Whitelist page entries list.
- **Warn in the disable confirmation dialog** (single + bulk) that whitelist
  will be removed.
- Applies to **both** single and bulk disable/enable.

## Data model

Add one nullable field to `WhitelistEntry` (`prisma/schema.prisma`), mirroring
the existing `expiresAt` filtering pattern:

```prisma
deactivatedAt DateTime?   // null = active; non-null = removed in-game but remembered
// ...
@@index([deactivatedAt])
```

Semantics:

- `null` = live whitelist entry.
- non-null = removed from the game, but the row is retained so it can be
  restored on re-enable.
- This field is set **only** by the member disable/enable flow. Therefore every
  deactivated row for a given `userId` was deactivated by member-disable and is
  safe to restore on re-enable.
- The original `expiresAt` is left untouched, so expiry tracking survives a
  disable/enable cycle.

Requires a Prisma migration (new nullable column + index). No backfill needed
(existing rows default to `NULL` = active).

## "Not in the game" filtering

`packages/api/src/lib/cfg-generator.ts` — `generateAdminsCfg(server?)` selects
the rows written into `Admins.cfg`. Add `deactivatedAt: null` to its `where`
alongside the existing expiry filter:

```typescript
where: {
  ...(server ? { server } : {}),
  deactivatedAt: null,
  OR: [
    { expiresAt: null },
    { expiresAt: { gt: new Date() } },
  ],
},
```

Because the public `GET /admins.cfg` route (`packages/api/src/index.ts`), the
SFTP deploy (`packages/api/src/lib/sftp-deploy.ts`), and the admin API all
funnel through `generateAdminsCfg()`, this single change removes deactivated
entries from the game everywhere.

## Disable / enable flows (`packages/api/src/routes/users.ts`)

All four endpoints update whitelist state in the same DB transaction as the user
update, then trigger an SFTP redeploy in the background (the existing
non-awaited `deployInBackground` pattern used by the whitelist routes), and write
an audit log entry.

- **`POST /:id/disable`** and **`POST /bulk-disable`**: after setting the user(s)
  disabled, set `deactivatedAt = now()` on whitelist entries where
  `userId IN (affectedIds) AND deactivatedAt IS NULL`. Redeploy each affected
  server. Audit-log `whitelist.deactivate` with the affected count and a flag
  that it was triggered by member disable.
- **`POST /:id/enable`** and **`POST /bulk-enable`**: after clearing disabled,
  set `deactivatedAt = null` on whitelist entries where
  `userId IN (affectedIds) AND deactivatedAt IS NOT NULL`. Redeploy. Audit-log
  `whitelist.reactivate`.

Existing safety filters (cannot disable self / developer accounts) are unchanged;
whitelist deactivation only applies to the members actually disabled.

## Whitelist page / candidates

- `GET /whitelist` list query: add `deactivatedAt: null` so deactivated rows do
  not appear in the entries list ("hide from list").
- `GET /whitelist/candidates`: add `disabled: false` so a disabled member cannot
  appear as a whitelist candidate.

## UI (`packages/web/app/(protected)/members/page.tsx`)

Add a warning line to the disable confirmation dialog — both single and bulk —
e.g. "This will also remove their in-game whitelist (restored if re-enabled)."
No other UI changes; deactivated entries simply drop out of the whitelist list.

## Edge cases

- A deactivated row still occupies the `[steamId, server]` unique slot.
  Manually re-whitelisting that SteamID while the member is disabled is caught by
  the existing duplicate check / unique constraint — correct behavior (the entry
  exists, just dormant).
- If an admin hard-deletes the entry while the member is disabled, there is
  nothing to restore on re-enable. Acceptable.
- Re-enable restores all of that user's deactivated entries. Since only
  member-disable sets `deactivatedAt`, there are no false restores.

## Testing

- Prisma migration applies cleanly; existing rows read as active.
- Single disable: linked entry disappears from `generateAdminsCfg()` output and
  an SFTP redeploy is fired; entry is hidden from `GET /whitelist`.
- Single enable: entry reappears in `generateAdminsCfg()` output; redeploy fired.
- Bulk disable/enable behave identically across all affected members.
- Deactivated entries excluded from `GET /whitelist`; disabled members excluded
  from `GET /whitelist/candidates`.
- Audit log records `whitelist.deactivate` / `whitelist.reactivate`.

## Out of scope

- No changes to how whitelist is normally added/removed.
- No UI surfacing of deactivated entries (deliberately hidden).
- No semver/version concern here beyond the standing convention to bump the
  webpage `package.json` version before pushing.

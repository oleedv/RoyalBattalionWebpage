# Member EOS ID backfill job — design

**Date:** 2026-06-17
**Status:** Approved

## Problem

The member page in the webpage is backed by the Prisma `User` model. Each user has a
`steamId` (populated) and an `eosId String? @unique` field that is empty for every user.
We want `eosId` filled in automatically from the SquadJS database, matched on Steam ID,
refreshed once a day.

## Source of truth

The SquadJS database table `squadjs_players` holds both identifiers:

- `steam_id`
- `eos_id`

`eos_id` is unique in `squadjs_players` (players are upserted by `eos_id`). `steam_id` is
**not** guaranteed unique, so when a Steam ID appears on more than one row we keep the most
recent row (highest `id`).

The webpage API already has a connection pool to this database via `getSquadJSPool()`
(`packages/api/src/lib/squadjs-db.ts`).

## Scope

**Full sync / overwrite.** The job sets `eosId` for users where it is empty, and also
overwrites an existing `eosId` when SquadJS reports a different `eos_id` for that Steam ID.

Because `eosId` is `@unique`, the job must tolerate the rare case where the `eos_id` it wants
to write is already held by a different user row (stale or swapped data). Updates are done
per-user and a unique-constraint conflict (Prisma `P2002`) is logged and skipped — it must
not fail the run.

## Design

### New file: `packages/api/src/lib/eos-backfill.ts`

```
export async function backfillUserEosIds(): Promise<{ updated: number; conflicts: number }>
```

Logic:

1. `prisma.user.findMany({ where: { steamId: { not: null } }, select: { id, steamId, eosId } })`.
2. Batched lookup against SquadJS:
   `SELECT steam_id, eos_id FROM squadjs_players WHERE steam_id IN (?) AND eos_id IS NOT NULL AND eos_id != '' ORDER BY id ASC`
   (ascending order so a later row for the same `steam_id` overwrites the earlier one when
   building the map, leaving the highest-`id` value). Produce `Map<steamId, eosId>`.
3. For each user where the mapped `eos_id` exists and differs from the current `eosId`,
   call `prisma.user.update`. Wrap each update in `try/catch`; on a `P2002` unique-constraint
   conflict, increment `conflicts` and continue.
4. Return `{ updated, conflicts }`. Log a one-line summary only when `updated > 0 ||
   conflicts > 0`, matching the quiet-on-no-op style of the other bootstrap jobs.

### Registration: `packages/api/src/lib/bootstrap.ts`

Inside the existing `env.SQUADJS_DATABASE_URL` guard (the same guard `syncMatches` uses):

- Run `backfillUserEosIds()` once on startup.
- `setInterval(() => backfillUserEosIds()..., 24 * 60 * 60 * 1000)` — same shape as the
  audit-log cleanup job.

Both calls `.catch` and log errors under a `"eos-backfill"` tag.

## Out of scope (YAGNI)

- No schema change (`eosId` already exists).
- No new environment variable.
- No API route or admin button — the request is a once-a-day background job only.

## Verification

- No test runner exists in the repo; the build path is `bun build`, not `tsc`. The change is
  verified by bundling `bootstrap.ts` (which pulls in `eos-backfill.ts` and the Prisma /
  mysql2 chain) with no errors, plus review against the existing `users.ts` query typing.
- Post-deploy: confirm the startup log line under the `eos-backfill` tag reports an `updated`
  count and that the member page shows EOS IDs.

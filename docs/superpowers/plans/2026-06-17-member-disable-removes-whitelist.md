# Auto-remove whitelist on member disable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disabling a member immediately removes their in-game whitelist; re-enabling restores it.

**Architecture:** Add a nullable `deactivatedAt` to `WhitelistEntry`. The shared `generateAdminsCfg()` (used by `/admins.cfg`, SFTP deploy, and the admin API) excludes rows where `deactivatedAt` is set, so a deactivated entry vanishes from the game everywhere via one filter. The member disable/enable flows (single + bulk) set/clear `deactivatedAt` on the member's linked entries inside the same DB transaction, then fire a background SFTP redeploy. Deactivated rows are hidden from the Whitelist page list, and disabled members are excluded from whitelist candidates.

**Tech Stack:** Bun monorepo, Hono + Prisma 7 (MariaDB adapter) API, Next.js 15 / React 19 web, TypeScript.

## Global Constraints

- **No automated test harness exists in this repo** (no test files, no test script). Established pattern is build/typecheck + manual verification. Each task's gate is `bunx tsc --noEmit` for the touched package(s) plus the manual check described; do not scaffold a test framework (YAGNI).
- **Schema changes use `prisma db push`, not migration files** — there is no `prisma/migrations` directory. Run `bun run db:push` (which also regenerates the client).
- Conventional Commits, one-line messages, no AI attribution / `Co-Authored-By`, no emojis (user global rules).
- Bump the **root** `package.json` `version` before pushing (currently `1.11.0`); this is the webpage deploy version.
- Follow existing code patterns: background deploy via a fire-and-forget helper that `.catch()`-logs (mirrors `deployInBackground` in `whitelist.ts`); audit every state change via `audit(c, action, resource, resourceId, detail)`.
- `deactivatedAt` is set/cleared **only** by the member disable/enable flow. Nothing else may write it, so every deactivated row for a user is safe to restore on enable.

---

### Task 1: Add `deactivatedAt` to the WhitelistEntry schema

**Files:**
- Modify: `prisma/schema.prisma` (WhitelistEntry model, ~lines 90-116)

**Interfaces:**
- Produces: `WhitelistEntry.deactivatedAt: DateTime | null` column on the DB and in the generated Prisma client (consumed by Tasks 2-4).

- [ ] **Step 1: Add the field and index to the model**

In `prisma/schema.prisma`, inside `model WhitelistEntry`, add the field next to `expiresAt`:

```prisma
  expiresAt     DateTime?
  deactivatedAt DateTime?   // set only by member-disable; null = active
```

And add an index alongside the existing `@@index` lines:

```prisma
  @@index([deactivatedAt])
```

- [ ] **Step 2: Push the schema to the dev DB and regenerate the client**

Run (from repo root): `bun run db:push`
Expected: completes with "Your database is now in sync with your Prisma schema." and "Generated Prisma Client" (db push regenerates the client). The new column is nullable, so existing rows default to `NULL` (active) — no data migration needed.

- [ ] **Step 3: Verify the column exists**

Run: `bun run db:studio` (opens Prisma Studio) — confirm `deactivatedAt` appears on WhitelistEntry, or skip if Studio is unavailable and trust the push output.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(whitelist): add deactivatedAt field to WhitelistEntry"
```

---

### Task 2: Exclude deactivated entries from the in-game config

**Files:**
- Modify: `packages/api/src/lib/cfg-generator.ts:8-18`

**Interfaces:**
- Consumes: `WhitelistEntry.deactivatedAt` (Task 1).
- Produces: `generateAdminsCfg()` output no longer contains deactivated entries. This is the single point that removes them from `/admins.cfg`, SFTP deploy, and the admin API.

- [ ] **Step 1: Add `deactivatedAt: null` to the generator query**

In `packages/api/src/lib/cfg-generator.ts`, change the `findMany` `where` from:

```typescript
  const entries = await prisma.whitelistEntry.findMany({
    where: {
      ...(server ? { server } : {}),
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: { group: true },
    orderBy: [{ clan: "asc" }, { createdAt: "asc" }],
  });
```

to:

```typescript
  const entries = await prisma.whitelistEntry.findMany({
    where: {
      ...(server ? { server } : {}),
      deactivatedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: { group: true },
    orderBy: [{ clan: "asc" }, { createdAt: "asc" }],
  });
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/lib/cfg-generator.ts
git commit -m "feat(whitelist): exclude deactivated entries from admins.cfg generation"
```

---

### Task 3: Deactivate/reactivate whitelist on member disable/enable (single + bulk)

**Files:**
- Modify: `packages/api/src/routes/users.ts` (imports near top lines 1-20; `/:id/disable` 416-441; `/:id/enable` 443-455; `/bulk-disable` 464-497; `/bulk-enable` 503-521)

**Interfaces:**
- Consumes: `WhitelistEntry.deactivatedAt` (Task 1); `triggerSftpDeploy(server?: string): Promise<void>` from `../lib/sftp-deploy`; `logger` from `../lib/logger`; existing `audit`, `clearSyncCache`, `prisma`.
- Produces: disable sets `deactivatedAt = now()` on the member's active entries; enable clears it; both redeploy SFTP in the background when ≥1 entry changed, and audit-log `whitelist.deactivate` / `whitelist.reactivate`.

- [ ] **Step 1: Add imports and a background-deploy helper**

In `packages/api/src/routes/users.ts`, add to the import block (after line 20):

```typescript
import { triggerSftpDeploy } from "../lib/sftp-deploy";
import { logger } from "../lib/logger";
```

Then add this helper just below the imports (before the first route), mirroring the one in `whitelist.ts`:

```typescript
function deployInBackground(server?: string) {
  triggerSftpDeploy(server).catch((err) =>
    logger.error("sftp", "Deploy failed", err)
  );
}
```

- [ ] **Step 2: Update single disable (`POST /:id/disable`)**

Replace the `prisma.user.update(...)` call and the lines through the existing `audit(...)`/`return` (currently lines 432-440) with:

```typescript
  const [, wl] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { disabled: true, disabledAt: new Date(), disabledReason: reason },
    }),
    prisma.whitelistEntry.updateMany({
      where: { userId: id, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    }),
  ]);

  clearSyncCache(target.discordId);
  if (wl.count > 0) deployInBackground();

  await audit(c, "member.disable", "user", id, { reason, targetName: target.discordName });
  if (wl.count > 0) {
    await audit(c, "whitelist.deactivate", "WhitelistEntry", id, {
      count: wl.count,
      triggeredBy: "member.disable",
    });
  }
  return success(c, { disabled: true as const });
```

- [ ] **Step 3: Update single enable (`POST /:id/enable`)**

Replace the `prisma.user.update(...)` call and the existing `audit(...)`/`return` (currently lines 448-454) with:

```typescript
  const [, wl] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { disabled: false, disabledAt: null, disabledReason: null },
    }),
    prisma.whitelistEntry.updateMany({
      where: { userId: id, deactivatedAt: { not: null } },
      data: { deactivatedAt: null },
    }),
  ]);

  if (wl.count > 0) deployInBackground();

  await audit(c, "member.enable", "user", id, { targetName: target.discordName });
  if (wl.count > 0) {
    await audit(c, "whitelist.reactivate", "WhitelistEntry", id, {
      count: wl.count,
      triggeredBy: "member.enable",
    });
  }
  return success(c, { enabled: true as const });
```

- [ ] **Step 4: Update bulk disable (`POST /bulk-disable`)**

Replace the existing `const result = await prisma.user.updateMany(...)` block and everything through its `return` (currently lines 482-496) with:

```typescript
  const safeIds = safeTargets.map((t) => t.id);
  const [userResult, wl] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: safeIds } },
      data: { disabled: true, disabledAt: new Date(), disabledReason: reason },
    }),
    prisma.whitelistEntry.updateMany({
      where: { userId: { in: safeIds }, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    }),
  ]);

  for (const t of safeTargets) {
    clearSyncCache(t.discordId);
  }
  if (wl.count > 0) deployInBackground();

  await audit(c, "member.bulk_disable", "user", null, {
    count: userResult.count,
    reason,
    names: safeTargets.map((t) => t.discordName),
  });
  if (wl.count > 0) {
    await audit(c, "whitelist.deactivate", "WhitelistEntry", null, {
      count: wl.count,
      triggeredBy: "member.bulk_disable",
    });
  }
  return success(c, { disabled: userResult.count });
```

(The existing `const safeIds = ...` line at 481 is folded into the block above — remove the old duplicate declaration.)

- [ ] **Step 5: Update bulk enable (`POST /bulk-enable`)**

Replace the existing `const result = await prisma.user.updateMany(...)` block and everything through its `return` (currently lines 511-520) with:

```typescript
  const [userResult, wl] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { disabled: false, disabledAt: null, disabledReason: null },
    }),
    prisma.whitelistEntry.updateMany({
      where: { userId: { in: ids }, deactivatedAt: { not: null } },
      data: { deactivatedAt: null },
    }),
  ]);

  if (wl.count > 0) deployInBackground();

  await audit(c, "member.bulk_enable", "user", null, {
    count: userResult.count,
    names: targets.map((t) => t.discordName),
  });
  if (wl.count > 0) {
    await audit(c, "whitelist.reactivate", "WhitelistEntry", null, {
      count: wl.count,
      triggeredBy: "member.bulk_enable",
    });
  }
  return success(c, { enabled: userResult.count });
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Manual smoke test (requires local dev API + DB)**

Start the API (`bun run dev:api`). Pick a member who has a linked whitelist entry. Disable them via the Members page (or the disable endpoint), then run `bun run db:studio` (or a SQL client) and confirm their `WhitelistEntry.deactivatedAt` is now set. Fetch the local config — `curl http://localhost:3001/admins.cfg` — and confirm that SteamID's `Admin=` line is gone. Re-enable the member and confirm `deactivatedAt` is back to `NULL` and the `Admin=` line returns. (Skip the live SFTP push in dev unless a server is configured; the redeploy is fire-and-forget and logs on failure.)

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/routes/users.ts
git commit -m "feat(members): deactivate whitelist on disable, restore on enable"
```

---

### Task 4: Hide deactivated entries from the list; exclude disabled members from candidates

**Files:**
- Modify: `packages/api/src/routes/whitelist.ts` (`GET /` 142-152; `GET /candidates` 156-189)

**Interfaces:**
- Consumes: `WhitelistEntry.deactivatedAt` (Task 1); `User.disabled` (existing).
- Produces: `GET /whitelist` no longer returns deactivated rows; `GET /whitelist/candidates` no longer returns disabled members.

- [ ] **Step 1: Filter deactivated rows out of the entries list (`GET /`)**

In `packages/api/src/routes/whitelist.ts`, change the list query from:

```typescript
  const entries = await prisma.whitelistEntry.findMany({
    where: server ? { server } : {},
    include: { group: true, clanRef: true },
    orderBy: { createdAt: "desc" },
  });
```

to:

```typescript
  const entries = await prisma.whitelistEntry.findMany({
    where: { ...(server ? { server } : {}), deactivatedAt: null },
    include: { group: true, clanRef: true },
    orderBy: { createdAt: "desc" },
  });
```

- [ ] **Step 2: Exclude disabled members from candidates (`GET /candidates`)**

Change the candidates user query `where` from:

```typescript
  const candidates = await prisma.user.findMany({
    where: {
      steamId: { not: null },
      roles: {
        some: {
          role: { grantsWhitelist: true },
        },
      },
    },
    include: {
      roles: { include: { role: true } },
    },
  });
```

to (add `disabled: false`):

```typescript
  const candidates = await prisma.user.findMany({
    where: {
      disabled: false,
      steamId: { not: null },
      roles: {
        some: {
          role: { grantsWhitelist: true },
        },
      },
    },
    include: {
      roles: { include: { role: true } },
    },
  });
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual check**

With the API running, after disabling a member who had a whitelist entry, fetch `GET /whitelist` (via the Whitelist page or `curl` with a valid token) and confirm the deactivated entry is absent from the list. Confirm a disabled member does not appear under `GET /whitelist/candidates`.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/whitelist.ts
git commit -m "feat(whitelist): hide deactivated entries and skip disabled candidates"
```

---

### Task 5: Warn in the disable confirmation dialogs

**Files:**
- Modify: `packages/web/app/(protected)/members/page.tsx` (single dialog ~line 1365; bulk dialog ~lines 1045-1047)

**Interfaces:**
- Consumes: nothing new — text-only UI change.
- Produces: both disable confirmations state that whitelist is also removed.

- [ ] **Step 1: Add the warning to the single-member disable confirmation**

In `packages/web/app/(protected)/members/page.tsx`, in the `confirmingDisable` block, change:

```tsx
                    <span className="text-xs text-danger">Disable this account?</span>
```

to:

```tsx
                    <span className="text-xs text-danger">Disable this account?</span>
                    <span className="text-[11px] text-text-muted">This also removes their in-game whitelist (restored if re-enabled).</span>
```

- [ ] **Step 2: Add the warning to the bulk disable confirmation**

Change the bulk disable paragraph from:

```tsx
            <p className="mb-4 text-sm text-danger">
              This will disable {selectedIds.size} {selectedIds.size === 1 ? "account" : "accounts"}. Disabled users cannot access the website.
            </p>
```

to:

```tsx
            <p className="mb-4 text-sm text-danger">
              This will disable {selectedIds.size} {selectedIds.size === 1 ? "account" : "accounts"}. Disabled users cannot access the website. This also removes their in-game whitelist (restored if re-enabled).
            </p>
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "packages/web/app/(protected)/members/page.tsx"
git commit -m "feat(members): warn that disabling removes in-game whitelist"
```

---

### Task 6: Version bump and final build

**Files:**
- Modify: `package.json` (root `version`)

**Interfaces:**
- Consumes: nothing.
- Produces: deploy version bumped; both packages build cleanly.

- [ ] **Step 1: Bump the root version (minor — new feature)**

In the root `package.json`, change `"version": "1.11.0"` to `"version": "1.12.0"`.

- [ ] **Step 2: Build both packages**

Run: `bun run build`
Expected: both `web` and `api` build with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.12.0"
```

---

## Self-Review

**Spec coverage:**
- Data model `deactivatedAt` + index → Task 1. ✓
- cfg-generator filter (removes from game everywhere) → Task 2. ✓
- Disable/enable single + bulk set/clear + redeploy + audit (`whitelist.deactivate`/`whitelist.reactivate`) → Task 3. ✓
- Hide deactivated from `GET /whitelist`; exclude disabled from candidates → Task 4. ✓
- Disable dialog warning (single + bulk) → Task 5. ✓
- Version bump convention → Task 6. ✓
- Edge cases (unique-slot duplicate, hard-delete-while-disabled, no false restores) require no code — documented in the spec and guaranteed by "only this flow writes `deactivatedAt`". ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps — every code step shows exact code and exact commands. ✓

**Type/name consistency:** `deactivatedAt` used identically in all queries; `deployInBackground()` defined in Task 3 Step 1 and called in Steps 2-5; `triggerSftpDeploy`/`logger` imports added before use; `userResult`/`wl` destructuring matches `updateMany`'s `{ count }` return. ✓

**Test-harness note:** Repo has no automated tests; gates are `tsc --noEmit` + manual verification, consistent with the existing project. Documented in Global Constraints. ✓

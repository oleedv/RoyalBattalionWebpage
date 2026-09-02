# Whitelist Request Dismiss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist whitelist-request dismissals for 30 days, fix eligibility/badge bugs, and add structured observability.

**Architecture:** Extract candidate partition + TTL into `packages/shared`. Store dismissals in a new Prisma model. Candidates GET returns pending + dismissed + meta. Summary endpoint feeds the nav badge. Audit + pino logs on list/dismiss/restore.

**Tech Stack:** Bun, Hono, Prisma 7 (MariaDB, `db push` on deploy), Next.js 15, shared TS types.

## Global Constraints

- Conventional Commits one-liner, no AI attribution, no emojis
- Follow existing Hono `success`/`fail` envelope and `requirePermission("manage:whitelist")` on every new route
- Schema applied via `prisma db push` (no migrations folder)
- Do not include unrelated dirty files from the production working tree

---

### Task 1: Shared candidate logic + types

**Files:**
- Create: `packages/shared/whitelist-candidates.ts`
- Create: `packages/shared/whitelist-candidates.test.ts`
- Modify: `packages/shared/index.ts`
- Modify: `packages/shared/types/api.ts`

- [ ] **Step 1: Write failing tests** for TTL, active-entry, active-dismissal, and partition (pending vs dismissed vs already-whitelisted).
- [ ] **Step 2: Implement** `WHITELIST_DISMISS_TTL_MS`, `isActiveWhitelistEntry`, `isActiveDismissal`, `dismissExpiresAt`, `partitionCandidatesForServer`, `pendingCountsByServer`, `formatDismissRemaining`.
- [ ] **Step 3: Extend** `WhitelistCandidate` and add list/summary/dismissal types. Export from `index.ts`.
- [ ] **Step 4: Run** `bun test packages/shared/whitelist-candidates.test.ts`

### Task 2: Prisma model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add** `WhitelistRequestDismissal` and `User.whitelistDismissals` relation.
- [ ] **Step 2: Run** `bun run db:generate`

### Task 3: API routes + observability

**Files:**
- Modify: `packages/api/src/routes/whitelist.ts`
- Modify: `packages/api/src/routes/whitelist.permissions.test.ts`

- [ ] **Step 1: Rewrite** `GET /candidates` using shared partition + active-entry filter; log counts.
- [ ] **Step 2: Add** `GET /candidates/summary`, `POST /candidates/:userId/dismiss`, `POST /candidates/:userId/restore` **before** `GET /:id`. Audit + pino on each mutation.
- [ ] **Step 3: Extend** permission test so every new route declares `manage:whitelist`.
- [ ] **Step 4: Run** `bun test packages/api/src/routes/whitelist.permissions.test.ts`

### Task 4: Web client, Requests tab, badge, audit copy, OpenAPI

**Files:**
- Modify: `packages/web/lib/api-client.ts`
- Modify: `packages/web/app/(protected)/whitelist/page.tsx`
- Modify: `packages/web/app/(protected)/layout.tsx`
- Modify: `packages/web/lib/whitelist-audit-detail.ts`
- Modify: `packages/web/lib/whitelist-audit-detail.test.ts`
- Modify: `openapi.yaml`
- Modify: `packages/web/public/openapi.yaml`

- [ ] **Step 1: API client** for list/summary/dismiss/restore.
- [ ] **Step 2: Requests tab** uses server pending/dismissed; restore UI; approve errors; no client Set.
- [ ] **Step 3: Layout badge** uses summary; refreshes on a window event after mutations.
- [ ] **Step 4: Audit labels** for dismiss/restore + tests.
- [ ] **Step 5: OpenAPI** for the new/changed endpoints.

### Task 5: Verify and push

- [ ] Run targeted bun tests
- [ ] Commit only this feature
- [ ] Push `feat/whitelist-request-dismiss`

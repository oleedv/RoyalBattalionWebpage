# Phase 3d — Discord Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate the 495-line read-only `/discord-users` page onto the design system — DataTable-v2 (column sort), shared `CopyableId`/`DescriptionList`+`InfoField`/`StatusBadge`, and a Base UI `Dialog` detail (replacing the legacy `Modal`) — preserving behavior.

**Architecture:** `discord-users/lib.ts` (pure non-member filter) + `discord-user-detail-dialog.tsx` (view + comments) + `discord-users-view.tsx` (the DI-testable list view) + a thin default-only `page.tsx`. This is a simpler sibling of the members page (no edit/disable/bulk).

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, `@tanstack/react-table` via `@/components/data-table-v2`, Base UI Dialog, bun test + happy-dom.

## Global Constraints

- **CRITICAL — `page.tsx` must be DEFAULT-ONLY.** The DI seam (`DiscordUsersView` + `DiscordUsersApi` + `defaultApi`) goes in `discord-users-view.tsx`; `page.tsx` only `export default`s a thin shell that reads `usePermissions()` and renders the view. (An app-router `page.tsx` with a named export FAILS `next build` — silent under tsc/dev/tests. This broke the 3b/3c deploy.)
- **Behavior preserved, feature-by-feature:** the non-member filter (users WITHOUT any `isMemberRole` role, when `memberRoleIds` non-empty; all users otherwise); search over discordName/displayName/steamId/eosId/discordId (name lowercased; steamId/eosId/discordId use the RAW search string via `.includes(search)`); sort keys name/steamId/joined + directions (default name asc; nulls-last for steamId); 20s auto-refresh (re-syncs the open detail user); row-click opens the detail; detail = view-only info grid (Steam/EOS via `CopyableId`, Country, Joined, Activity 30/90, Seed 30/90) + roles + comments (add on Enter + button under `manage:members`; delete under `developer`).
- **Design tokens only** — the only raw palette is the presence dot `bg-emerald-500` → `bg-success`. No `bg-\w+-\d`/`text-\w+-\d` in the discord-users tree.
- **No legacy `Modal`** → Base UI `Dialog` (`@/components/ui/dialog`). No `window.confirm/alert/prompt` (there are none — keep it). DialogContent width: pass BOTH `max-w-2xl sm:max-w-2xl` (base is `sm:max-w-sm`).
- **DataTable-v2:** `rowClassName` is a FUNCTION `(row)=>string|undefined`; a custom sort with nullable values must use `accessorFn: r => r.field ?? undefined` + `sortUndefined: "last"` (NOT null-handling inside `sortingFn` — TanStack negates the whole return on desc). Presence dot + disabled/discord-only pills via inline token classes / `StatusBadge`.
- **No emojis.** Conventional Commits one-liners, no AI attribution. **Version:** bump ROOT `package.json` 2.14.0 → 2.15.0 (last task).
- **Testing gate:** from `packages/web`, `bun test` = 0 failures AND 0 warnings; `bunx tsc --noEmit` clean; and **verify `next build` reaches "Generating static pages (N/N)" with no type error** (the Windows worktree then EPERMs on the standalone symlink step — that tail is expected/Windows-only). Components hitting the API take a DI `api` prop. HARD RULE: fix ambiguous-query test failures in the TEST (getAllBy/`within`/`findByRole`), never by deleting UI.

## File Structure

- Create `discord-users/lib.ts` — `filterDiscordUsers` (Task 1).
- Create `discord-users/discord-user-detail-dialog.tsx` — view + comments Dialog (Task 2).
- Create `discord-users/discord-users-view.tsx` — DI list view; rewrite `discord-users/page.tsx` to a thin shell (Task 3).
- Modify ROOT `package.json` (Task 4).
- Tests: `discord-users-lib.test.ts`, `discord-user-detail-dialog.test.tsx`, `discord-users-view.test.tsx`.

---

### Task 1: discord-users/lib.ts — non-member filter

**Files:** Create `packages/web/app/(protected)/discord-users/lib.ts`; Test `packages/web/test/discord-users-lib.test.ts`. Source: current `page.tsx` `filtered` useMemo lines 126-141 (the non-member + search part only — sorting moves to DataTable columns).

**Interfaces (produces):** `filterDiscordUsers(users: UserWithRolesAndComments[], memberRoleIds: Set<string>, search: string): UserWithRolesAndComments[]` — keeps users with NO role in `memberRoleIds` (when the set is non-empty; else all), then applies the search predicate (transcribe 132-141 verbatim: name/displayName lowercased; steamId/eosId/discordId `.includes(search)` raw).

- [ ] **Step 1: Write the failing test** — fixtures: a member-role user (excluded when memberRoleIds set), a non-member user (kept); search matches by name and by raw steamId. Assert non-member-only + search fields.
- [ ] **Step 2: Run → fail** (`cd packages/web && bun test test/discord-users-lib.test.ts`).
- [ ] **Step 3: Implement** — transcribe the non-member filter + search verbatim from source into a pure function.
- [ ] **Step 4: Run → pass** (0 warnings).
- [ ] **Step 5: Commit** — `refactor(web): extract discord-users non-member filter`

---

### Task 2: discord-users/discord-user-detail-dialog.tsx — view + comments

**Files:** Create `packages/web/app/(protected)/discord-users/discord-user-detail-dialog.tsx`; Test `packages/web/test/discord-user-detail-dialog.test.tsx`. Source: the detail `Modal` (current `page.tsx` 335-492) + `handleAddComment`/`handleDeleteComment` (174-196).

**Interfaces (produces):** `DiscordUserDetailDialog({ user, onClose, onChanged, canManage, isDeveloper, token, api? })` — `user: UserWithRolesAndComments | null` (Dialog open when non-null). `onChanged()` tells the page to refresh (comments changed). `type DiscordUserCommentApi = { addMemberComment; deleteMemberComment }` + `defaultApi`.

**Structure (Modal → `Dialog`):** `DialogContent className="max-w-2xl sm:max-w-2xl bg-bg-secondary p-0"`. Header: avatar + name + Logged-In(success)/Discord-Only(neutral) `StatusBadge` pills + sub-line. Info grid via `DescriptionList`/`InfoField` (shared): Steam ID + EOS ID (`CopyableId`, "--"), Country, Joined, Activity(30/90), Seed(30/90). Roles chips. Comments: list ({authorName, relative time, developer-only Delete}) + add input (Enter + Add button under `canManage`). `handleAddComment`/`handleDeleteComment` call `api.*` then `onChanged()`; add clears the input. No edit/disable/delete-user (this page has none).

- [ ] **Step 1: Write the failing test** (DI `api`): (a) renders the info grid + Steam `CopyableId`; (b) a developer sees a comment's Delete and clicking it calls `api.deleteMemberComment` + `onChanged`; (c) a non-developer does NOT see comment Delete; (d) `canManage` renders the add-comment input and typing + Add calls `api.addMemberComment`. Use `findByRole`/scoped `within` for ambiguity.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** per Structure; import `Dialog*` from `@/components/ui/dialog`, `CopyableId` from `@/components/copyable-id`, `DescriptionList`/`InfoField` from `@/components/description-list`, `StatusBadge` from `@/components/status-badge`.
- [ ] **Step 4: Run → pass** + no warnings.
- [ ] **Step 5: Commit** — `refactor(web): add discord-user detail dialog on Dialog`

---

### Task 3: discord-users-view.tsx + thin page.tsx

**Files:** Create `packages/web/app/(protected)/discord-users/discord-users-view.tsx`; Rewrite `packages/web/app/(protected)/discord-users/page.tsx`; Test `packages/web/test/discord-users-view.test.tsx`. Source: the whole current page (state/table/detail wiring).

**Interfaces:**
- `discord-users-view.tsx` exports `DiscordUsersView({ token, permissions, api })`, `type DiscordUsersApi = { getAllUsers; getRoles; addMemberComment; deleteMemberComment }`, `defaultApi`. Holds `users`/`allRoles`/`search`/`selectedUser` state; loads via `getAllUsers`+`getRoles`; 20s auto-refresh (re-syncs `selectedUser`); `memberRoleIds` from roles; `data = filterDiscordUsers(users, memberRoleIds, search)`.
- `page.tsx` (DEFAULT-ONLY): `"use client"; import { usePermissions } from "@/lib/permission-context"; import { DiscordUsersView, defaultApi } from "./discord-users-view"; export default function DiscordUsersPage() { const { apiToken, hasPermission, permissions } = usePermissions(); return <DiscordUsersView token={apiToken} permissions={permissions as string[]} api={defaultApi} />; }` — pass whatever props the view needs (canManage derived inside via `permissions.includes("manage:members")`, developer via `permissions.includes("developer")`).

**DataTable-v2 columns:** Member (avatar + presence dot [`bg-success`/`bg-text-muted/40`, title] + name + Discord-only `StatusBadge` + sub-line), Steam ID (mono `CopyableId`/code, "--"), Roles (chips), Joined (`formatDate`). Sortable name/steamId/joined via accessor/sortingFn (steamId: `accessorFn: u=>u.steamId ?? undefined` + `sortUndefined:"last"` + localeCompare; name: `displayName||discordName` localeCompare; joined: createdAt time); `initialSorting=[{id:"name",desc:false}]`. `getRowId={u=>u.id}`, `onRowClick={openDetail}`, `emptyState=<EmptyState .../>`. Header (Discord Users h1), the search `SearchInput` (v2) + count. Render `<DiscordUserDetailDialog user={selectedUser} onClose={closeDetail} onChanged={refreshUsers} canManage={...} isDeveloper={...} token={token} />`. Remove page-local `CopyableId`/`InfoField`.

- [ ] **Step 1: Write the failing test** (DI `api`): renders non-member users from a fake api (a member-role user is excluded); typing search narrows (await the flush — `await waitFor(...)` to avoid the DataTable act warning); clicking a row opens the detail dialog (assert a detail-only field). Focused.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** the view + thin page. Keep the loading + error states.
- [ ] **Step 4: Run** the view test + full `bun test` + `bunx tsc --noEmit`.
- [ ] **Step 5: Grep-gate + build check.** `grep -rnE "window\.(confirm|prompt|alert)|components/modal|bg-[a-z]+-[0-9]|text-[a-z]+-[0-9]|^export (function|const|type|interface) " "app/(protected)/discord-users"` — the palette/modal/confirm hits must be NONE, and `page.tsx` must have NO `^export (function|const|type|interface)` (only `export default`). Then `rm -rf .next && bun run build` and confirm it reaches `Generating static pages (26/26)` with no "not a valid Page export" / type error (the trailing Windows EPERM on the standalone step is expected).
- [ ] **Step 6: Commit** — `refactor(web): rebuild discord-users on DataTable-v2 (view in sibling file)`

---

### Task 4: version bump

**Files:** Modify ROOT `package.json`.

- [ ] **Step 1:** Change `"version": "2.14.0"` → `"version": "2.15.0"`.
- [ ] **Step 2:** `bunx tsc --noEmit` clean; root version reads 2.15.0.
- [ ] **Step 3: Commit** — `chore(web): bump version to 2.15.0`

---

## Self-Review

- **Spec coverage** (spec §5: discord-users is a "reskin + structural cleanup" page): DataTable-v2 list + shared composites + Dialog detail + tokens. ✓
- **Behavior preservation:** non-member filter + search transcribed (Task 1); view-only detail + comments transcribed (Task 2); sort/table/auto-refresh/detail-wiring (Task 3). ✓
- **Deploy-safety:** `page.tsx` default-only (DI in `-view.tsx`), and a `next build` page-gen check in Task 3 Step 5 — the two lessons from the 3b/3c deploy. ✓
- **Type consistency:** `DiscordUsersApi`/`DiscordUserCommentApi` DI shapes match `@/lib/api-client` (`addMemberComment(token,id,text)`, `deleteMemberComment(token,id,commentId)`, `getAllUsers(token)`, `getRoles(token)`).

# Phase 3c — Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate the 1,471-line `/members` page onto the Gilded Regiment design system — DataTable-v2 (built-in selection + sorting + `bulkActions` bar), FilterBar, shared `CopyableId`/`DescriptionList`+`InfoField`/`StatusBadge`, and Base UI `Dialog`/`AlertDialog` (replacing both legacy `Modal`s) — while preserving every behavior, especially the developer-only disable/enable flow.

**Architecture:** Decompose into `members/lib.ts` (pure filter/sort helpers), `members/filter-panel.tsx` (advanced filter panel), `members/member-detail-dialog.tsx` (the detail view), and a rewritten `members/page.tsx` shell that uses DataTable-v2 for the table (its `enableSelection` + `bulkActions` replace the hand-rolled bulk mode + floating bar; its column sorting replaces the manual sort state) and a Base UI bulk-action Dialog. All pieces take DI where they touch the API.

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, `@tanstack/react-table` via `@/components/data-table-v2`, Base UI Dialog/AlertDialog, bun test + happy-dom.

## Global Constraints

**Behavior-preservation (spec §5 Members — verify each feature-by-feature):**
- **Disable/enable confirm with a REQUIRED reason input** — the confirm button stays disabled until the reason is non-empty (single AND bulk).
- **The whitelist-removal warning line — verbatim — in BOTH single and bulk disable confirms:** `This also removes their in-game whitelist (restored if re-enabled).` (single detail-dialog disable; bulk disable dialog).
- **Developer-only gating on disable/enable** (`permissions.includes("developer")`) — the single "Disable Account" button, the bulk Disable/Enable buttons, the Account-Disabled panel's Enable button, and comment-delete are all developer-gated exactly as today.
- **"Account Disabled" info panel** in the detail view (developer-only): danger surface with "Since {formatDate(disabledAt)}", the reason, and an "Enable Account" button.
- **Disabled-row de-emphasis:** name gets `line-through text-text-muted` + a "Disabled" pill (danger tone) in both the table row and the detail header.
- **EOS + Steam IDs as mono copyable values** via the shared `CopyableId` (auto-populated by a daily backfill — no admin UI to add; the edit form keeps its EOS/Steam inputs).
- **Presence dot on avatars:** logged-in → success dot, else muted; `title` "Logged in"/"Discord only". (Tokenize `bg-emerald-500` → `bg-success`.)
- Preserve: the members-only filter (roles flagged `isMemberRole`), search (name/steamId/eosId/discordId), all advanced filters (roles AND-match, country contains, logged-in, 4 activity/seed ranges, join + membership date ranges with `+"T23:59:59"`), sort keys (name/steamId/joined/country/loggedIn) + directions, 20s auto-refresh (paused while editing/deleting), inline edit (steamId/eosId/country/membershipDate/dateOfBirth with `validateCountry`), comments (add on Enter + button, developer delete), Refresh-Roles sync, the member count chip, all bulk actions (country/membershipDate/comment/delete/disable/enable).
- **Design tokens only** — the only raw palette is the presence dot `bg-emerald-500` → `bg-success`. No `bg-\w+-\d`/`text-\w+-\d` may remain in the members tree.
- **No legacy `Modal`** — both `Modal`s → Base UI `Dialog` (bulk, detail); destructive single confirms (delete, disable) → `AlertDialog`. No `window.confirm/alert/prompt` (there are none today; keep it that way).
- **DialogContent width gotcha:** any `DialogContent`/`AlertDialogContent` with a `max-w` override MUST also pass the `sm:`-prefixed width (Base UI base is `sm:max-w-sm`). NOTE the separate gotcha: `AlertDialogContent` base is `data-[size=default]:sm:max-w-sm` (specificity-qualified) — a plain `sm:max-w-md` is inert; for a wide AlertDialog use its `size` prop. The disable/delete confirms are small — `max-w-md sm:max-w-md` is fine.
- **DataTable-v2 `rowClassName` is a FUNCTION** `(row)=>string|undefined` (NOT a string). Use it for the disabled-row de-emphasis / any `group` hover class.
- **No emojis.** Conventional Commits one-liners, no AI attribution. **Version:** bump ROOT `package.json` 2.13.0 → 2.14.0 (last task).
- **Testing gate:** from `packages/web`, `bun test` = 0 failures AND 0 warnings; `bunx tsc --noEmit` clean (clear a stale `.next` if it errors only on `validator.ts`). Components that hit the API take a DI `api` prop. HARD RULE: fix ambiguous-query test failures in the TEST (getAllBy/`within`/`findByRole`), NEVER by deleting product UI.

## File Structure

- Create `members/lib.ts` — pure predicates/comparators (Task 1).
- Create `members/filter-panel.tsx` — advanced filter panel (Task 2).
- Create `members/member-detail-dialog.tsx` — detail Dialog + edit/comments/disable/delete (Task 3).
- Rewrite `members/page.tsx` — shell: data + DataTable-v2 (selection/sort/bulkActions) + bulk Dialog + wiring (Task 4).
- Modify gallery + ROOT `package.json` (Task 5).
- Tests: `members-lib.test.ts`, `members-filter-panel.test.tsx`, `member-detail-dialog.test.tsx`, `members-page.test.tsx`.

---

### Task 1: members/lib.ts — pure filter + sort helpers

**Files:** Create `packages/web/app/(protected)/members/lib.ts`; Test `packages/web/test/members-lib.test.ts`. Source: the `filtered` useMemo (current page 258-354) + `activeFilterCount` (239-251) + `memberRoleIds` (253-256).

**Interfaces (produces):**
- `type MemberFilters = { search: string; roleIds: string[]; country: string; loggedIn: "all"|"yes"|"no"; playtime30:[string,string]; playtime90:[string,string]; seed30:[string,string]; seed90:[string,string]; joinFrom:string; joinTo:string; memberFrom:string; memberTo:string }`
- `type MemberSort = { key: "name"|"steamId"|"joined"|"country"|"loggedIn"; dir: "asc"|"desc" }`
- `filterMembers(users: UserWithRolesAndComments[], memberRoleIds: Set<string>, f: MemberFilters): UserWithRolesAndComments[]` — applies the members-only + search + all advanced predicates (transcribe 258-324 verbatim, reading each filter value from `f`).
- `sortMembers(users, sort): UserWithRolesAndComments[]` — transcribe the sort switch (327-351).
- `activeFilterCount(f: MemberFilters): number` — transcribe 239-251.

- [ ] **Step 1: Write the failing test** — cover: members-only filter (only users with a member role survive when `memberRoleIds` non-empty); search matches name/steamId/eosId/discordId; a range filter (`playtime30`) bounds correctly; `loggedIn:"no"` keeps only non-logged-in; `sortMembers({key:"name",dir:"asc"})` orders by displayName||discordName; `activeFilterCount` counts each active group once. Use 3-4 fixture users.

```ts
// packages/web/test/members-lib.test.ts — sketch (implementer fills fixtures)
import { test, expect } from "bun:test";
import { filterMembers, sortMembers, activeFilterCount, type MemberFilters } from "@/app/(protected)/members/lib";
const EMPTY: MemberFilters = { search:"", roleIds:[], country:"", loggedIn:"all", playtime30:["",""], playtime90:["",""], seed30:["",""], seed90:["",""], joinFrom:"", joinTo:"", memberFrom:"", memberTo:"" };
// ...fixtures with roles/steamId/eosId/hasLoggedIn/playtime30/createdAt/displayName...
test("members-only filter keeps only member-role users", () => { /* memberRoleIds non-empty */ });
test("search matches name, steamId, eosId, discordId", () => {});
test("playtime30 range bounds", () => {});
test("sortMembers name asc orders by display/discord name", () => {});
test("activeFilterCount counts active groups", () => { expect(activeFilterCount(EMPTY)).toBe(0); });
```

- [ ] **Step 2: Run → fail** (`cd packages/web && bun test test/members-lib.test.ts`).
- [ ] **Step 3: Implement** — transcribe the predicate/sort/count logic VERBATIM from the current page into pure functions reading `f`. `inRange` stays a local helper.
- [ ] **Step 4: Run → pass** (0 warnings).
- [ ] **Step 5: Commit** — `refactor(web): extract members filter/sort helpers`

---

### Task 2: members/filter-panel.tsx — advanced filter panel

**Files:** Create `packages/web/app/(protected)/members/filter-panel.tsx`; Test `packages/web/test/members-filter-panel.test.tsx`. Source: current page 722-810 (panel) + the `RangeFilter` helper (62-100).

**Interfaces (produces):** `MembersFilterPanel({ filters, setFilters, allRoles, onClearAll })` where `filters: MemberFilters` + `setFilters` updates one key at a time (or pass individual setters — implementer's choice, but keep it a controlled panel). Includes the `RangeFilter` sub-component (move it here). Preserve every control: logged-in select, country datalist (`COUNTRIES`), role toggle chips (AND-match, `isMemberRole` not required — all roles shown), 4 `RangeFilter`s (Activity 30/90, Seed 30/90), Join + Membership date-range pairs, and the "Clear All" button.

- [ ] **Step 1: Test** — render with 2 roles; toggling a role chip calls setFilters with the role added; changing logged-in select updates; "Clear All" calls `onClearAll`. Keep assertions structural (getByRole/getByText).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — move the panel markup verbatim (tokens already clean), wiring to `filters`/`setFilters`. Keep `facet-border` card styling.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `refactor(web): extract members advanced filter panel`

---

### Task 3: members/member-detail-dialog.tsx — detail Dialog (edit/comments/disable/delete)

**Files:** Create `packages/web/app/(protected)/members/member-detail-dialog.tsx`; Test `packages/web/test/member-detail-dialog.test.tsx`. Source: the detail `Modal` (current page 1126-1468) + `openDetail`/`closeDetail`/`startEdit`/`saveEdit`/`handleDelete`/`handleDisable`/`handleEnable`/`handleAddComment`/`handleDeleteComment` (356-502).

**Interfaces (produces):** `MemberDetailDialog({ user, onClose, onChanged, onDeleted, canManage, isDeveloper, token, api? })` where `user: UserWithRolesAndComments | null` (Dialog open when non-null), `onChanged(updated)` bubbles the updated user to the page, `onDeleted(id)` removes it. `type MemberDetailApi = { updateUser; deleteUser; disableUser; enableUser; addMemberComment; deleteMemberComment }` with a `defaultApi`.

**Structure (Modal → Base UI `Dialog`):**
- `DialogContent className="max-w-2xl sm:max-w-2xl bg-bg-secondary p-0"` — preserve the p-0 sectioned layout. Header: avatar + name + Disabled/Logged-In/Discord-Only pills (`StatusBadge` tones danger/success/neutral). Info grid via `DescriptionList`/`InfoField` (shared): Steam ID + EOS ID (view = shared `CopyableId`; edit = inputs), Country (datalist), DOB, Membership, Joined, Activity(30/90), Seed(30/90). Roles chips. Comments (add on Enter + button; developer delete). **Account-Disabled panel** (developer + disabled) verbatim. Actions row: Edit / Delete / (developer, !disabled) Disable Account.
- **Delete** and **Disable** move from inline-in-footer confirms to **`AlertDialog`** (controlled): Delete → "Delete this member?" destructive; Disable → required-reason input + the verbatim whitelist-removal warning line + confirm disabled until reason non-empty. Enable stays a direct button (Account-Disabled panel + no separate confirm, as today).
- Preserve `saveEdit`'s `validateCountry` flow and all state resets on open/close.

- [ ] **Step 1: Test** (DI `api`): (a) renders the info grid + Steam CopyableId for a user; (b) a DISABLED developer view shows the "Account Disabled" panel with the reason + an Enable button, and clicking it calls `api.enableUser` + `onChanged`; (c) developer clicks "Disable Account" → AlertDialog shows the whitelist-removal warning, confirm is disabled until a reason is typed, then confirm calls `api.disableUser(token,id,reason)`; (d) non-developer does NOT see Disable. Use `findByRole`/scoped `within` to avoid duplicate-text ambiguity (e.g. "Disabled" pill vs panel heading).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** per Structure; transcribe the handlers, swapping component shells. Import `Dialog*` from `@/components/ui/dialog`, `AlertDialog*` from `@/components/ui/alert-dialog`, `CopyableId` from `@/components/copyable-id`, `DescriptionList`/`InfoField` from `@/components/description-list`, `StatusBadge` from `@/components/status-badge`.
- [ ] **Step 4: Run → pass** + no warnings.
- [ ] **Step 5: Commit** — `refactor(web): rebuild member detail on Dialog with AlertDialog disable/delete`

---

### Task 4: members/page.tsx — shell on DataTable-v2

**Files:** Rewrite `packages/web/app/(protected)/members/page.tsx`; Test `packages/web/test/members-page.test.tsx`. Source: the whole current page (state + table + bulk bar + bulk Modal).

**Interfaces:** `default MembersPage()` reads `usePermissions()`, holds `users`/`allRoles`/`filters`/`selectedUser` state, loads via `getAllUsers`+`getRoles`, 20s auto-refresh (paused while a detail edit/delete is mid-flight — preserve via a ref or the detail dialog signalling; simplest: keep `editing`/`confirming` lifted or gate refresh on `selectedUser` open as today's `!editing && !confirmingDelete`). Delegates the table to **DataTable-v2**:
- `columns`: Member (avatar + presence dot [`bg-success`/`bg-text-muted/40`] + name with disabled `line-through text-text-muted` + Disabled/Discord-only pills + sub-line), Steam ID (`CopyableId` or mono code, "--"), Roles (chips), Joined (`formatDate`), Country. Sortable via tanstack (`initialSorting=[{id:"loggedIn",desc:true}]`; provide accessor/sortingFn for name/steamId/joined/country/loggedIn to match current comparators).
- `enableSelection={canManage}`, `bulkActions={(rows, clear) => ...}` renders the Change Country / Set Membership Date / Add Comment / Delete / (developer) Disable / Enable buttons — clicking one opens the **bulk Dialog** (Modal → `Dialog`) carrying the selected ids.
- `onRowClick={openDetail}`; `getRowId={u=>u.id}`; `rowClassName={u => u.disabled ? "opacity-60" : undefined}`.
- Data passed to DataTable = `filterMembers(users, memberRoleIds, filters)` (sort handled by DataTable's column sorting — drop the manual sort state).
- Render `<MembersFilterPanel>` (collapsible under a Filters button showing `activeFilterCount`), the member count chip, Refresh-Roles button, and `<MemberDetailDialog user={selectedUser} .../>`.
- Bulk Dialog: Modal → `Dialog` (`max-w-md sm:max-w-md`), preserving each action's body + the bulk disable required-reason + the verbatim whitelist-removal warning + confirm-disabled logic.

- [ ] **Step 1: Test** (DI `api` seam on the page too — export `MembersView`/`MembersApi` like audit-logs): renders members from a fake api; searching narrows; clicking a row opens the detail dialog; (developer) selecting rows shows the bulk bar and opening "Disable" shows the whitelist-removal warning. Keep it focused (the detail/panel internals are covered by Tasks 2-3).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — rewrite the page; keep the loading skeleton + error states; wire everything. Delete the page-local `CopyableId`/`InfoField`/`RangeFilter` (now shared/moved).
- [ ] **Step 4: Run** the page test + full `bun test` + `bunx tsc --noEmit`.
- [ ] **Step 5: Grep-gate** — `grep -rnE "window\.(confirm|prompt|alert)|components/modal|bg-[a-z]+-[0-9]|text-[a-z]+-[0-9]" "app/(protected)/members"` → NO output.
- [ ] **Step 6: Commit** — `refactor(web): rebuild members page on DataTable-v2 and Dialog`

---

### Task 5: gallery + version bump

**Files:** Modify `packages/web/app/design/gallery.tsx` (optional: a small "Members" note or presence-dot demo — keep minimal or skip if noisy) and ROOT `package.json`.

- [ ] **Step 1:** Bump ROOT `package.json` 2.13.0 → 2.14.0.
- [ ] **Step 2:** `bunx tsc --noEmit` clean; root version reads 2.14.0.
- [ ] **Step 3: Commit** — `chore(web): bump version to 2.14.0`

---

## Self-Review

- **Spec coverage** (spec §5 Members): every behavior-preservation bullet is a Global Constraint and mapped to a task (disable/enable required-reason + whitelist warning both places → Task 3 single + Task 4 bulk; developer gating → Tasks 3/4; Account-Disabled panel → Task 3; disabled de-emphasis → Tasks 3/4; EOS/Steam CopyableId → Task 3/4; presence dot → Task 4). ✓
- **Simplification note for reviewers:** the hand-rolled bulk mode + floating bar + manual sort state are intentionally REPLACED by DataTable-v2's `enableSelection`/`bulkActions`/column-sorting — a sanctioned modernization, not dropped behavior (verify the same six bulk actions + the five sort keys survive).
- **Type consistency:** `MemberFilters`/`MemberSort` (Task 1) consumed by Tasks 2 + 4; `MemberDetailApi`/`MembersApi` DI shapes match `@/lib/api-client` signatures (`disableUser(token,id,reason)`, `enableUser(token,id)`, `bulkDisableMembers(token,ids,reason)`, etc.).
- **Placeholder scan:** Task 1 has code; Tasks 2-4 give exact source line ranges + structure specs + the component swaps (implementers read the source). No TBDs.

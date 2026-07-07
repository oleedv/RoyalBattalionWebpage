# Frontend Redesign Phase 2c — Whitelist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 2,663-line `app/(protected)/whitelist/page.tsx` into focused components on the design system (DataTable-v2, FilterBar, SearchInput-v2, Dialog, Tabs, StatusBadge, DescriptionList, CopyableId, EmptyState) with identical behavior, verified feature-by-feature.

**Architecture:** Extract every pure computation (expiry, cfg generation, import parse/classify, audit readable-diffs) into a tested `lib.ts` first; extend the generic composites (DataTable-v2 row interactions + server pagination; StatusBadge whitelist variants; shared AuditDetail renderer) next; then rebuild each tab as its own file (`entries-tab`, `requests-tab`, `groups-tab`, `clans-tab`, `activity-tab`) plus three dialogs (`entry-profile-dialog`, `import-dialog`, `cfg-dialog`), composed by a slim `page.tsx` shell that keeps the exact data-loading/refresh/permission behavior of today.

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, shadcn-on-Base-UI primitives (Dialog, Tabs, Checkbox via DataTable), @tanstack/react-table (DataTable-v2), bun test + happy-dom + @testing-library/react.

## Global Constraints

Copied from the spec (`docs/superpowers/specs/2026-07-05-frontend-redesign-design.md`) and standing session rules. Every task's requirements implicitly include this section.

- Branch `integration/gilded-regiment` in worktree `C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment`, base commit `3eadbf9`. NEVER push.
- Commits: Conventional Commits one-liners. NO attribution, NO emojis.
- **Identical behavior** (spec section 5 Whitelist): same endpoints, same payloads, same permission gates (`manage:whitelist`, `manage:whitelist-sync`, `view:audit-logs`), same 20s `useAutoRefresh` cadences, same localStorage default-server read (`rb-default-server`), same optimistic state updates and refresh-after-bulk patterns, same dismissed-candidates semantics (client-side Set, cleared on server switch). Deactivated entries stay invisible (API-filtered — nothing to do client-side).
- Tokens only — no raw palette classes. The activity tab's `bg-red-500/15 text-red-400` (+green/amber/blue) action badges MUST become StatusBadge tones. `accent-accent` native checkboxes disappear with the DataTable migration.
- Modal → Dialog: `components/modal.tsx` must have ZERO whitelist imports after this wave (its remaining consumers are other pages, Phase 3).
- Toast contract: mutations that today fail SILENTLY (bulk actions, comment add/delete, candidate approve, sync toggle) get `toastError(res.error, "<fallback>")` from `@/lib/toast` via an injectable `notify` prop (the Phase 2b DI pattern). Inline contextual errors (add form, edit form, import status, duplicate warnings) stay inline — they are positioned feedback, not transient.
- Sanctioned deviations from pixel-identical (design-system idiom, called out to reviewers): (1) entries/activity tables adopt DataTable-v2 (always-visible selection checkboxes when `canManage` replace the "Select" toggle button; sticky bulk bar replaces the fixed bottom bar; client pagination at pageSize 50 on entries; header select-all is page-scoped), (2) tab strip adopts the `ui/tabs` primitive, (3) native `<select>` elements stay native (token-styled) — the Select primitive migration belongs to the Phase 3 form kit.
- TESTING GOTCHAS (learned in 2b): Base UI Switch ignores synthetic clicks under happy-dom — toggle via focus + keyDown/keyUp Space (not needed here: SFTP toggle stays a button). Base UI `Button render={<a/>}` warns — use anchors with `buttonVariants(...)` for link-CTAs. Base UI Checkbox (DataTable selection) DOES respond to `fireEvent.click` (proven by `test/data-table.test.tsx`).
- Tests run FROM `packages/web` (`cd packages/web && bun test` / `bunx tsc --noEmit`), never repo root. Zero-warning suite. Do NOT run `bun install`. `next build` is CI-only. Every Bash command starts with an absolute `cd`; QUOTE paths containing parentheses.
- TDD per task: failing test first, watch it fail, implement, watch it pass.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/web/components/data-table-v2.tsx` | Modify | Add `onRowClick`, `rowClassName`, `initialSorting`, `serverPagination` |
| `packages/web/components/status-badge.tsx` | Modify | Add `wl-expired` / `wl-expiring` / `wl-permanent` variants |
| `packages/web/components/audit-detail.tsx` | Create | Shared presentational audit-detail renderer (fields + from→to rows + show-raw) |
| `packages/web/app/(protected)/whitelist/lib.ts` | Create | ALL pure whitelist logic (expiry, cfg, import parse/classify, readable diffs, summaries) |
| `packages/web/app/(protected)/whitelist/entries-tab.tsx` | Create | Toolbar + add form + entries DataTable + bulk dialog + dialog wiring |
| `packages/web/app/(protected)/whitelist/entry-profile-dialog.tsx` | Create | Profile Dialog: info grid, comments, collapsible activity, edit, delete |
| `packages/web/app/(protected)/whitelist/import-dialog.tsx` | Create | Paste → parse → classified review table → bulk import |
| `packages/web/app/(protected)/whitelist/cfg-dialog.tsx` | Create | admins.cfg review Dialog with Copy |
| `packages/web/app/(protected)/whitelist/requests-tab.tsx` | Create | Candidate cards: approve (group select) / dismiss |
| `packages/web/app/(protected)/whitelist/groups-tab.tsx` | Create | AdminGroup CRUD cards + permission chips |
| `packages/web/app/(protected)/whitelist/clans-tab.tsx` | Create | Clan CRUD cards |
| `packages/web/app/(protected)/whitelist/activity-tab.tsx` | Create | Audit log DataTable (server pagination + renderDetail=AuditDetail) + filters |
| `packages/web/app/(protected)/whitelist/page.tsx` | Modify | Slim shell: init/load/refresh, server pills, SFTP toggle, Tabs, tab render |
| `package.json` (root) | Modify | Version 2.8.0 → 2.9.0 at wave close |

Existing pieces consumed as-is: `SearchInput` from `@/components/search-input-v2`, `FilterBar`, `DataTable`/`ColumnMeta`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (Base UI, controlled `open`/`onOpenChange`), `Tabs`/`TabsList`/`TabsTrigger` (controlled `value`/`onValueChange`), `CopyableId` from `@/components/copyable-id`, `DescriptionList`/`InfoField` from `@/components/description-list`, `EmptyState`, `Skeleton`/`SkeletonCard`/`SkeletonTableRows`, `Button`/`Input`/`buttonVariants`, `toastError` from `@/lib/toast`, `useAutoRefresh`, `formatDate`/`formatDateTime`/`formatRelativeTime` from `@/lib/format`.

Key API signatures (from `lib/api-client.ts`, all unchanged): `getWhitelist(token, server?)`; `addWhitelistEntry(token, steamId, opts?)`; `updateWhitelistEntry(token, id, data)`; `deleteWhitelistEntry(token, id)`; `getWhitelistEntry(token, id) → WhitelistEntryWithComments`; `addWhitelistComment(token, id, text)`; `deleteWhitelistComment(token, id, commentId)`; `bulkAddWhitelist(token, entries[], server?) → { created, skipped: BulkAddSkippedEntry[] }`; `bulkUpdateWhitelist(token, ids, { clanId?, groupId?, expiresAt? })`; `bulkDeleteWhitelist(token, ids)`; `getWhitelistCandidates(token, server?)`; `getAdminGroups/createAdminGroup/updateAdminGroup/deleteAdminGroup`; `getClans/createClan/updateClan/deleteClan`; `getServerConfigs(token)`; `toggleServerSync(token, server, syncEnabled)`; `getAuditLogs(token, { page?, limit?, action?, resource?, resourceId?, userId?, from?, to? }) → Paginated<AuditLogEntry>`; `getPlaytime(token, steamId) → PlaytimeStats`.

---

### Task 1: DataTable-v2 extensions (onRowClick, rowClassName, initialSorting, serverPagination)

Four generic gaps between DataTable-v2 and this wave's tables (all also needed by later waves: seeding drill-in rows, members disabled-row de-emphasis, tickets/audit server paging):
- `onRowClick?: (row: TData) => void` — whole-row drill-in (entries → profile). Must NOT fire from clicks on interactive elements inside cells (links, buttons, inputs, checkboxes).
- `rowClassName?: (row: TData) => string | undefined` — per-row de-emphasis (expired entries `opacity-50`).
- `initialSorting?: SortingState` — default sort (entries default to clan asc).
- `serverPagination?: { page: number; totalPages: number; onPageChange: (page: number) => void }` — when set, the table shows ALL passed rows (no client page slicing) and the footer pager drives the callback instead (activity tab pages server-side).

**Files:**
- Modify: `packages/web/components/data-table-v2.tsx`
- Modify: `packages/web/test/data-table.test.tsx` (append tests)

**Interfaces:**
- Produces (later tasks rely on): the four new optional props above on `DataTable<TData>`, exact names and types as written. Existing props unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/test/data-table.test.tsx` (reuse the file's existing `demoColumns`/`demoData`-style fixtures if present; otherwise define locally in the new tests):

```tsx
import { fireEvent } from "@testing-library/react";

type Row = { id: string; name: string };
const rows: Row[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];
const cols = [{ accessorKey: "name", header: "Name" }] as ColumnDef<Row, unknown>[];

test("onRowClick fires for row clicks but not for interactive children", () => {
  const clicked: string[] = [];
  render(
    <DataTable
      columns={[
        ...cols,
        {
          id: "actions",
          header: "",
          cell: ({ row }) => <button>act-{row.original.id}</button>,
        },
      ]}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => clicked.push(r.id)}
    />,
  );
  fireEvent.click(screen.getByText("Alpha"));
  expect(clicked).toEqual(["1"]);
  fireEvent.click(screen.getByText("act-2"));
  expect(clicked).toEqual(["1"]); // button click must not bubble into onRowClick
});

test("rowClassName applies per-row classes", () => {
  render(
    <DataTable
      columns={cols}
      data={rows}
      getRowId={(r) => r.id}
      rowClassName={(r) => (r.id === "2" ? "opacity-50" : undefined)}
    />,
  );
  const beta = screen.getByText("Beta").closest("tr")!;
  expect(beta.className).toContain("opacity-50");
  const alpha = screen.getByText("Alpha").closest("tr")!;
  expect(alpha.className).not.toContain("opacity-50");
});

test("initialSorting sorts on first render", () => {
  render(
    <DataTable
      columns={cols}
      data={[{ id: "1", name: "Zulu" }, { id: "2", name: "Alpha" }]}
      getRowId={(r) => r.id}
      initialSorting={[{ id: "name", desc: false }]}
    />,
  );
  const cells = screen.getAllByRole("row").slice(1); // skip header row
  expect(cells[0].textContent).toContain("Alpha");
  expect(cells[1].textContent).toContain("Zulu");
});

test("serverPagination renders all rows and drives the callback pager", () => {
  const pages: number[] = [];
  const many: Row[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: `P${i}`,
  }));
  render(
    <DataTable
      columns={cols}
      data={many}
      getRowId={(r) => r.id}
      pageSize={10}
      serverPagination={{ page: 2, totalPages: 5, onPageChange: (p) => pages.push(p) }}
    />,
  );
  // no client slicing: all 30 rows render even though pageSize is 10
  expect(screen.getAllByRole("row").length).toBe(31);
  expect(screen.getByText("2/5")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(pages).toEqual([3, 1]);
});
```

(Adjust the import list at the top of the test file to include `fireEvent` if missing; `ColumnDef` comes from `@tanstack/react-table` and is likely already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/data-table.test.tsx`
Expected: existing tests PASS, the 4 new ones FAIL (unknown props have no effect).

- [ ] **Step 3: Implement the extensions**

In `packages/web/components/data-table-v2.tsx`:

Add to `DataTableProps<TData>` (after `renderDetail`):

```tsx
  /** Whole-row drill-in. Ignored for clicks on interactive elements inside cells. */
  onRowClick?: (row: TData) => void;
  /** Per-row class hook (e.g. de-emphasize expired rows). */
  rowClassName?: (row: TData) => string | undefined;
  /** Initial sort state (tanstack SortingState). */
  initialSorting?: SortingState;
  /**
   * Server-side pagination: render all passed rows and drive the pager via
   * callback instead of slicing client-side.
   */
  serverPagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
```

Destructure the new props in the component signature. Change the sorting state initialization:

```tsx
  const [sorting, setSorting] = React.useState<SortingState>(
    initialSorting ?? [],
  );
```

In the `useReactTable` options, make client pagination conditional:

```tsx
    getPaginationRowModel: serverPagination ? undefined : getPaginationRowModel(),
```

Add a row-click guard helper above the return:

```tsx
  function handleRowClick(e: React.MouseEvent, row: TData) {
    if (!onRowClick) return;
    const target = e.target as HTMLElement;
    if (target.closest("a,button,input,select,textarea,label,[role=checkbox]")) return;
    onRowClick(row);
  }
```

On the data `<TableRow>` (the one with `data-state`), wire click, cursor, and row classes:

```tsx
                  <TableRow
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    onClick={(e) => handleRowClick(e, row.original)}
                    className={cn(
                      "h-8",
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row.original),
                    )}
                  >
```

Replace the pager block (`{pageCount > 1 && (...)}`) with a dual-mode pager:

```tsx
      {(serverPagination ? serverPagination.totalPages > 1 : pageCount > 1) && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {serverPagination
              ? `${serverPagination.page}/${serverPagination.totalPages}`
              : `${table.getState().pagination.pageIndex + 1}/${pageCount}`}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={
              serverPagination
                ? serverPagination.page <= 1
                : !table.getCanPreviousPage()
            }
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(serverPagination.page - 1)
                : table.previousPage()
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={
              serverPagination
                ? serverPagination.page >= serverPagination.totalPages
                : !table.getCanNextPage()
            }
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(serverPagination.page + 1)
                : table.nextPage()
            }
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/data-table.test.tsx && bunx tsc --noEmit`
Expected: PASS (all old + 4 new), tsc clean.

- [ ] **Step 5: Run the full suite (the gallery consumes DataTable)**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test`
Expected: all pass, zero warnings.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/data-table-v2.tsx packages/web/test/data-table.test.tsx
git commit -m "feat(web): extend DataTable with row click, row class, initial sort and server paging"
```

### Task 2: StatusBadge whitelist variants

Spec section 2: StatusBadge covers "whitelist Expired/Expiring/Permanent". Expiring shows a dynamic label ("3d left" / "5h left"), so the variant supplies the tone and the caller overrides the label via children (the existing children-override mechanism).

**Files:**
- Modify: `packages/web/components/status-badge.tsx` (VARIANTS map only)
- Modify: `packages/web/test/status-badge.test.tsx` (append)

**Interfaces:**
- Produces: variants `"wl-expired"` (danger, label "Expired"), `"wl-expiring"` (warning, label "Expiring"), `"wl-permanent"` (neutral, label "Permanent") on the existing `StatusVariant` union.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/status-badge.test.tsx`:

```tsx
test("whitelist variants render their tones and accept label overrides", () => {
  const { container } = render(
    <>
      <StatusBadge variant="wl-expired" />
      <StatusBadge variant="wl-expiring">3d left</StatusBadge>
      <StatusBadge variant="wl-permanent" />
    </>,
  );
  expect(screen.getByText("Expired").className).toContain("text-danger");
  expect(screen.getByText("3d left").className).toContain("text-warning");
  expect(screen.getByText("Permanent").className).toContain("text-text-secondary");
  expect(container.querySelectorAll("[data-slot=pulse-dot]").length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/status-badge.test.tsx`
Expected: FAIL — unknown variants (tsc error or undefined label).

- [ ] **Step 3: Implement**

In `packages/web/components/status-badge.tsx`, add to the `VARIANTS` map (after `"ticket-legacy"`):

```tsx
  "wl-expired": { tone: "danger", label: "Expired" },
  "wl-expiring": { tone: "warning", label: "Expiring" },
  "wl-permanent": { tone: "neutral", label: "Permanent" },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/status-badge.test.tsx && bunx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/status-badge.tsx packages/web/test/status-badge.test.tsx
git commit -m "feat(web): add whitelist expiry StatusBadge variants"
```

### Task 3: `whitelist/lib.ts` — the pure logic core

Every pure computation in the page moves here VERBATIM (this is transcription, not redesign): expiry formatting, admins.cfg generation, import parsing + duplicate classification + counts + skipped-summary message, audit readable-values/changes/summaries, action verbs/labels/tones, constants. Later tasks import from here; the page keeps zero business logic. `getDetailSummary`, `wlReadableValue`, `wlReadableChanges` take `groups`/`clans` as arguments (they were closures over component props). `generateCfgContent` takes an injectable `now` so tests are deterministic.

**Files:**
- Create: `packages/web/app/(protected)/whitelist/lib.ts`
- Create: `packages/web/test/whitelist-lib.test.ts`

**Interfaces (produced — later tasks use these EXACT names):**

```ts
export const SQUAD_PERMISSIONS: string[];
export const DEFAULT_SERVERS: { server: string; label: string }[];
export function getStoredDefaultServer(): string;
export function formatExpiry(expiresAt: string | null): { label: string; expired: boolean } | null;
export const WL_DETAIL_LABELS: Record<string, string>;
export function wlReadableValue(field: string, value: unknown, groups: AdminGroup[], clans: Clan[]): string;
export type WlReadableChange = { key: string; label: string; from: string; to: string };
export function wlReadableChanges(changes: unknown, groups: AdminGroup[], clans: Clan[]): WlReadableChange[];
export function getActionVerb(action: string): string;
export function getActionLabel(action: string): string;
export type WlActionTone = "danger" | "success" | "warning" | "accent";
export function getActionTone(action: string): WlActionTone;
export const ACTION_OPTIONS: { value: string; label: string }[];
export function getDetailSummary(log: AuditLogEntry, groups: AdminGroup[], clans: Clan[]): string;
export interface ParsedImportRow { steamId: string; name: string; clanId: string; role: string; groupId: string; error: boolean }
export function parseImportLines(text: string, clans: Clan[], groups: AdminGroup[]): ParsedImportRow[];
export type ImportDupeReason = "existing" | "batch";
export function classifyImportRows(rows: ParsedImportRow[], entries: WhitelistEntry[]): Map<number, ImportDupeReason>;
export function importCounts(rows: ParsedImportRow[], dupeMap: Map<number, ImportDupeReason>): { newCount: number; existingCount: number; batchCount: number; errorCount: number };
export function formatImportResult(created: number, skipped: BulkAddSkippedEntry[], now?: number): string;
export function generateCfgContent(entries: WhitelistEntry[], groups: AdminGroup[], activeServer: string, now?: Date): string;
```

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/whitelist-lib.test.ts`:

```ts
import { test, expect } from "bun:test";
import {
  formatExpiry,
  wlReadableValue,
  wlReadableChanges,
  getActionVerb,
  getActionLabel,
  getActionTone,
  getDetailSummary,
  parseImportLines,
  classifyImportRows,
  importCounts,
  formatImportResult,
  generateCfgContent,
} from "@/app/(protected)/whitelist/lib";
import type { AdminGroup, Clan, WhitelistEntry, AuditLogEntry } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 2, createdAt: "" },
  { id: "g2", name: "SuperAdmin", permissions: "ban,kick", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [
  { id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" },
];

function entry(over: Partial<WhitelistEntry>): WhitelistEntry {
  return {
    id: "e1", steamId: "76561198000000001", server: "main", name: "Olie",
    clan: "RB", clanId: "c1", clanName: "Royal Battalion", role: null,
    groupId: "g1", groupName: "Whitelist", userId: null, addedBy: "x",
    reason: null, expiresAt: null, createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

test("formatExpiry: null, expired, days and hours", () => {
  expect(formatExpiry(null)).toBeNull();
  expect(formatExpiry(new Date(Date.now() - 1000).toISOString())).toEqual({
    label: "Expired",
    expired: true,
  });
  const twoDays = formatExpiry(new Date(Date.now() + 2 * 86400000 + 3600000).toISOString());
  expect(twoDays).toEqual({ label: "2d left", expired: false });
  const fiveHours = formatExpiry(new Date(Date.now() + 5 * 3600000 + 60000).toISOString());
  expect(fiveHours).toEqual({ label: "5h left", expired: false });
});

test("wlReadableValue resolves ids, dates and empties", () => {
  expect(wlReadableValue("groupId", "g2", groups, clans)).toBe("SuperAdmin");
  expect(wlReadableValue("clanId", "c1", groups, clans)).toBe("Royal Battalion");
  expect(wlReadableValue("groupId", "missing", groups, clans)).toBe("missing");
  expect(wlReadableValue("name", null, groups, clans)).toBe("—");
  expect(wlReadableValue("steamIds", ["1", "2"], groups, clans)).toBe("1, 2");
});

test("wlReadableChanges maps from/to and drops clanId when clan is present", () => {
  const changes = {
    clan: { from: null, to: "RB" },
    clanId: { from: null, to: "c1" },
    groupId: { from: "g1", to: "g2" },
    junk: "not-a-change",
  };
  const out = wlReadableChanges(changes, groups, clans);
  expect(out.map((c) => c.key)).toEqual(["clan", "groupId"]);
  const grp = out.find((c) => c.key === "groupId")!;
  expect(grp.label).toBe("Group");
  expect(grp.from).toBe("Whitelist");
  expect(grp.to).toBe("SuperAdmin");
});

test("action verb, label and tone", () => {
  expect(getActionVerb("whitelist.add")).toBe("added this entry");
  expect(getActionVerb("unknown.thing")).toBe("unknown.thing");
  expect(getActionLabel("whitelist.comment.add")).toBe("add");
  expect(getActionTone("whitelist.delete")).toBe("danger");
  expect(getActionTone("whitelist.bulk_add")).toBe("success");
  expect(getActionTone("whitelist.update")).toBe("warning");
  expect(getActionTone("whitelist.something")).toBe("accent");
});

test("getDetailSummary covers add, update overflow and comment trim", () => {
  const add: AuditLogEntry = {
    id: "1", userId: "u", userName: "Ole", action: "whitelist.add",
    resource: "WhitelistEntry", resourceId: "e1",
    detail: { name: "Olie", server: "main" }, createdAt: "",
  };
  expect(getDetailSummary(add, groups, clans)).toBe("Added Olie on main");

  const update: AuditLogEntry = {
    ...add,
    action: "whitelist.update",
    detail: {
      changes: {
        name: { from: "A", to: "B" },
        reason: { from: null, to: "vip" },
        groupId: { from: "g1", to: "g2" },
      },
    },
  };
  const summary = getDetailSummary(update, groups, clans);
  expect(summary).toContain("Name: A → B");
  expect(summary).toContain("+1 more");

  const longText = "x".repeat(80);
  const comment: AuditLogEntry = {
    ...add,
    action: "whitelist.comment.add",
    detail: { textPreview: longText },
  };
  expect(getDetailSummary(comment, groups, clans)).toBe(
    `Commented: "${"x".repeat(60)}…"`,
  );
});

test("parseImportLines handles both formats, sections and errors", () => {
  const text = [
    "Group=Whitelist:reserve",
    "// RB",
    "Admin=76561198000000001:Whitelist // Olie",
    "// No Clan",
    "Admin=76561198000000002:SuperAdmin",
    "garbage line",
  ].join("\n");
  const rows = parseImportLines(text, clans, groups);
  expect(rows.length).toBe(3);
  expect(rows[0]).toEqual({
    clanId: "c1", steamId: "76561198000000001", role: "Whitelist",
    groupId: "g1", name: "Olie", error: false,
  });
  expect(rows[1]).toEqual({
    clanId: "", steamId: "76561198000000002", role: "SuperAdmin",
    groupId: "g2", name: "", error: false,
  });
  expect(rows[2].error).toBe(true);
});

test("classifyImportRows and importCounts", () => {
  const rows = [
    { steamId: "76561198000000001", name: "", clanId: "", role: "", groupId: "", error: false }, // existing
    { steamId: "9", name: "", clanId: "", role: "", groupId: "", error: false }, // new
    { steamId: "9", name: "", clanId: "", role: "", groupId: "", error: false }, // batch dupe
    { steamId: "", name: "", clanId: "", role: "", groupId: "", error: true }, // error
  ];
  const map = classifyImportRows(rows, [entry({})]);
  expect(map.get(0)).toBe("existing");
  expect(map.get(1)).toBeUndefined();
  expect(map.get(2)).toBe("batch");
  expect(importCounts(rows, map)).toEqual({
    newCount: 1, existingCount: 1, batchCount: 1, errorCount: 1,
  });
});

test("formatImportResult summarizes skips", () => {
  const msg = formatImportResult(
    2,
    [
      { steamId: "1", reason: "duplicate_in_batch" },
      { steamId: "2", reason: "duplicate_existing", existingName: "Bob", existingExpiresAt: "2020-01-02T00:00:00Z" },
    ],
    new Date("2026-01-01").getTime(),
  );
  expect(msg).toContain("Imported 2 entries");
  expect(msg).toContain("1 (duplicate in batch)");
  expect(msg).toContain('2 (already whitelisted as "Bob", expired 2020-01-02)');
});

test("generateCfgContent groups by clan, sorts groups, drops expired", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const cfg = generateCfgContent(
    [
      entry({}),
      entry({ id: "e2", steamId: "2", name: null, clan: null, clanName: null, groupName: null, role: "Admin" }),
      entry({ id: "e3", steamId: "3", expiresAt: "2020-01-01T00:00:00Z" }),
    ],
    groups,
    "main",
    now,
  );
  const lines = cfg.split("\n");
  expect(lines[1]).toBe("// Royal Battalion Whitelist");
  expect(lines[3]).toBe("// Server: main");
  // groups sorted by sortOrder: SuperAdmin (1) before Whitelist (2)
  expect(cfg.indexOf("Group=SuperAdmin:ban,kick")).toBeLessThan(cfg.indexOf("Group=Whitelist:reserve"));
  // clan sections: RB before No Clan
  expect(cfg.indexOf("// RB")).toBeLessThan(cfg.indexOf("// No Clan"));
  expect(cfg).toContain("Admin=76561198000000001:Whitelist // Olie");
  expect(cfg).toContain("Admin=2:Admin // 2"); // role fallback + steamId as name
  expect(cfg).not.toContain("Admin=3:"); // expired dropped
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-lib.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/web/app/(protected)/whitelist/lib.ts`. The bodies are VERBATIM ports from `page.tsx` (line references given so you can cross-check): `formatExpiry` (page 70-80), `getStoredDefaultServer` (82-85), `SQUAD_PERMISSIONS` (40-45), `DEFAULT_SERVERS` (64-67), `getActionVerb` (624-636), `WL_DETAIL_LABELS` (2282-2301), `wlReadableValue` (2304-2315), `wlReadableChanges` (2321-2338), `getActionLabel` (2486-2489), `getDetailSummary` (2491-2522), import parsing (881-925), classification (985-1017), skipped-summary (951-973), cfg generation (795-845):

```ts
import type {
  AdminGroup,
  AuditLogEntry,
  Clan,
  WhitelistEntry,
} from "shared";
import type { BulkAddSkippedEntry } from "@/lib/api-client";

export const SQUAD_PERMISSIONS = [
  "startvote", "cheat", "private", "config", "manageserver", "featuretest",
  "debug", "teamchange", "cameraman", "pause", "kick", "ban", "changemap",
  "chat", "balance", "reserve", "immune", "forceteamchange", "canseeadminchat",
  "clientdemos",
];

// Default servers if no ServerConfig exists in DB
export const DEFAULT_SERVERS = [
  { server: "main", label: "Main Server" },
  { server: "battle", label: "Battle Server" },
];

export function getStoredDefaultServer(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rb-default-server") || "";
}

export function formatExpiry(
  expiresAt: string | null,
): { label: string; expired: boolean } | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const now = new Date();
  if (exp <= now) return { label: "Expired", expired: true };
  const diff = exp.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return { label: `${days}d left`, expired: false };
  const hours = Math.floor(diff / 3600000);
  return { label: `${hours}h left`, expired: false };
}

/* ── Audit readable-diff helpers ─────────────────────────────────────── */

// Human-readable labels for audit-detail fields
export const WL_DETAIL_LABELS: Record<string, string> = {
  steamId: "Steam ID",
  name: "Name",
  clan: "Clan",
  clanId: "Clan",
  role: "Role",
  groupId: "Group",
  reason: "Reason",
  expiresAt: "Expires",
  userId: "Linked user",
  server: "Server",
  count: "Entries",
  created: "Created",
  skipped: "Skipped",
  total: "Total",
  textPreview: "Comment",
  commentId: "Comment",
  steamIds: "Steam IDs",
  changes: "Changes",
};

// Resolve a stored value into something a human can read (ids -> names, dates, etc.)
export function wlReadableValue(
  field: string,
  value: unknown,
  groups: AdminGroup[],
  clans: Clan[],
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "groupId") return groups.find((g) => g.id === value)?.name ?? String(value);
  if (field === "clanId") return clans.find((c) => c.id === value)?.name ?? String(value);
  if (field === "expiresAt" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type WlReadableChange = { key: string; label: string; from: string; to: string };

// Turn a whitelist.update `changes` map into readable from -> to rows,
// dropping internal id fields that duplicate a human-readable twin (clanId vs clan).
export function wlReadableChanges(
  changes: unknown,
  groups: AdminGroup[],
  clans: Clan[],
): WlReadableChange[] {
  if (!changes || typeof changes !== "object") return [];
  const keys = Object.keys(changes as Record<string, unknown>);
  const out: WlReadableChange[] = [];
  for (const k of keys) {
    const v = (changes as Record<string, unknown>)[k];
    if (!v || typeof v !== "object" || !("from" in v) || !("to" in v)) continue;
    if (k === "clanId" && keys.includes("clan")) continue;
    const { from, to } = v as { from: unknown; to: unknown };
    out.push({
      key: k,
      label: WL_DETAIL_LABELS[k] ?? k,
      from: wlReadableValue(k, from, groups, clans),
      to: wlReadableValue(k, to, groups, clans),
    });
  }
  return out;
}

export function getActionVerb(action: string): string {
  switch (action) {
    case "whitelist.add": return "added this entry";
    case "whitelist.update": return "updated entry";
    case "whitelist.delete": return "removed entry";
    case "whitelist.comment.add": return "added a comment";
    case "whitelist.comment.delete": return "deleted a comment";
    case "whitelist.bulk_update": return "bulk updated";
    case "whitelist.bulk_add": return "bulk added";
    case "whitelist.bulk_delete": return "bulk deleted";
    default: return action;
  }
}

export function getActionLabel(action: string): string {
  const parts = action.split(".");
  return parts[parts.length - 1];
}

export type WlActionTone = "danger" | "success" | "warning" | "accent";

export function getActionTone(action: string): WlActionTone {
  if (action.includes("delete")) return "danger";
  if (action.includes("add")) return "success";
  if (action.includes("update")) return "warning";
  return "accent";
}

export const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "whitelist.add", label: "Add" },
  { value: "whitelist.update", label: "Update" },
  { value: "whitelist.delete", label: "Delete" },
  { value: "whitelist.bulk_add", label: "Bulk Add" },
  { value: "whitelist.bulk_update", label: "Bulk Update" },
  { value: "whitelist.bulk_delete", label: "Bulk Delete" },
  { value: "whitelist.comment.add", label: "Comment Add" },
  { value: "whitelist.comment.delete", label: "Comment Delete" },
];

export function getDetailSummary(
  log: AuditLogEntry,
  groups: AdminGroup[],
  clans: Clan[],
): string {
  const detail = (log.detail || {}) as Record<string, unknown>;
  switch (log.action) {
    case "whitelist.add":
      return `Added ${(detail.name as string) || (detail.steamId as string) || "entry"}${detail.server ? ` on ${detail.server}` : ""}`;
    case "whitelist.update": {
      const readable = wlReadableChanges(detail.changes, groups, clans);
      if (readable.length === 0) return "Updated entry";
      const parts = readable.map((c) => `${c.label}: ${c.from} → ${c.to}`);
      if (parts.length <= 2) return parts.join(" · ");
      return `${parts.slice(0, 2).join(" · ")} · +${parts.length - 2} more`;
    }
    case "whitelist.delete":
      return `Removed ${(detail.name as string) || (detail.steamId as string) || "entry"}${detail.server ? ` from ${detail.server}` : ""}`;
    case "whitelist.bulk_add":
      return `Added ${detail.created ?? "?"} entries (${detail.skipped ?? 0} skipped)`;
    case "whitelist.bulk_update":
      return `Updated ${detail.count ?? "?"} entries`;
    case "whitelist.bulk_delete":
      return `Deleted ${detail.count ?? "?"} entries`;
    case "whitelist.comment.add": {
      const preview = detail.textPreview as string | undefined;
      if (!preview) return "Added comment";
      const trimmed = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;
      return `Commented: "${trimmed}"`;
    }
    case "whitelist.comment.delete":
      return "Deleted comment";
    default:
      return log.action;
  }
}

/* ── Import parsing + classification ─────────────────────────────────── */

export interface ParsedImportRow {
  steamId: string;
  name: string;
  clanId: string;
  role: string;
  groupId: string;
  error: boolean;
}

export function parseImportLines(
  text: string,
  clans: Clan[],
  groups: AdminGroup[],
): ParsedImportRow[] {
  const allLines = text.split("\n");
  const parsed: ParsedImportRow[] = [];
  let currentClanId = "";

  for (const line of allLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Group=")) continue;

    // Detect clan section headers like "// RB" or "// No Clan"
    if (trimmed.startsWith("//")) {
      const sectionName = trimmed.replace(/^\/\/\s*/, "").trim();
      if (sectionName && sectionName !== "No Clan") {
        // Match by tag or name (case-insensitive)
        const matchedClan = clans.find(
          (c) =>
            c.tag.toLowerCase() === sectionName.toLowerCase() ||
            c.name.toLowerCase() === sectionName.toLowerCase(),
        );
        currentClanId = matchedClan?.id || "";
      } else {
        currentClanId = "";
      }
      continue;
    }

    // Parse Admin=steamId:GroupName // PlayerName
    const match = trimmed.match(/^(.+?)=(\d+):(.+?)\s*\/\/\s*(.+)$/);
    if (match) {
      const roleName = match[3].trim();
      const matchedGroup = groups.find((g) => g.name.toLowerCase() === roleName.toLowerCase());
      parsed.push({ clanId: currentClanId, steamId: match[2].trim(), role: roleName, groupId: matchedGroup?.id || "", name: match[4].trim(), error: false });
    } else {
      // Try simpler format: Admin=steamId:GroupName
      const simpleMatch = trimmed.match(/^(.+?)=(\d+):(.+)$/);
      if (simpleMatch) {
        const roleName = simpleMatch[3].trim();
        const matchedGroup = groups.find((g) => g.name.toLowerCase() === roleName.toLowerCase());
        parsed.push({ clanId: currentClanId, steamId: simpleMatch[2].trim(), role: roleName, groupId: matchedGroup?.id || "", name: "", error: false });
      } else {
        parsed.push({ steamId: "", name: "", clanId: "", role: "", groupId: "", error: true });
      }
    }
  }
  return parsed;
}

export type ImportDupeReason = "existing" | "batch";

// Classify import rows against the currently loaded whitelist (same server) and within the pasted batch
export function classifyImportRows(
  rows: ParsedImportRow[],
  entries: WhitelistEntry[],
): Map<number, ImportDupeReason> {
  const map = new Map<number, ImportDupeReason>();
  const existingSteamIds = new Set(entries.map((e) => e.steamId));
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const sid = row.steamId.trim();
    if (!sid) return;
    if (existingSteamIds.has(sid)) {
      map.set(i, "existing");
    } else if (seen.has(sid)) {
      map.set(i, "batch");
    } else {
      seen.add(sid);
    }
  });
  return map;
}

export function importCounts(
  rows: ParsedImportRow[],
  dupeMap: Map<number, ImportDupeReason>,
): { newCount: number; existingCount: number; batchCount: number; errorCount: number } {
  let newCount = 0;
  let existingCount = 0;
  let batchCount = 0;
  let errorCount = 0;
  rows.forEach((row, i) => {
    if (row.error) { errorCount++; return; }
    if (!row.steamId.trim()) { errorCount++; return; }
    const reason = dupeMap.get(i);
    if (reason === "existing") existingCount++;
    else if (reason === "batch") batchCount++;
    else newCount++;
  });
  return { newCount, existingCount, batchCount, errorCount };
}

export function formatImportResult(
  created: number,
  skipped: BulkAddSkippedEntry[],
  now: number = Date.now(),
): string {
  let msg = `Imported ${created} ${created === 1 ? "entry" : "entries"}`;
  if (skipped.length > 0) {
    const sample = skipped.slice(0, 5)
      .map((s) => {
        if (s.reason === "duplicate_in_batch") return `${s.steamId} (duplicate in batch)`;
        const who = s.existingName ? ` as "${s.existingName}"` : "";
        let when = "";
        if (s.existingExpiresAt) {
          const exp = new Date(s.existingExpiresAt);
          const expIso = s.existingExpiresAt.slice(0, 10);
          when = exp.getTime() < now ? `, expired ${expIso}` : `, expires ${expIso}`;
        } else if (s.existingName !== undefined) {
          when = ", no expiry";
        }
        return `${s.steamId} (already whitelisted${who}${when})`;
      })
      .join(", ");
    const extra = skipped.length > 5 ? `, +${skipped.length - 5} more` : "";
    msg += `. Skipped ${skipped.length}: ${sample}${extra}`;
  }
  return msg;
}

/* ── admins.cfg generation ───────────────────────────────────────────── */

export function generateCfgContent(
  entries: WhitelistEntry[],
  groups: AdminGroup[],
  activeServer: string,
  now: Date = new Date(),
): string {
  const lines: string[] = [];
  const timestamp = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

  // Header
  lines.push("// ============================================================");
  lines.push("// Royal Battalion Whitelist");
  lines.push(`// Generated: ${timestamp}`);
  lines.push(`// Server: ${activeServer}`);
  lines.push("// ============================================================");
  lines.push("");

  // Group definitions
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const g of sortedGroups) {
    lines.push(`Group=${g.name}:${g.permissions}`);
  }
  if (sortedGroups.length > 0) lines.push("");

  // Entries grouped by clan
  const activeEntries = entries.filter((e) => {
    if (!e.expiresAt) return true;
    return new Date(e.expiresAt) > now;
  });

  const byClan = new Map<string, WhitelistEntry[]>();
  for (const e of activeEntries) {
    const clan = e.clan || "No Clan";
    if (!byClan.has(clan)) byClan.set(clan, []);
    byClan.get(clan)!.push(e);
  }

  const sortedClans = [...byClan.keys()].sort((a, b) => {
    if (a === "No Clan") return 1;
    if (b === "No Clan") return -1;
    return a.localeCompare(b);
  });

  for (const clan of sortedClans) {
    lines.push(`// ${clan}`);
    for (const e of byClan.get(clan)!) {
      const groupName = e.groupName || e.role || "Whitelist";
      const playerName = e.name || e.steamId;
      lines.push(`Admin=${e.steamId}:${groupName} // ${playerName}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

(Note: `getActionTone("whitelist.comment.add")` returns "success" because the original page's `getActionBadge` checked `action.includes("add")` — `.includes("add")` matches both "add" and "comment.add", so the simplified condition is behavior-identical. The header of `generateCfgContent`'s timestamp regex only strips a trailing `.###Z`; the injectable `now` keeps that exact output shape.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-lib.test.ts && bunx tsc --noEmit`
Expected: PASS (9 tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/lib.ts" packages/web/test/whitelist-lib.test.ts
git commit -m "feat(web): extract whitelist pure logic core with tests"
```

### Task 4: Shared AuditDetail composite

Spec section 2: "AuditDetail renderer: key-value grid + from->to change-diff rows + collapsible 'Show raw' JSON block (whitelist activity panel; also fits audit-logs)". Purely presentational — callers precompute the readable fields/changes (whitelist uses Task 3's `wlReadableValue`/`wlReadableChanges`), so the Phase 3 audit-logs page can reuse it with its own resolvers.

**Files:**
- Create: `packages/web/components/audit-detail.tsx`
- Create: `packages/web/test/audit-detail.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type AuditField = { label: string; value: string };
  export type AuditChange = { key: string; label: string; from: string; to: string };
  export function AuditDetail({ fields, changes, plainChanges, raw }: {
    fields: AuditField[];
    changes: AuditChange[];
    /** bulk_update stores `changes` as a plain map of new values (not from/to pairs) */
    plainChanges?: AuditField[];
    raw: unknown;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/audit-detail.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { AuditDetail } from "@/components/audit-detail";

const props = {
  fields: [{ label: "Server", value: "main" }],
  changes: [{ key: "groupId", label: "Group", from: "Whitelist", to: "SuperAdmin" }],
  plainChanges: [{ label: "Expires", value: "01/01/2026" }],
  raw: { server: "main", changes: { groupId: { from: "g1", to: "g2" } } },
};

test("renders fields, from-to change rows and plain changes", () => {
  render(<AuditDetail {...props} />);
  expect(screen.getByText("Server")).toBeDefined();
  expect(screen.getByText("main")).toBeDefined();
  expect(screen.getByText("Group")).toBeDefined();
  expect(screen.getByText("Whitelist")).toBeDefined();
  expect(screen.getByText("SuperAdmin")).toBeDefined();
  expect(screen.getByText("Expires")).toBeDefined();
});

test("show raw toggles the JSON block", () => {
  render(<AuditDetail {...props} />);
  expect(screen.queryByText(/"groupId"/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show raw" }));
  expect(screen.getByText(/"groupId"/)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Hide raw" }));
  expect(screen.queryByText(/"groupId"/)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/audit-detail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/web/components/audit-detail.tsx` (markup ported from page.tsx 2361-2417, minus the computation):

```tsx
"use client";

import { Fragment, useState } from "react";

export type AuditField = { label: string; value: string };
export type AuditChange = { key: string; label: string; from: string; to: string };

/**
 * Human-readable audit-detail panel: key-value grid, from -> to change rows,
 * and a collapsible raw-JSON block. Callers precompute the readable strings
 * (id -> name resolution is domain-specific).
 */
export function AuditDetail({
  fields,
  changes,
  plainChanges = [],
  raw,
}: {
  fields: AuditField[];
  changes: AuditChange[];
  plainChanges?: AuditField[];
  raw: unknown;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="rounded-sm border border-border bg-bg-secondary/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">Details</h3>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          {showRaw ? "Hide raw" : "Show raw"}
        </button>
      </div>

      {fields.length > 0 && (
        <dl className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
          {fields.map((e) => (
            <Fragment key={e.label}>
              <dt className="font-medium text-text-muted">{e.label}</dt>
              <dd className="break-words text-text-primary">{e.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {changes.length > 0 && (
        <div className={fields.length > 0 ? "mt-3" : ""}>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Changes</div>
          <div className="space-y-1.5">
            {changes.map((c) => (
              <div key={c.key} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-[5rem] font-medium text-text-muted">{c.label}</span>
                <span className="text-text-secondary">{c.from}</span>
                <span className="text-text-muted">→</span>
                <span className="font-medium text-text-primary">{c.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {plainChanges.length > 0 && (
        <dl className="mt-3 grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
          {plainChanges.map((e) => (
            <Fragment key={e.label}>
              <dt className="font-medium text-text-muted">{e.label}</dt>
              <dd className="break-words text-text-primary">{e.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {showRaw && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap border-t border-border/50 pt-3 font-mono text-xs text-text-muted">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/audit-detail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/audit-detail.tsx packages/web/test/audit-detail.test.tsx
git commit -m "feat(web): add shared AuditDetail renderer composite"
```

### Task 5: ActivityTab on DataTable (server pagination + expandable AuditDetail)

Rebuild the activity tab (page.tsx 2420-2663) as `activity-tab.tsx`: FilterBar hosts the action/user/date filters with removable chips; the table becomes DataTable-v2 with `serverPagination` (50/page, server-side via `getAuditLogs`) and `renderDetail` feeding the shared AuditDetail; the raw-palette action badges (`bg-red-500/15 text-red-400` etc.) become `StatusBadge tone={getActionTone(...)}`. Also adds the pure adapter `wlAuditDetailProps` to `lib.ts` (ports the detail-splitting from the old `ActivityDetail`, page.tsx 2343-2359).

**Files:**
- Modify: `packages/web/app/(protected)/whitelist/lib.ts` (append `wlAuditDetailProps`)
- Create: `packages/web/app/(protected)/whitelist/activity-tab.tsx`
- Create: `packages/web/test/whitelist-activity-tab.test.tsx`

**Interfaces:**
- Consumes: `DataTable` (+ Task 1 props), `AuditDetail` (Task 4), `StatusBadge` (tone prop), `FilterBar`, lib helpers (Task 3), `useAutoRefresh`, `formatRelativeTime`/`formatDateTime`, `getAuditLogs`.
- Produces:
  - lib: `wlAuditDetailProps(log: AuditLogEntry, groups: AdminGroup[], clans: Clan[]): { fields: AuditField[]; changes: AuditChange[]; plainChanges: AuditField[]; raw: unknown }` (types from `@/components/audit-detail`).
  - Default export `ActivityTab({ token, groups, clans, api? }: { token: string | null; groups: AdminGroup[]; clans: Clan[]; api?: ActivityApi })` where `ActivityApi = { getAuditLogs: typeof getAuditLogs }`.

- [ ] **Step 1: Write the failing tests**

Append one test to `packages/web/test/whitelist-lib.test.ts`:

```ts
import { wlAuditDetailProps } from "@/app/(protected)/whitelist/lib";

test("wlAuditDetailProps splits detail into fields, from-to and plain changes", () => {
  const log: AuditLogEntry = {
    id: "1", userId: "u", userName: "Ole", action: "whitelist.update",
    resource: "WhitelistEntry", resourceId: "e1", createdAt: "",
    detail: { server: "main", changes: { groupId: { from: "g1", to: "g2" } } },
  };
  const p = wlAuditDetailProps(log, groups, clans);
  expect(p.fields).toEqual([{ label: "Server", value: "main" }]);
  expect(p.changes).toEqual([
    { key: "groupId", label: "Group", from: "Whitelist", to: "SuperAdmin" },
  ]);
  expect(p.plainChanges).toEqual([]);
  expect(p.raw).toBe(log.detail);

  const bulk: AuditLogEntry = {
    ...log,
    action: "whitelist.bulk_update",
    detail: { count: 3, changes: { groupId: "g2" } },
  };
  const bp = wlAuditDetailProps(bulk, groups, clans);
  expect(bp.changes).toEqual([]);
  expect(bp.plainChanges).toEqual([{ label: "Group", value: "SuperAdmin" }]);
});
```

Create `packages/web/test/whitelist-activity-tab.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ActivityTab from "@/app/(protected)/whitelist/activity-tab";
import type { AdminGroup, AuditLogEntry, Clan } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [];

const log: AuditLogEntry = {
  id: "L1", userId: "u1", userName: "Ole", action: "whitelist.add",
  resource: "WhitelistEntry", resourceId: "e1",
  detail: { name: "Olie", server: "main" },
  createdAt: new Date().toISOString(),
};

function makeApi(items: AuditLogEntry[], total = items.length) {
  return {
    getAuditLogs: mock(() =>
      Promise.resolve({
        success: true as const,
        data: { items, total, page: 1, limit: 50, hasNext: false },
      }),
    ),
  };
}

test("renders rows with tone badges and summaries", async () => {
  render(<ActivityTab token="tok" groups={groups} clans={clans} api={makeApi([log])} />);
  expect(await screen.findByText("Ole")).toBeDefined();
  expect(screen.getByText("add")).toBeDefined();
  expect(screen.getByText("add").className).toContain("text-success");
  expect(screen.getByText("Added Olie on main")).toBeDefined();
  expect(screen.getByText("1 total")).toBeDefined();
});

test("expanding a row shows the AuditDetail panel", async () => {
  render(<ActivityTab token="tok" groups={groups} clans={clans} api={makeApi([log])} />);
  await screen.findByText("Ole");
  fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
  expect(screen.getByText("Details")).toBeDefined();
  expect(screen.getByText("Server")).toBeDefined();
  expect(screen.getByRole("button", { name: "Show raw" })).toBeDefined();
});

test("action filter refetches page 1 and renders a removable chip", async () => {
  const api = makeApi([log]);
  render(<ActivityTab token="tok" groups={groups} clans={clans} api={api} />);
  await screen.findByText("Ole");
  fireEvent.change(screen.getByDisplayValue("All actions"), {
    target: { value: "whitelist.delete" },
  });
  await waitFor(() => {
    const lastCall = api.getAuditLogs.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(lastCall.action).toBe("whitelist.delete");
    expect(lastCall.page).toBe(1);
  });
  expect(screen.getByText("Action: Delete")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Remove filter Action: Delete" }));
  await waitFor(() => {
    const lastCall = api.getAuditLogs.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(lastCall.action).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-lib.test.ts test/whitelist-activity-tab.test.tsx`
Expected: lib test FAILS (`wlAuditDetailProps` not exported); tab test FAILS (module not found). Existing lib tests still pass.

- [ ] **Step 3: Append `wlAuditDetailProps` to lib.ts**

```ts
import type { AuditChange, AuditField } from "@/components/audit-detail";

// Split an audit log's detail into the AuditDetail renderer's inputs.
export function wlAuditDetailProps(
  log: AuditLogEntry,
  groups: AdminGroup[],
  clans: Clan[],
): { fields: AuditField[]; changes: AuditChange[]; plainChanges: AuditField[]; raw: unknown } {
  const detail = (log.detail || {}) as Record<string, unknown>;
  const { changes, ...rest } = detail;
  const fields = Object.entries(rest).map(([k, v]) => ({
    label: WL_DETAIL_LABELS[k] ?? k,
    value: wlReadableValue(k, v, groups, clans),
  }));
  const fromTo = wlReadableChanges(changes, groups, clans);
  // bulk_update stores `changes` as a plain map of new values (not from/to pairs)
  const plainChanges =
    fromTo.length === 0 && changes && typeof changes === "object"
      ? Object.entries(changes as Record<string, unknown>).map(([k, v]) => ({
          label: WL_DETAIL_LABELS[k] ?? k,
          value: wlReadableValue(k, v, groups, clans),
        }))
      : [];
  return { fields, changes: fromTo, plainChanges, raw: log.detail };
}
```

- [ ] **Step 4: Implement the tab**

Create `packages/web/app/(protected)/whitelist/activity-tab.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { getAuditLogs } from "@/lib/api-client";
import type { AdminGroup, AuditLogEntry, Clan } from "shared";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { DataTable } from "@/components/data-table-v2";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { AuditDetail } from "@/components/audit-detail";
import { EmptyState } from "@/components/empty-state";
import {
  ACTION_OPTIONS,
  getActionLabel,
  getActionTone,
  getDetailSummary,
  wlAuditDetailProps,
} from "./lib";

const PAGE_SIZE = 50;

export interface ActivityApi {
  getAuditLogs: typeof getAuditLogs;
}

const defaultApi: ActivityApi = { getAuditLogs };

export default function ActivityTab({
  token,
  groups,
  clans,
  api = defaultApi,
}: {
  token: string | null;
  groups: AdminGroup[];
  clans: Clan[];
  api?: ActivityApi;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await api.getAuditLogs(token, {
      page,
      limit: PAGE_SIZE,
      resource: "WhitelistEntry",
      action: actionFilter || undefined,
      userId: userSearch || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    });
    if (res.success && res.data) {
      setLogs(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [token, api, page, actionFilter, userSearch, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useAutoRefresh(fetchLogs, 20_000, !!token);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const activeFilters: ActiveFilter[] = [];
  if (actionFilter) {
    const label = ACTION_OPTIONS.find((o) => o.value === actionFilter)?.label ?? actionFilter;
    activeFilters.push({ key: "action", label: `Action: ${label}` });
  }
  if (userSearch) activeFilters.push({ key: "user", label: `User: ${userSearch}` });
  if (fromDate) activeFilters.push({ key: "from", label: `From: ${fromDate}` });
  if (toDate) activeFilters.push({ key: "to", label: `To: ${toDate}` });

  function clearFilter(key: string) {
    if (key === "action") setActionFilter("");
    if (key === "user") setUserSearch("");
    if (key === "from") setFromDate("");
    if (key === "to") setToDate("");
    setPage(1);
  }

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(
    () => [
      {
        id: "time",
        header: "Time",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary" title={formatDateTime(row.original.createdAt)}>
            {formatRelativeTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "user",
        header: "User",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs font-medium text-text-primary">{row.original.userName}</span>
        ),
      },
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge tone={getActionTone(row.original.action)}>
            {getActionLabel(row.original.action)}
          </StatusBadge>
        ),
      },
      {
        id: "details",
        header: "Details",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary">
            {getDetailSummary(row.original, groups, clans)}
          </span>
        ),
      },
    ],
    [groups, clans],
  );

  return (
    <>
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={clearFilter}
        onClearAll={() => {
          setActionFilter("");
          setUserSearch("");
          setFromDate("");
          setToDate("");
          setPage(1);
        }}
      >
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={userSearch}
          onChange={(e) => { setUserSearch(e.target.value); setPage(1); }}
          placeholder="User ID..."
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          title="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          title="To date"
        />
        <span className="ml-auto text-xs text-text-muted">{total} total</span>
      </FilterBar>

      <DataTable
        columns={columns}
        data={logs}
        getRowId={(l) => l.id}
        loading={loading && logs.length === 0}
        skeletonRows={8}
        serverPagination={{ page, totalPages, onPageChange: setPage }}
        emptyState={<EmptyState className="py-8" message="No activity logs found." />}
        renderDetail={(log) =>
          log.detail ? (
            <AuditDetail {...wlAuditDetailProps(log, groups, clans)} />
          ) : (
            <p className="text-xs text-text-muted">No details recorded.</p>
          )
        }
      />
    </>
  );
}
```

(Deviation note for the reviewer: the old table expanded via whole-row click and hid the chevron for detail-less rows; DataTable's expander column shows a chevron per row — detail-less rows expand to a "No details recorded." line. This is the DataTable idiom sanctioned in Global Constraints.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-lib.test.ts test/whitelist-activity-tab.test.tsx && bunx tsc --noEmit`
Expected: PASS, tsc clean, zero warnings.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/lib.ts" "packages/web/app/(protected)/whitelist/activity-tab.tsx" packages/web/test/whitelist-lib.test.ts packages/web/test/whitelist-activity-tab.test.tsx
git commit -m "feat(web): rebuild whitelist activity tab on DataTable with AuditDetail"
```

### Task 6: RequestsTab

Extract the candidates queue (page.tsx 1838-1935) verbatim onto the design system: cards keep their layout; the empty state becomes `EmptyState`; approve failures (silent today) toast via injected `notify`.

**Files:**
- Create: `packages/web/app/(protected)/whitelist/requests-tab.tsx`
- Create: `packages/web/test/whitelist-requests-tab.test.tsx`

**Interfaces:**
- Consumes: `addWhitelistEntry`, `EmptyState`, `Button`, `toastError`.
- Produces: default export
  `RequestsTab({ candidates, groups, onApproved, dismissed, setDismissed, token, canManage, activeServer, api?, notify? })` with types:
  `candidates: WhitelistCandidate[]; groups: AdminGroup[]; onApproved: (entry: WhitelistEntry) => void; dismissed: Set<string>; setDismissed: React.Dispatch<React.SetStateAction<Set<string>>>; token: string | null; canManage: boolean; activeServer: string; api?: { addWhitelistEntry: typeof addWhitelistEntry }; notify?: { error: (e: string | null | undefined, fallback?: string) => void }`.
  (Signature change vs the old props: the parent no longer hands `entries`/`setEntries` down — approval reports the created entry up via `onApproved`, and the page prepends it. Same net behavior.)

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/whitelist-requests-tab.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RequestsTab from "@/app/(protected)/whitelist/requests-tab";
import type { AdminGroup, WhitelistCandidate } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Seeder", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const candidate: WhitelistCandidate = {
  userId: "u1",
  discordName: "Olie",
  steamId: "76561198000000001",
  roleName: "Member",
};

function baseProps(over: Record<string, unknown> = {}) {
  return {
    candidates: [candidate],
    groups,
    onApproved: mock(() => {}),
    dismissed: new Set<string>(),
    setDismissed: mock(() => {}),
    token: "tok",
    canManage: true,
    activeServer: "main",
    notify: { error: mock(() => {}) },
    ...over,
  };
}

test("approve posts the entry with the chosen group and reports up", async () => {
  const api = {
    addWhitelistEntry: mock(() =>
      Promise.resolve({ success: true as const, data: { id: "e9" } as never }),
    ),
  };
  const props = baseProps({ api });
  render(<RequestsTab {...(props as never)} />);
  fireEvent.change(screen.getByDisplayValue("Whitelist (default)"), {
    target: { value: "g1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(props.onApproved).toHaveBeenCalled());
  expect(api.addWhitelistEntry).toHaveBeenCalledWith("tok", "76561198000000001", {
    name: "Olie",
    groupId: "g1",
    server: "main",
  });
  expect(props.setDismissed).toHaveBeenCalled();
});

test("failed approve toasts and does not dismiss", async () => {
  const api = {
    addWhitelistEntry: mock(() =>
      Promise.resolve({ success: false as const, error: "Steam ID already whitelisted" }),
    ),
  };
  const props = baseProps({ api });
  render(<RequestsTab {...(props as never)} />);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(props.notify.error).toHaveBeenCalledWith(
      "Steam ID already whitelisted",
      "Failed to approve request",
    ),
  );
  expect(props.setDismissed).not.toHaveBeenCalled();
});

test("no candidates renders the empty state; no permission renders the notice", () => {
  render(<RequestsTab {...(baseProps({ candidates: [] }) as never)} />);
  expect(screen.getByText(/No pending whitelist requests/)).toBeDefined();
  render(<RequestsTab {...(baseProps({ canManage: false }) as never)} />);
  expect(screen.getByText(/manage:whitelist permission/)).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-requests-tab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/web/app/(protected)/whitelist/requests-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { addWhitelistEntry } from "@/lib/api-client";
import type { AdminGroup, WhitelistCandidate, WhitelistEntry } from "shared";
import { toastError } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export interface RequestsApi {
  addWhitelistEntry: typeof addWhitelistEntry;
}
export interface RequestsNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: RequestsApi = { addWhitelistEntry };
const defaultNotify: RequestsNotify = { error: toastError };

export default function RequestsTab({
  candidates,
  groups,
  onApproved,
  dismissed: _dismissed,
  setDismissed,
  token,
  canManage,
  activeServer,
  api = defaultApi,
  notify = defaultNotify,
}: {
  candidates: WhitelistCandidate[];
  groups: AdminGroup[];
  onApproved: (entry: WhitelistEntry) => void;
  dismissed: Set<string>;
  setDismissed: React.Dispatch<React.SetStateAction<Set<string>>>;
  token: string | null;
  canManage: boolean;
  activeServer: string;
  api?: RequestsApi;
  notify?: RequestsNotify;
}) {
  const [approving, setApproving] = useState<string | null>(null);
  const [approveGroupId, setApproveGroupId] = useState<Record<string, string>>({});

  async function handleApprove(candidate: WhitelistCandidate) {
    if (!token) return;
    setApproving(candidate.userId);

    const groupId = approveGroupId[candidate.userId] || undefined;
    const res = await api.addWhitelistEntry(token, candidate.steamId, {
      name: candidate.discordName,
      groupId,
      server: activeServer,
    });

    if (res.success && res.data) {
      onApproved(res.data);
      setDismissed((prev) => new Set(prev).add(candidate.userId));
    } else {
      notify.error(res.error, "Failed to approve request");
    }
    setApproving(null);
  }

  function handleDismiss(userId: string) {
    setDismissed((prev) => new Set(prev).add(userId));
  }

  if (!canManage) {
    return (
      <div className="py-8 text-center text-text-muted">
        You need manage:whitelist permission to view requests.
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="facet-border rounded-sm bg-bg-card">
        <EmptyState message="No pending whitelist requests. Users with a qualifying Discord role and linked Steam ID will appear here." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => (
        <div key={c.userId} className="facet-border flex items-center justify-between rounded-sm bg-bg-card p-4">
          <div>
            <div className="mb-1 font-medium text-text-primary">{c.discordName}</div>
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <code className="font-mono text-accent">{c.steamId}</code>
              <span className="h-1 w-1 rounded-full bg-text-muted" />
              <span>Role: {c.roleName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={approveGroupId[c.userId] || ""}
              onChange={(e) =>
                setApproveGroupId((prev) => ({ ...prev, [c.userId]: e.target.value }))
              }
              className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Whitelist (default)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => handleApprove(c)}
              disabled={approving === c.userId}
              className="rounded-sm bg-success/15 px-4 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/25 disabled:opacity-50"
            >
              {approving === c.userId ? "Approving..." : "Approve"}
            </button>
            <Button variant="ghost" size="xs" onClick={() => handleDismiss(c.userId)}>
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-requests-tab.test.tsx && bunx tsc --noEmit`
Expected: PASS (3 tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/requests-tab.tsx" packages/web/test/whitelist-requests-tab.test.tsx
git commit -m "feat(web): extract whitelist requests tab with approve toasts"
```

### Task 7: GroupsTab + ClansTab

Two verbatim CRUD extractions (page.tsx 1941-2139 and 2145-2275). Presentational deltas only: `Input`/`Button` primitives for the form fields and primary actions, `EmptyState` for the empty lists; the permission chips stay button-chips (already tokenized); inline Confirm/Cancel delete flows stay inline (behavior preservation). Delete/save failures that were silent get `notify.error` toasts.

**Files:**
- Create: `packages/web/app/(protected)/whitelist/groups-tab.tsx`
- Create: `packages/web/app/(protected)/whitelist/clans-tab.tsx`
- Create: `packages/web/test/whitelist-groups-clans-tabs.test.tsx`

**Interfaces:**
- Produces:
  - Default export `GroupsTab({ groups, setGroups, token, canManage, api?, notify? })` — `groups: AdminGroup[]; setGroups: React.Dispatch<React.SetStateAction<AdminGroup[]>>; token: string | null; canManage: boolean; api?: { createAdminGroup: typeof createAdminGroup; updateAdminGroup: typeof updateAdminGroup; deleteAdminGroup: typeof deleteAdminGroup }; notify?: { error: (e: string | null | undefined, fallback?: string) => void }`.
  - Default export `ClansTab({ clans, setClans, token, canManage, api?, notify? })` — same shape over `createClan/updateClan/deleteClan`.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/whitelist-groups-clans-tabs.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import GroupsTab from "@/app/(protected)/whitelist/groups-tab";
import ClansTab from "@/app/(protected)/whitelist/clans-tab";
import type { AdminGroup, Clan } from "shared";

const group: AdminGroup = { id: "g1", name: "Whitelist", permissions: "reserve,balance", sortOrder: 2, createdAt: "" };
const clan: Clan = { id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" };
const noopNotify = () => ({ error: mock(() => {}) });

test("GroupsTab creates a group with joined permissions", async () => {
  const api = {
    createAdminGroup: mock(() =>
      Promise.resolve({ success: true as const, data: { ...group, id: "g2", name: "Seeder" } }),
    ),
    updateAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
  };
  const setGroups = mock(() => {});
  render(
    <GroupsTab groups={[group]} setGroups={setGroups} token="tok" canManage api={api} notify={noopNotify()} />,
  );
  fireEvent.change(screen.getByPlaceholderText("Group name (e.g. Whitelist)"), {
    target: { value: "Seeder" },
  });
  fireEvent.click(screen.getByRole("button", { name: "reserve" }));
  fireEvent.click(screen.getByRole("button", { name: "kick" }));
  fireEvent.click(screen.getByRole("button", { name: /Create Group/ }));
  await waitFor(() => expect(setGroups).toHaveBeenCalled());
  const sent = api.createAdminGroup.mock.calls[0][1] as { name: string; permissions: string; sortOrder: number };
  expect(sent.name).toBe("Seeder");
  expect(sent.permissions.split(",").sort()).toEqual(["kick", "reserve"]);
});

test("GroupsTab delete requires the inline confirm and toasts failure", async () => {
  const notify = noopNotify();
  const api = {
    createAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    updateAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteAdminGroup: mock(() =>
      Promise.resolve({ success: false as const, error: "Group in use" }),
    ),
  };
  render(
    <GroupsTab groups={[group]} setGroups={mock(() => {})} token="tok" canManage api={api} notify={notify} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(api.deleteAdminGroup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith("Group in use", "Failed to delete group"),
  );
});

test("ClansTab creates and renders tag chips", async () => {
  const api = {
    createClan: mock(() =>
      Promise.resolve({ success: true as const, data: { ...clan, id: "c2", name: "Second", tag: "2ND" } }),
    ),
    updateClan: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteClan: mock(() => Promise.resolve({ success: false as const, error: "x" })),
  };
  const setClans = mock(() => {});
  render(
    <ClansTab clans={[clan]} setClans={setClans} token="tok" canManage api={api} notify={noopNotify()} />,
  );
  expect(screen.getByText("[RB]")).toBeDefined();
  fireEvent.change(screen.getByPlaceholderText("Clan name (e.g. Royal Battalion)"), {
    target: { value: "Second" },
  });
  fireEvent.change(screen.getByPlaceholderText("Tag (e.g. RB)"), { target: { value: "2ND" } });
  fireEvent.click(screen.getByRole("button", { name: /Create Clan/ }));
  await waitFor(() => expect(setClans).toHaveBeenCalled());
  expect(api.createClan).toHaveBeenCalledWith("tok", { name: "Second", tag: "2ND" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-groups-clans-tabs.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement GroupsTab**

Create `packages/web/app/(protected)/whitelist/groups-tab.tsx` — port page.tsx 1941-2139 with these EXACT deltas: props renamed (`apiToken` → `token`, add `api`/`notify` DI), api calls via `api.*`, failures toast (`notify.error(res.error, "Failed to create group" | "Failed to update group" | "Failed to delete group")` — create/update keep their inline error text AND do not toast; only the previously-silent delete gains a toast), form inputs become `Input`, primary submit becomes `Button variant="gold"`, empty list becomes `EmptyState` inside the facet card:

```tsx
"use client";

import { useState } from "react";
import {
  createAdminGroup,
  deleteAdminGroup,
  updateAdminGroup,
} from "@/lib/api-client";
import type { AdminGroup } from "shared";
import { toastError } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { SQUAD_PERMISSIONS } from "./lib";

export interface GroupsApi {
  createAdminGroup: typeof createAdminGroup;
  updateAdminGroup: typeof updateAdminGroup;
  deleteAdminGroup: typeof deleteAdminGroup;
}
export interface GroupsNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: GroupsApi = { createAdminGroup, updateAdminGroup, deleteAdminGroup };
const defaultNotify: GroupsNotify = { error: toastError };

function PermCheckboxes({
  perms,
  setPerms,
  disabled,
}: {
  perms: Set<string>;
  setPerms: (fn: (prev: Set<string>) => Set<string>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SQUAD_PERMISSIONS.map((p) => {
        const active = perms.has(p);
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() =>
              setPerms((prev) => {
                const next = new Set(prev);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                return next;
              })
            }
            className={`rounded-sm border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors ${
              active
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border bg-bg-tertiary text-text-muted hover:border-accent/20"
            } ${disabled ? "cursor-default opacity-60" : ""}`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

export default function GroupsTab({
  groups,
  setGroups,
  token,
  canManage,
  api = defaultApi,
  notify = defaultNotify,
}: {
  groups: AdminGroup[];
  setGroups: React.Dispatch<React.SetStateAction<AdminGroup[]>>;
  token: string | null;
  canManage: boolean;
  api?: GroupsApi;
  notify?: GroupsNotify;
}) {
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [newOrder, setNewOrder] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editOrder, setEditOrder] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await api.createAdminGroup(token, {
      name: newName.trim(),
      permissions: Array.from(newPerms).join(","),
      sortOrder: newOrder,
    });

    if (res.success && res.data) {
      setGroups((prev) => [...prev, res.data!].sort((a, b) => a.sortOrder - b.sortOrder));
      setNewName("");
      setNewPerms(new Set());
      setNewOrder(0);
    } else {
      setAddError(res.error || "Failed to create group");
    }
    setAdding(false);
  }

  function startEdit(g: AdminGroup) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditPerms(new Set(g.permissions.split(",").filter(Boolean)));
    setEditOrder(g.sortOrder);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!token) return;
    setEditError(null);

    const res = await api.updateAdminGroup(token, id, {
      name: editName.trim(),
      permissions: Array.from(editPerms).join(","),
      sortOrder: editOrder,
    });

    if (res.success && res.data) {
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? res.data! : g)).sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update group");
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    const res = await api.deleteAdminGroup(token, id);
    if (res.success) {
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setDeletingId(null);
    } else {
      notify.error(res.error, "Failed to delete group");
    }
  }

  return (
    <>
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 rounded-sm bg-bg-card p-4">
          <div className="mb-3 flex flex-wrap gap-3">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group name (e.g. Whitelist)"
              className="flex-1"
              required
            />
            <div className="flex items-center gap-1.5">
              <label className="whitespace-nowrap text-xs text-text-muted" htmlFor="wl-group-priority">
                Priority
              </label>
              <Input
                id="wl-group-priority"
                type="number"
                value={newOrder}
                onChange={(e) => setNewOrder(Number(e.target.value))}
                className="w-16 text-center"
                title="Lower number = higher priority in admins.cfg"
              />
            </div>
            <Button type="submit" variant="gold" disabled={adding}>
              {adding ? "Creating..." : "Create Group"}
            </Button>
          </div>
          <PermCheckboxes perms={newPerms} setPerms={setNewPerms} />
          {addError && <div className="mt-2 text-sm text-danger">{addError}</div>}
        </form>
      )}

      {groups.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card">
          <EmptyState message="No admin groups defined yet. Create groups like Whitelist, Admin, SuperAdmin to use in the admins.cfg." />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isEditing = editingId === g.id;
            return (
              <div key={g.id} className="facet-border rounded-sm bg-bg-card p-4">
                {isEditing ? (
                  <div>
                    <div className="mb-3 flex flex-wrap gap-3">
                      <Input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1.5">
                        <label className="whitespace-nowrap text-xs text-text-muted">Priority</label>
                        <Input
                          type="number"
                          value={editOrder}
                          onChange={(e) => setEditOrder(Number(e.target.value))}
                          className="w-16 text-center"
                          title="Lower number = higher priority in admins.cfg"
                        />
                      </div>
                      <Button variant="gold" size="sm" onClick={() => saveEdit(g.id)}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                    <PermCheckboxes perms={editPerms} setPerms={setEditPerms} />
                    {editError && <div className="mt-2 text-sm text-danger">{editError}</div>}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-base font-semibold tracking-wide text-text-primary">
                          {g.name}
                        </h3>
                        <span className="text-xs text-text-muted" title="Priority order in admins.cfg (lower = first)">
                          Priority {g.sortOrder}
                        </span>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(g)} className="text-xs text-text-muted transition-colors hover:text-accent">
                            Edit
                          </button>
                          {deletingId === g.id ? (
                            <>
                              <button onClick={() => handleDelete(g.id)} className="text-xs text-danger transition-colors hover:text-danger/80">
                                Confirm
                              </button>
                              <button onClick={() => setDeletingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setDeletingId(g.id)} className="text-xs text-text-muted transition-colors hover:text-danger">
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.permissions.split(",").filter(Boolean).map((p) => (
                        <span key={p} className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-accent">
                          {p}
                        </span>
                      ))}
                      {!g.permissions && <span className="text-xs text-text-muted">No permissions</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Implement ClansTab**

Create `packages/web/app/(protected)/whitelist/clans-tab.tsx` — same treatment of page.tsx 2145-2275:

```tsx
"use client";

import { useState } from "react";
import { createClan, deleteClan, updateClan } from "@/lib/api-client";
import type { Clan } from "shared";
import { toastError } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";

export interface ClansApi {
  createClan: typeof createClan;
  updateClan: typeof updateClan;
  deleteClan: typeof deleteClan;
}
export interface ClansNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: ClansApi = { createClan, updateClan, deleteClan };
const defaultNotify: ClansNotify = { error: toastError };

export default function ClansTab({
  clans,
  setClans,
  token,
  canManage,
  api = defaultApi,
  notify = defaultNotify,
}: {
  clans: Clan[];
  setClans: React.Dispatch<React.SetStateAction<Clan[]>>;
  token: string | null;
  canManage: boolean;
  api?: ClansApi;
  notify?: ClansNotify;
}) {
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTag, setEditTag] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim() || !newTag.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await api.createClan(token, { name: newName.trim(), tag: newTag.trim() });
    if (res.success && res.data) {
      setClans((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewTag("");
    } else {
      setAddError(res.error || "Failed to create clan");
    }
    setAdding(false);
  }

  function startEdit(c: Clan) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditTag(c.tag);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!token) return;
    setEditError(null);

    const res = await api.updateClan(token, id, { name: editName.trim(), tag: editTag.trim() });
    if (res.success && res.data) {
      setClans((prev) =>
        prev.map((c) => (c.id === id ? res.data! : c)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update clan");
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    const res = await api.deleteClan(token, id);
    if (res.success) {
      setClans((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
    } else {
      notify.error(res.error, "Failed to delete clan");
    }
  }

  return (
    <>
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 rounded-sm bg-bg-card p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Clan name (e.g. Royal Battalion)"
              className="flex-1"
              required
            />
            <Input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Tag (e.g. RB)"
              className="w-24"
              required
            />
            <Button type="submit" variant="gold" disabled={adding}>
              {adding ? "Creating..." : "Create Clan"}
            </Button>
          </div>
          {addError && <div className="mt-2 text-sm text-danger">{addError}</div>}
        </form>
      )}

      {clans.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card">
          <EmptyState message="No clans defined yet. Create clans to organize whitelist entries and manage team switching." />
        </div>
      ) : (
        <div className="space-y-3">
          {clans.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} className="facet-border rounded-sm bg-bg-card p-4">
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value)}
                      className="w-24"
                    />
                    <Button variant="gold" size="sm" onClick={() => saveEdit(c.id)}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    {editError && <span className="text-sm text-danger">{editError}</span>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs font-medium tracking-wide text-accent">
                        [{c.tag}]
                      </span>
                      <h3 className="font-display text-base font-semibold tracking-wide text-text-primary">
                        {c.name}
                      </h3>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(c)} className="text-xs text-text-muted transition-colors hover:text-accent">
                          Edit
                        </button>
                        {deletingId === c.id ? (
                          <>
                            <button onClick={() => handleDelete(c.id)} className="text-xs text-danger transition-colors hover:text-danger/80">
                              Confirm
                            </button>
                            <button onClick={() => setDeletingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setDeletingId(c.id)} className="text-xs text-text-muted transition-colors hover:text-danger">
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-groups-clans-tabs.test.tsx && bunx tsc --noEmit`
Expected: PASS (3 tests), tsc clean.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/groups-tab.tsx" "packages/web/app/(protected)/whitelist/clans-tab.tsx" packages/web/test/whitelist-groups-clans-tabs.test.tsx
git commit -m "feat(web): extract whitelist groups and clans tabs"
```

### Task 8: EntryProfileDialog

The entry profile modal (page.tsx 1414-1701 with handlers 507-695) becomes a self-contained Dialog component: info grid on `DescriptionList`/`InfoField`, Steam ID via shared `CopyableId`, expiry via the Task 2 StatusBadge variants, comments, the collapsible per-entry activity list (verbatim inline expandable changes, now using lib helpers), edit mode, and the two-step delete. The dialog owns playtime fetching and its own working copy of the entry; the parent learns about table-relevant mutations via `onUpdated`/`onDeleted`. Consolidation note (deviation for the reviewer): the profile's private `fieldLabels`/`formatFieldValue` pair is replaced by lib's `wlReadableChanges` — the only visible difference is the `clanId` row label ("Clan link" → dropped when a `clan` change is present, else "Clan").

**Files:**
- Create: `packages/web/app/(protected)/whitelist/entry-profile-dialog.tsx`
- Create: `packages/web/test/whitelist-entry-profile-dialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` (controlled `open`/`onOpenChange`), `DescriptionList`/`InfoField`, `CopyableId`, `StatusBadge` (+`formatExpiry`), `Skeleton`, `Input`/`Button`, lib helpers (`getActionVerb`, `wlReadableChanges`), `formatDate`/`formatRelativeTime`, api functions.
- Produces: default export
  ```ts
  EntryProfileDialog({ entry, onClose, groups, clans, token, canManage, onUpdated, onDeleted, api?, notify? }: {
    entry: WhitelistEntryWithComments | null; // parent fetched; null = closed
    onClose: () => void;
    groups: AdminGroup[]; clans: Clan[];
    token: string | null; canManage: boolean;
    onUpdated: (entry: WhitelistEntry) => void;   // parent patches the table row
    onDeleted: (id: string) => void;              // parent removes the row (dialog calls onClose itself)
    api?: ProfileDialogApi; notify?: { error: (e: string | null | undefined, fallback?: string) => void };
  })
  ```
  with `ProfileDialogApi = { updateWhitelistEntry: typeof updateWhitelistEntry; deleteWhitelistEntry: typeof deleteWhitelistEntry; getWhitelistEntry: typeof getWhitelistEntry; addWhitelistComment: typeof addWhitelistComment; deleteWhitelistComment: typeof deleteWhitelistComment; getPlaytime: typeof getPlaytime; getAuditLogs: typeof getAuditLogs }`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/whitelist-entry-profile-dialog.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EntryProfileDialog from "@/app/(protected)/whitelist/entry-profile-dialog";
import type { AdminGroup, Clan, WhitelistEntryWithComments } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
  { id: "g2", name: "SuperAdmin", permissions: "ban", sortOrder: 0, createdAt: "" },
];
const clans: Clan[] = [{ id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" }];

const entry: WhitelistEntryWithComments = {
  id: "e1", steamId: "76561198000000001", server: "main", name: "Olie",
  clan: "RB", clanId: "c1", clanName: "Royal Battalion", role: null,
  groupId: "g1", groupName: "Whitelist", userId: null, addedBy: "raw-id",
  addedByName: "Royal Secretary Bot", reason: null, expiresAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  comments: [
    { id: "cm1", whitelistEntryId: "e1", authorId: "a", authorName: "Ole", text: "vip", createdAt: new Date().toISOString() },
  ],
};

function makeApi(over: Record<string, unknown> = {}) {
  return {
    updateWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: { ...entry, name: "Renamed" } })),
    deleteWhitelistEntry: mock(() => Promise.resolve({ success: true as const })),
    getWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: { ...entry, name: "Renamed" } })),
    addWhitelistComment: mock(() => Promise.resolve({ success: true as const, data: { id: "cm2", whitelistEntryId: "e1", authorId: "a", authorName: "Ole", text: "hello", createdAt: new Date().toISOString() } })),
    deleteWhitelistComment: mock(() => Promise.resolve({ success: true as const })),
    getPlaytime: mock(() => Promise.resolve({ success: true as const, data: { steamId: entry.steamId, playtime30: 12, playtime90: 40, seed30: 2, seed90: 6 } })),
    getAuditLogs: mock(() => Promise.resolve({ success: true as const, data: { items: [], total: 0, page: 1, limit: 50, hasNext: false } })),
    ...over,
  };
}

function baseProps(over: Record<string, unknown> = {}) {
  return {
    entry,
    onClose: mock(() => {}),
    groups,
    clans,
    token: "tok",
    canManage: true,
    onUpdated: mock(() => {}),
    onDeleted: mock(() => {}),
    api: makeApi(),
    notify: { error: mock(() => {}) },
    ...over,
  };
}

test("renders identity fields, resolved addedByName, playtime and comments", async () => {
  render(<EntryProfileDialog {...(baseProps() as never)} />);
  expect(screen.getByText("Olie")).toBeDefined();
  expect(screen.getByText("76561198000000001")).toBeDefined();
  expect(screen.getByText("Royal Secretary Bot")).toBeDefined(); // never the raw snowflake
  expect(screen.queryByText("raw-id")).toBeNull();
  expect(screen.getByText("Permanent")).toBeDefined();
  expect(await screen.findByText("12h / 40h")).toBeDefined();
  expect(screen.getByText("2h / 6h")).toBeDefined();
  expect(screen.getByText("Comments (1)")).toBeDefined();
  expect(screen.getByText("vip")).toBeDefined();
});

test("edit mode saves the full payload and reports the updated row up", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as never)} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(props.onUpdated).toHaveBeenCalled());
  const api = props.api as ReturnType<typeof makeApi>;
  const sent = api.updateWhitelistEntry.mock.calls[0] as unknown[];
  expect(sent[1]).toBe("e1");
  expect((sent[2] as { name?: string }).name).toBe("Renamed");
  expect((sent[2] as { clan?: string }).clan).toBe("RB"); // clan tag resolved from clanId
});

test("delete requires the confirm step, then reports up and closes", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as never)} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect((props.api as ReturnType<typeof makeApi>).deleteWhitelistEntry).not.toHaveBeenCalled();
  expect(screen.getByText("Delete this entry?")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith("e1"));
  expect(props.onClose).toHaveBeenCalled();
});

test("adding a comment prepends it; failure toasts", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as never)} />);
  fireEvent.change(screen.getByPlaceholderText("Add a comment..."), { target: { value: "hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByText("hello")).toBeDefined();
  expect(screen.getByText("Comments (2)")).toBeDefined();

  const failing = baseProps({
    api: makeApi({
      addWhitelistComment: mock(() => Promise.resolve({ success: false as const, error: "nope" })),
    }),
  });
  render(<EntryProfileDialog {...(failing as never)} />);
  fireEvent.change(screen.getAllByPlaceholderText("Add a comment...").at(-1)!, { target: { value: "x" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add" }).at(-1)!);
  await waitFor(() =>
    expect(failing.notify.error).toHaveBeenCalledWith("nope", "Failed to add comment"),
  );
});

test("activity section lazy-loads on open", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as never)} />);
  const api = props.api as ReturnType<typeof makeApi>;
  expect(api.getAuditLogs).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Activity/ }));
  await waitFor(() => expect(api.getAuditLogs).toHaveBeenCalled());
  const params = api.getAuditLogs.mock.calls[0][1] as Record<string, unknown>;
  expect(params.resource).toBe("WhitelistEntry");
  expect(params.resourceId).toBe("e1");
  expect(await screen.findByText("No activity recorded.")).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-entry-profile-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/web/app/(protected)/whitelist/entry-profile-dialog.tsx`. Structure and behavior port page.tsx exactly; presentation swaps: Modal → controlled Dialog, `InfoField` grid → `DescriptionList className="gap-4 lg:grid-cols-2" ` with shared `InfoField`, local CopyableId → shared `CopyableId`, expiry spans → `StatusBadge` variants, inputs → `Input`, primary buttons → `Button`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  addWhitelistComment,
  deleteWhitelistComment,
  deleteWhitelistEntry,
  getAuditLogs,
  getPlaytime,
  getWhitelistEntry,
  updateWhitelistEntry,
} from "@/lib/api-client";
import type {
  AdminGroup,
  AuditLogEntry,
  Clan,
  PlaytimeStats,
  WhitelistEntry,
  WhitelistEntryWithComments,
} from "shared";
import { toastError } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DescriptionList, InfoField } from "@/components/description-list";
import { CopyableId } from "@/components/copyable-id";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { formatExpiry, getActionVerb, wlReadableChanges } from "./lib";

export interface ProfileDialogApi {
  updateWhitelistEntry: typeof updateWhitelistEntry;
  deleteWhitelistEntry: typeof deleteWhitelistEntry;
  getWhitelistEntry: typeof getWhitelistEntry;
  addWhitelistComment: typeof addWhitelistComment;
  deleteWhitelistComment: typeof deleteWhitelistComment;
  getPlaytime: typeof getPlaytime;
  getAuditLogs: typeof getAuditLogs;
}
export interface ProfileDialogNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

// Exported: entries-tab reuses these (table expiry cells + merged api default).
export const defaultApi: ProfileDialogApi = {
  updateWhitelistEntry,
  deleteWhitelistEntry,
  getWhitelistEntry,
  addWhitelistComment,
  deleteWhitelistComment,
  getPlaytime,
  getAuditLogs,
};
const defaultNotify: ProfileDialogNotify = { error: toastError };

export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const exp = formatExpiry(expiresAt);
  if (!exp) return <StatusBadge variant="wl-permanent" />;
  if (exp.expired) return <StatusBadge variant="wl-expired" />;
  return <StatusBadge variant="wl-expiring">{exp.label}</StatusBadge>;
}

export default function EntryProfileDialog({
  entry,
  onClose,
  groups,
  clans,
  token,
  canManage,
  onUpdated,
  onDeleted,
  api = defaultApi,
  notify = defaultNotify,
}: {
  entry: WhitelistEntryWithComments | null;
  onClose: () => void;
  groups: AdminGroup[];
  clans: Clan[];
  token: string | null;
  canManage: boolean;
  onUpdated: (entry: WhitelistEntry) => void;
  onDeleted: (id: string) => void;
  api?: ProfileDialogApi;
  notify?: ProfileDialogNotify;
}) {
  const [current, setCurrent] = useState<WhitelistEntryWithComments | null>(entry);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editSteamId, setEditSteamId] = useState("");
  const [editName, setEditName] = useState("");
  const [editClanId, setEditClanId] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(new Set());
  const [playtimeStats, setPlaytimeStats] = useState<PlaytimeStats | null>(null);
  const [playtimeLoading, setPlaytimeLoading] = useState(false);

  // Reset the working copy and per-entry state whenever a new entry opens.
  useEffect(() => {
    setCurrent(entry);
    setEditing(false);
    setConfirmingDelete(false);
    setEditError(null);
    setCommentText("");
    setActivityLogs([]);
    setActivityOpen(false);
    setExpandedActivity(new Set());
    setPlaytimeStats(null);
    if (entry && token) {
      setPlaytimeLoading(true);
      api
        .getPlaytime(token, entry.steamId)
        .then((pt) => {
          if (pt.success && pt.data) setPlaytimeStats(pt.data);
        })
        .finally(() => setPlaytimeLoading(false));
    }
  }, [entry, token, api]);

  function startEdit() {
    if (!current) return;
    setEditSteamId(current.steamId);
    setEditName(current.name || "");
    setEditClanId(current.clanId || "");
    setEditGroupId(current.groupId || "");
    setEditReason(current.reason || "");
    setEditExpiresAt(current.expiresAt ? current.expiresAt.slice(0, 16) : "");
    setEditError(null);
    setEditing(true);
    setConfirmingDelete(false);
  }

  async function saveEdit() {
    if (!token || !current) return;
    setEditError(null);

    const selectedClan = clans.find((c) => c.id === editClanId);
    const res = await api.updateWhitelistEntry(token, current.id, {
      steamId: editSteamId.trim(),
      name: editName.trim() || undefined,
      clanId: editClanId || null,
      clan: selectedClan?.tag || undefined,
      groupId: editGroupId || null,
      reason: editReason.trim() || undefined,
      expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
    });

    if (res.success && res.data) {
      onUpdated(res.data);
      // Refresh the working copy (comments + resolved names)
      const refreshed = await api.getWhitelistEntry(token, current.id);
      if (refreshed.success && refreshed.data) setCurrent(refreshed.data);
      setEditing(false);
    } else {
      setEditError(res.error || "Failed to update entry");
    }
  }

  async function handleDelete() {
    if (!token || !current) return;
    const res = await api.deleteWhitelistEntry(token, current.id);
    if (res.success) {
      onDeleted(current.id);
      onClose();
    } else {
      notify.error(res.error, "Failed to delete entry");
    }
  }

  async function handleAddComment() {
    if (!token || !current || !commentText.trim()) return;
    setCommentSaving(true);
    const res = await api.addWhitelistComment(token, current.id, commentText.trim());
    if (res.success && res.data) {
      setCurrent((prev) =>
        prev ? { ...prev, comments: [res.data!, ...prev.comments] } : prev,
      );
      setCommentText("");
    } else {
      notify.error(res.error, "Failed to add comment");
    }
    setCommentSaving(false);
  }

  async function handleDeleteComment(commentId: string) {
    if (!token || !current) return;
    const res = await api.deleteWhitelistComment(token, current.id, commentId);
    if (res.success) {
      setCurrent((prev) =>
        prev
          ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }
          : prev,
      );
    } else {
      notify.error(res.error, "Failed to delete comment");
    }
  }

  async function loadActivity() {
    if (!token || !current) return;
    setActivityLoading(true);
    const res = await api.getAuditLogs(token, {
      resource: "WhitelistEntry",
      resourceId: current.id,
      limit: 50,
    });
    if (res.success && res.data) setActivityLogs(res.data.items);
    setActivityLoading(false);
  }

  function toggleActivity() {
    if (!activityOpen) {
      setActivityOpen(true);
      loadActivity();
    } else {
      setActivityOpen(false);
    }
  }

  function toggleExpandedActivity(id: string) {
    setExpandedActivity((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getCommentPreview(log: AuditLogEntry): string | null {
    if (log.action !== "whitelist.comment.add") return null;
    const preview = (log.detail as { textPreview?: unknown } | null)?.textPreview;
    return typeof preview === "string" && preview.length > 0 ? preview : null;
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        {current && (
          <>
            <DialogHeader className="border-b border-border px-6 py-4">
              <DialogTitle className="font-display text-lg font-semibold tracking-wide">
                {current.name || "Unnamed"}
              </DialogTitle>
              <div className="font-mono text-xs text-text-muted">{current.steamId}</div>
            </DialogHeader>

            {/* Info grid */}
            <div className="border-b border-border px-6 py-4">
              <DescriptionList className="gap-4 sm:grid-cols-2 lg:grid-cols-2">
                <InfoField label="Steam ID" mono>
                  <CopyableId value={current.steamId} />
                </InfoField>
                <InfoField label="Name">
                  {editing ? (
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                  ) : (
                    current.name || <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Clan">
                  {editing ? (
                    <select value={editClanId} onChange={(e) => setEditClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                      <option value="">No Clan</option>
                      {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
                    </select>
                  ) : (
                    current.clanName || current.clan || <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Group">
                  {editing ? (
                    <select value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                      <option value="">None</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  ) : current.groupName ? (
                    <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent">{current.groupName}</span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Reason">
                  {editing ? (
                    <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Reason" />
                  ) : (
                    current.reason || <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Expires">
                  {editing ? (
                    <Input type="datetime-local" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} />
                  ) : (
                    <ExpiryBadge expiresAt={current.expiresAt} />
                  )}
                </InfoField>
                <InfoField label="Added By">{current.addedByName || current.addedBy}</InfoField>
                <InfoField label="Added">{formatDate(current.createdAt)}</InfoField>
                <InfoField label="Playtime (30/90d)">
                  {playtimeLoading ? (
                    <Skeleton className="h-3 w-24" />
                  ) : playtimeStats ? (
                    <span className="text-text-secondary">{playtimeStats.playtime30}h / {playtimeStats.playtime90}h</span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Seed Time (30/90d)">
                  {playtimeLoading ? (
                    <Skeleton className="h-3 w-24" />
                  ) : playtimeStats ? (
                    <span className="text-text-secondary">{playtimeStats.seed30}h / {playtimeStats.seed90}h</span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>
              </DescriptionList>
            </div>

            {/* Comments */}
            <div className="border-b border-border px-6 py-4">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Comments ({current.comments.length})
              </h3>
              {current.comments.length > 0 && (
                <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                  {current.comments.map((comment) => (
                    <div key={comment.id} className="rounded-sm bg-bg-tertiary px-3 py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-accent">{comment.authorName}</span>
                          <span className="text-[10px] text-text-muted">{formatRelativeTime(comment.createdAt)}</span>
                        </div>
                        {canManage && (
                          <button onClick={() => handleDeleteComment(comment.id)} className="text-[10px] text-text-muted transition-colors hover:text-danger">
                            delete
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary">{comment.text}</div>
                    </div>
                  ))}
                </div>
              )}
              {canManage && (
                <div className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddComment(); }}
                  />
                  <Button variant="gold" size="sm" onClick={handleAddComment} disabled={commentSaving || !commentText.trim()}>
                    {commentSaving ? "..." : "Add"}
                  </Button>
                </div>
              )}
            </div>

            {/* Activity (collapsible, lazy-loaded) */}
            <div className="border-b border-border px-6 py-4">
              <button
                onClick={toggleActivity}
                className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-[0.15em] text-text-muted transition-colors hover:text-text-secondary"
              >
                <span>Activity</span>
                <svg className={`h-4 w-4 transition-transform ${activityOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {activityOpen && (
                <div className="mt-3">
                  {activityLoading ? (
                    <Skeleton className="h-3 w-32" />
                  ) : activityLogs.length === 0 ? (
                    <div className="text-xs text-text-muted">No activity recorded.</div>
                  ) : (
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {activityLogs.map((log) => {
                        const changes = wlReadableChanges(
                          (log.detail as { changes?: unknown } | null)?.changes,
                          groups,
                          clans,
                        );
                        const commentPreview = getCommentPreview(log);
                        const isExpanded = expandedActivity.has(log.id);
                        const exactTime = new Date(log.createdAt).toLocaleString();
                        return (
                          <div key={log.id} className="text-xs text-text-secondary">
                            <div className="flex items-baseline">
                              <span className="font-medium text-text-primary">{log.userName}</span>
                              <span className="ml-1">
                                {" "}
                                {changes.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandedActivity(log.id)}
                                    className="text-text-secondary hover:text-text-primary"
                                  >
                                    updated entry ({changes.length} {changes.length === 1 ? "change" : "changes"})
                                    <span className="ml-1 inline-block">{isExpanded ? "▾" : "▸"}</span>
                                  </button>
                                ) : commentPreview ? (
                                  <span title={commentPreview}>
                                    added a comment: &ldquo;{commentPreview.length > 60 ? `${commentPreview.slice(0, 60)}…` : commentPreview}&rdquo;
                                  </span>
                                ) : (
                                  getActionVerb(log.action)
                                )}
                              </span>
                              <span className="ml-1.5 text-text-muted" title={exactTime}>
                                {formatRelativeTime(log.createdAt)}
                              </span>
                            </div>
                            {changes.length > 0 && isExpanded && (
                              <ul className="mt-1 ml-3 space-y-0.5 text-text-muted">
                                {changes.map((c) => (
                                  <li key={c.key}>
                                    <span className="text-text-secondary">{c.label}:</span>{" "}
                                    <span>{c.from}</span>
                                    <span className="mx-1">→</span>
                                    <span className="text-text-primary">{c.to}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions footer */}
            {canManage && (
              <div className="px-6 py-4">
                {editing ? (
                  <div className="flex items-center gap-3">
                    <Button variant="gold" size="sm" onClick={saveEdit}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditError(null); }}>
                      Cancel
                    </Button>
                    {editError && <span className="text-xs text-danger">{editError}</span>}
                  </div>
                ) : confirmingDelete ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-danger">Delete this entry?</span>
                    <Button variant="destructive" size="sm" onClick={handleDelete}>Confirm</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

(The old modal's edit mode also let you change the Steam ID via `editSteamId` but rendered NO input for it — `startEdit` seeds it from the entry and `saveEdit` sends it back unchanged. Preserve that exactly: seed the state, send `steamId: editSteamId.trim()`, render no Steam ID input. Do not "fix" this.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-entry-profile-dialog.test.tsx && bunx tsc --noEmit`
Expected: PASS (5 tests), zero warnings, tsc clean. (Base UI Dialog renders through a portal — `screen` queries the whole document, so no special handling is needed; `test/roster-dialog.test.tsx` is the precedent.)

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/entry-profile-dialog.tsx" packages/web/test/whitelist-entry-profile-dialog.test.tsx
git commit -m "feat(web): rebuild whitelist entry profile as dialog on design system"
```

### Task 9: ImportDialog + CfgDialog

Two Modal → Dialog migrations. **ImportDialog** (page.tsx 1726-1829 + handlers 872-982): paste → `parseImportLines` → review table with per-row classification highlights, summary chips, editable rows, "Apply first row to all", remove-row → `bulkAddWhitelist` → reports the `formatImportResult` message up via `onImported` and the parent refreshes + shows the banner. **CfgDialog** (page.tsx 1703-1724): read-only `<pre>` + Copy/Copied button; content is computed by the caller.

**Files:**
- Create: `packages/web/app/(protected)/whitelist/import-dialog.tsx`
- Create: `packages/web/app/(protected)/whitelist/cfg-dialog.tsx`
- Create: `packages/web/test/whitelist-import-dialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Button`, lib (`parseImportLines`, `classifyImportRows`, `importCounts`, `formatImportResult`, `ParsedImportRow`), `bulkAddWhitelist`.
- Produces:
  - `ImportDialog({ open, onClose, entries, groups, clans, token, activeServer, onImported, api? }: { open: boolean; onClose: () => void; entries: WhitelistEntry[]; groups: AdminGroup[]; clans: Clan[]; token: string | null; activeServer: string; onImported: (message: string) => void; api?: { bulkAddWhitelist: typeof bulkAddWhitelist } })` — default export. On success calls `onImported(msg)` then `onClose()`; on failure shows the error inline in the dialog (matches old `importStatus` staying visible in-modal on failure).
  - `CfgDialog({ open, onClose, content, activeServer }: { open: boolean; onClose: () => void; content: string; activeServer: string })` — default export of `cfg-dialog.tsx`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/whitelist-import-dialog.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImportDialog from "@/app/(protected)/whitelist/import-dialog";
import CfgDialog from "@/app/(protected)/whitelist/cfg-dialog";
import type { AdminGroup, Clan, WhitelistEntry } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [{ id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" }];
const existing: WhitelistEntry = {
  id: "e1", steamId: "111", server: "main", name: "Old", clan: null, clanId: null,
  clanName: null, role: null, groupId: null, groupName: null, userId: null,
  addedBy: "x", reason: null, expiresAt: null, createdAt: "",
};

test("parse classifies rows, disables import at 0 new, imports valid rows", async () => {
  const api = {
    bulkAddWhitelist: mock(() =>
      Promise.resolve({ success: true as const, data: { created: 1, skipped: [] } }),
    ),
  };
  const onImported = mock(() => {});
  render(
    <ImportDialog
      open
      onClose={mock(() => {})}
      entries={[existing]}
      groups={groups}
      clans={clans}
      token="tok"
      activeServer="main"
      onImported={onImported}
      api={api}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("Paste entries here, one per line..."), {
    target: {
      value: "// RB\nAdmin=222:Whitelist // Fresh\nAdmin=111:Whitelist // Dupe",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Parse" }));
  expect(screen.getByText("1 new")).toBeDefined();
  expect(screen.getByText("1 already whitelisted")).toBeDefined();
  expect(screen.getByText("Already whitelisted")).toBeDefined(); // per-row note

  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const sent = api.bulkAddWhitelist.mock.calls[0] as unknown[];
  const rows = sent[1] as { steamId: string; clanId?: string; clan?: string; groupId?: string }[];
  expect(rows.length).toBe(1); // dupe filtered out
  expect(rows[0].steamId).toBe("222");
  expect(rows[0].clanId).toBe("c1");
  expect(rows[0].clan).toBe("RB");
  expect(rows[0].groupId).toBe("g1");
  expect(sent[2]).toBe("main");
  expect(onImported.mock.calls[0][0]).toContain("Imported 1 entry");
});

test("CfgDialog shows the content and the server in the title", () => {
  render(
    <CfgDialog open onClose={() => {}} content="Group=Whitelist:reserve" activeServer="main" />,
  );
  expect(screen.getByText("admins.cfg (main)")).toBeDefined();
  expect(screen.getByText("Group=Whitelist:reserve")).toBeDefined();
  expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-import-dialog.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ImportDialog**

Create `packages/web/app/(protected)/whitelist/import-dialog.tsx`. Behavior verbatim from the page: paste/review steps, `Apply first row to all` (visible when >1 rows and row 0 has clanId or groupId), per-row inline editing, dupe highlighting, import filters out rows with empty steamId or any dupe classification, sends `{ steamId, name?, clanId?, clan? (tag), groupId? }` rows + `activeServer`, resets state whenever the dialog opens:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { bulkAddWhitelist } from "@/lib/api-client";
import type { AdminGroup, Clan, WhitelistEntry } from "shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  classifyImportRows,
  formatImportResult,
  importCounts,
  parseImportLines,
  type ParsedImportRow,
} from "./lib";

export interface ImportApi {
  bulkAddWhitelist: typeof bulkAddWhitelist;
}
const defaultApi: ImportApi = { bulkAddWhitelist };

export default function ImportDialog({
  open,
  onClose,
  entries,
  groups,
  clans,
  token,
  activeServer,
  onImported,
  api = defaultApi,
}: {
  open: boolean;
  onClose: () => void;
  entries: WhitelistEntry[];
  groups: AdminGroup[];
  clans: Clan[];
  token: string | null;
  activeServer: string;
  onImported: (message: string) => void;
  api?: ImportApi;
}) {
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Reset per open (mirrors the old openImportModal()).
  useEffect(() => {
    if (open) {
      setImportText("");
      setImportRows([]);
      setStep("paste");
      setError(null);
    }
  }, [open]);

  const dupeMap = useMemo(
    () => classifyImportRows(importRows, entries),
    [importRows, entries],
  );
  const counts = useMemo(() => importCounts(importRows, dupeMap), [importRows, dupeMap]);

  function handleParse() {
    setImportRows(parseImportLines(importText, clans, groups));
    setStep("review");
  }

  async function confirmImport() {
    if (!token) return;
    const validRows = importRows.filter((row, i) => row.steamId.trim() && !dupeMap.has(i));
    if (validRows.length === 0) return;

    setImporting(true);
    const res = await api.bulkAddWhitelist(
      token,
      validRows.map((r) => {
        const selectedClan = clans.find((c) => c.id === r.clanId);
        return {
          steamId: r.steamId,
          name: r.name || undefined,
          clanId: r.clanId || undefined,
          clan: selectedClan?.tag || undefined,
          groupId: r.groupId || undefined,
        };
      }),
      activeServer,
    );

    if (res.success && res.data) {
      onImported(formatImportResult(res.data.created, res.data.skipped));
      onClose();
    } else {
      setError(res.error || "Import failed");
    }
    setImporting(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold tracking-wide">
            Import Whitelist ({activeServer})
          </DialogTitle>
        </DialogHeader>

        {step === "paste" && (
          <div>
            <p className="mb-3 text-sm text-text-secondary">Paste entries in the format:</p>
            <code className="mb-3 block rounded-sm bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-secondary">
              Admin=76561197960957079:SuperAdmin // Ole
            </code>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste entries here, one per line..."
              rows={10}
              className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="gold" onClick={handleParse} disabled={!importText.trim()}>
                Parse
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-text-secondary">Review parsed entries before importing.</p>
              {importRows.length > 1 && importRows[0] && (importRows[0].clanId || importRows[0].groupId) && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setImportRows((prev) => {
                      const first = prev[0];
                      return prev.map((r, i) =>
                        i === 0 ? r : { ...r, clanId: first.clanId, groupId: first.groupId },
                      );
                    })
                  }
                >
                  Apply first row to all
                </Button>
              )}
            </div>
            <div className="mb-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-sm bg-accent/10 px-2 py-0.5 text-accent">{counts.newCount} new</span>
              {counts.existingCount > 0 && (
                <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-warning">{counts.existingCount} already whitelisted</span>
              )}
              {counts.batchCount > 0 && (
                <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-warning">{counts.batchCount} duplicate{counts.batchCount === 1 ? "" : "s"} in paste</span>
              )}
              {counts.errorCount > 0 && (
                <span className="rounded-sm bg-danger/10 px-2 py-0.5 text-danger">{counts.errorCount} error{counts.errorCount === 1 ? "" : "s"}</span>
              )}
            </div>
            <div className="mb-4 max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Steam ID</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Name</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Clan</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Group</th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, i) => {
                    const dupeReason = dupeMap.get(i);
                    const rowBg = row.error ? "bg-danger/10" : dupeReason ? "bg-warning/5" : "";
                    return (
                      <tr key={i} className={`border-b border-border/50 ${rowBg}`}>
                        <td className="px-3 py-2">
                          <input type="text" value={row.steamId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, steamId: e.target.value, error: false } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 font-mono text-sm text-accent focus:border-accent focus:outline-none" />
                          {dupeReason === "existing" && <span className="mt-1 block text-[10px] text-warning">Already whitelisted</span>}
                          {dupeReason === "batch" && <span className="mt-1 block text-[10px] text-warning">Duplicate in paste</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.name} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" />
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.clanId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, clanId: e.target.value } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                            <option value="">No Clan</option>
                            {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.groupId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, groupId: e.target.value } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                            <option value="">No group</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => setImportRows((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-text-muted transition-colors hover:text-danger" aria-label={`Remove row ${i + 1}`}>
                            x
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">
                {counts.newCount} new {counts.newCount === 1 ? "entry" : "entries"} will be imported
              </span>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("paste")}>Back</Button>
                <Button variant="gold" onClick={confirmImport} disabled={importing || counts.newCount === 0}>
                  {importing ? "Importing..." : "Import"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement CfgDialog**

Create `packages/web/app/(protected)/whitelist/cfg-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function CfgDialog({
  open,
  onClose,
  content,
  activeServer,
}: {
  open: boolean;
  onClose: () => void;
  content: string;
  activeServer: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle className="font-display text-lg font-semibold tracking-wide">
            admins.cfg ({activeServer})
          </DialogTitle>
          <Button variant="outline" size="sm" onClick={handleCopy} className="mr-6">
            {copied ? "Copied!" : "Copy"}
          </Button>
        </DialogHeader>
        <div className="max-h-[70vh] flex-1 overflow-auto p-6">
          <pre className="whitespace-pre font-mono text-xs leading-relaxed text-text-secondary">{content}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-import-dialog.test.tsx && bunx tsc --noEmit`
Expected: PASS (2 tests), tsc clean.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/import-dialog.tsx" "packages/web/app/(protected)/whitelist/cfg-dialog.tsx" packages/web/test/whitelist-import-dialog.test.tsx
git commit -m "feat(web): migrate whitelist import and cfg modals to dialogs"
```

### Task 10: EntriesTab on DataTable

The core tab (page.tsx 417-1832 minus what Tasks 8/9 took): toolbar (SearchInput-v2 + clan/group selects + Show Expired + Review/Export/Import) inside FilterBar with removable chips, the add-entry form, the entries DataTable (sortable columns with nulls-last, default clan-asc, row click → profile, expired rows dimmed, selection + sticky bulk bar when `canManage`), the bulk-action Dialog, the warnings/import-status banners, and wiring for the three dialogs. Client-side sorting moves from the hand-rolled `toggleSort` into tanstack (accessorFn + `sortUndefined: "last"`); filtering stays in a `useMemo` exactly as today.

**Files:**
- Create: `packages/web/app/(protected)/whitelist/entries-tab.tsx`
- Create: `packages/web/test/whitelist-entries-tab.test.tsx`

**Interfaces:**
- Consumes: `DataTable` (+ Task 1 props), `SearchInput` (`@/components/search-input-v2`, controlled `value`/`onChange`), `FilterBar`, `EmptyState`, `Button`/`Input`, `ExpiryBadge` (named export from `./entry-profile-dialog`, Task 8), `EntryProfileDialog` (Task 8), `ImportDialog`/`CfgDialog` (Task 9), lib (`formatExpiry`, `generateCfgContent`), api functions, `toastError`.
- Produces: default export
  `EntriesTab({ entries, setEntries, groups, clans, token, canManage, activeServer, api?, notify? })` with
  `entries: WhitelistEntry[]; setEntries: React.Dispatch<React.SetStateAction<WhitelistEntry[]>>; groups: AdminGroup[]; clans: Clan[]; token: string | null; canManage: boolean; activeServer: string; api?: EntriesApi; notify?: { error: (e: string | null | undefined, fallback?: string) => void }` and
  `EntriesApi = { getWhitelist: typeof getWhitelist; addWhitelistEntry: typeof addWhitelistEntry; getWhitelistEntry: typeof getWhitelistEntry; bulkUpdateWhitelist: typeof bulkUpdateWhitelist; bulkDeleteWhitelist: typeof bulkDeleteWhitelist } & ProfileDialogApi & ImportApi` (spread one `api` object down into the child dialogs so tests inject once; default merges all the real functions).

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/whitelist-entries-tab.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EntriesTab from "@/app/(protected)/whitelist/entries-tab";
import type { AdminGroup, Clan, WhitelistEntry } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [{ id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" }];

function entry(over: Partial<WhitelistEntry>): WhitelistEntry {
  return {
    id: "e1", steamId: "76561198000000001", server: "main", name: "Olie",
    clan: "RB", clanId: "c1", clanName: "Royal Battalion", role: null,
    groupId: "g1", groupName: "Whitelist", userId: null, addedBy: "x",
    reason: null, expiresAt: null, createdAt: "2026-01-01T00:00:00Z",
  ...over,
  };
}
const active = entry({});
const expired = entry({ id: "e2", steamId: "2", name: "Gone", expiresAt: "2020-01-01T00:00:00Z" });

function makeApi(over: Record<string, unknown> = {}) {
  return {
    getWhitelist: mock(() => Promise.resolve({ success: true as const, data: [active, expired] })),
    addWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: entry({ id: "e3", steamId: "3" }) })),
    getWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: { ...active, comments: [], addedByName: "Ole" } })),
    bulkUpdateWhitelist: mock(() => Promise.resolve({ success: true as const, data: { updated: 1 } })),
    bulkDeleteWhitelist: mock(() => Promise.resolve({ success: true as const, data: { deleted: 1 } })),
    updateWhitelistEntry: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteWhitelistEntry: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    addWhitelistComment: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteWhitelistComment: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    getPlaytime: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    getAuditLogs: mock(() => Promise.resolve({ success: true as const, data: { items: [], total: 0, page: 1, limit: 50, hasNext: false } })),
    bulkAddWhitelist: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    ...over,
  };
}

function renderTab(over: Record<string, unknown> = {}) {
  const props = {
    entries: [active, expired],
    setEntries: mock(() => {}),
    groups,
    clans,
    token: "tok",
    canManage: true,
    activeServer: "main",
    api: makeApi(),
    notify: { error: mock(() => {}) },
    ...over,
  };
  render(<EntriesTab {...(props as never)} />);
  return props;
}

test("hides expired entries by default and reveals them via the toggle", () => {
  renderTab();
  expect(screen.getByText("Olie")).toBeDefined();
  expect(screen.queryByText("Gone")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show Expired" }));
  expect(screen.getByText("Gone")).toBeDefined();
  expect(screen.getByText("Gone").closest("tr")!.className).toContain("opacity-50");
  expect(screen.getByText("Expired")).toBeDefined();
});

test("search narrows rows", () => {
  renderTab({ entries: [active, entry({ id: "e4", steamId: "9", name: "Other", clan: null, clanName: null })] });
  fireEvent.change(screen.getByPlaceholderText("Search by Steam ID, name, clan, group..."), {
    target: { value: "Other" },
  });
  expect(screen.queryByText("Olie")).toBeNull();
  expect(screen.getByText("Other")).toBeDefined();
});

test("add form posts the entry with resolved clan tag and server", async () => {
  const props = renderTab();
  fireEvent.change(screen.getByPlaceholderText("Steam64 ID"), { target: { value: "76561198000000009" } });
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Fresh" } });
  fireEvent.change(screen.getByDisplayValue("No Clan"), { target: { value: "c1" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));
  await waitFor(() => expect(props.setEntries).toHaveBeenCalled());
  const api = props.api as ReturnType<typeof makeApi>;
  const call = api.addWhitelistEntry.mock.calls[0] as unknown[];
  expect(call[1]).toBe("76561198000000009");
  expect(call[2]).toEqual({
    name: "Fresh",
    clanId: "c1",
    clan: "RB",
    groupId: undefined,
    expiresAt: undefined,
    server: "main",
  });
});

test("row click opens the profile dialog with the fetched entry", async () => {
  const props = renderTab();
  fireEvent.click(screen.getByText("Olie"));
  const api = props.api as ReturnType<typeof makeApi>;
  await waitFor(() => expect(api.getWhitelistEntry).toHaveBeenCalledWith("tok", "e1"));
  expect(await screen.findByText("Comments (0)")).toBeDefined();
});

test("bulk change-group flows through the dialog and refetches", async () => {
  const props = renderTab();
  const rowCheckboxes = screen.getAllByRole("checkbox", { name: "Select row" });
  fireEvent.click(rowCheckboxes[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Change Group" }));
  expect(screen.getByText(/This will affect 1 selected entry\./)).toBeDefined();
  // Two "No group" selects exist (add form + dialog); the dialog's portal renders last.
  fireEvent.change(screen.getAllByDisplayValue("No group").at(-1)!, { target: { value: "g1" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  const api = props.api as ReturnType<typeof makeApi>;
  await waitFor(() =>
    expect(api.bulkUpdateWhitelist).toHaveBeenCalledWith("tok", ["e1"], { groupId: "g1" }),
  );
  await waitFor(() => expect(api.getWhitelist).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-entries-tab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/web/app/(protected)/whitelist/entries-tab.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  addWhitelistEntry,
  bulkAddWhitelist,
  bulkDeleteWhitelist,
  bulkUpdateWhitelist,
  getWhitelist,
  getWhitelistEntry,
} from "@/lib/api-client";
import type {
  AdminGroup,
  Clan,
  WhitelistEntry,
  WhitelistEntryWithComments,
} from "shared";
import { toastError } from "@/lib/toast";
import { DataTable } from "@/components/data-table-v2";
import { SearchInput } from "@/components/search-input-v2";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EntryProfileDialog, {
  ExpiryBadge,
  defaultApi as profileDefaultApi,
  type ProfileDialogApi,
} from "./entry-profile-dialog";
import ImportDialog, { type ImportApi } from "./import-dialog";
import CfgDialog from "./cfg-dialog";
import { formatDate } from "@/lib/format";
import { generateCfgContent } from "./lib";

export type EntriesApi = {
  getWhitelist: typeof getWhitelist;
  addWhitelistEntry: typeof addWhitelistEntry;
  getWhitelistEntry: typeof getWhitelistEntry;
  bulkUpdateWhitelist: typeof bulkUpdateWhitelist;
  bulkDeleteWhitelist: typeof bulkDeleteWhitelist;
} & ProfileDialogApi &
  ImportApi;

export interface EntriesNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: EntriesApi = {
  ...profileDefaultApi,
  getWhitelist,
  addWhitelistEntry,
  bulkUpdateWhitelist,
  bulkDeleteWhitelist,
  bulkAddWhitelist,
};
const defaultNotify: EntriesNotify = { error: toastError };

type BulkAction = "group" | "clan" | "expiry" | "delete";
interface PendingBulk {
  action: BulkAction;
  ids: string[];
  clear: () => void;
}

const BULK_TITLES: Record<BulkAction, string> = {
  group: "Change Group",
  clan: "Change Clan",
  expiry: "Set Expiry",
  delete: "Delete Entries",
};

export default function EntriesTab({
  entries,
  setEntries,
  groups,
  clans,
  token,
  canManage,
  activeServer,
  api = defaultApi,
  notify = defaultNotify,
}: {
  entries: WhitelistEntry[];
  setEntries: React.Dispatch<React.SetStateAction<WhitelistEntry[]>>;
  groups: AdminGroup[];
  clans: Clan[];
  token: string | null;
  canManage: boolean;
  activeServer: string;
  api?: EntriesApi;
  notify?: EntriesNotify;
}) {
  const [search, setSearch] = useState("");
  const [filterClan, setFilterClan] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [showExpired, setShowExpired] = useState(false);

  // Add form
  const [newSteamId, setNewSteamId] = useState("");
  const [newName, setNewName] = useState("");
  const [newClanId, setNewClanId] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Dialogs
  const [selectedEntry, setSelectedEntry] = useState<WhitelistEntryWithComments | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [cfgContent, setCfgContent] = useState<string | null>(null);

  // Bulk
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [bulkClanId, setBulkClanId] = useState("");
  const [bulkExpiresAt, setBulkExpiresAt] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (!showExpired && e.expiresAt && new Date(e.expiresAt) < new Date()) return false;
      if (filterClan && e.clanId !== filterClan) return false;
      if (filterGroup && e.groupId !== filterGroup) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          e.steamId.includes(search) ||
          e.addedBy.toLowerCase().includes(s) ||
          e.name?.toLowerCase().includes(s) ||
          e.clan?.toLowerCase().includes(s) ||
          e.groupName?.toLowerCase().includes(s) ||
          e.reason?.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [entries, search, filterClan, filterGroup, showExpired]);

  async function refetchEntries() {
    if (!token) return;
    const wlRes = await api.getWhitelist(token, activeServer);
    if (wlRes.success && wlRes.data) setEntries(wlRes.data);
  }

  async function openProfile(entry: WhitelistEntry) {
    if (!token) return;
    const res = await api.getWhitelistEntry(token, entry.id);
    if (res.success && res.data) setSelectedEntry(res.data);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newSteamId.trim()) return;
    setAddError(null);
    setAdding(true);

    const selectedClan = clans.find((c) => c.id === newClanId);
    const res = await api.addWhitelistEntry(token, newSteamId.trim(), {
      name: newName.trim() || undefined,
      clanId: newClanId || undefined,
      clan: selectedClan?.tag || undefined,
      groupId: newGroupId || undefined,
      expiresAt: newExpiresAt || undefined,
      server: activeServer,
    });

    if (res.success && res.data) {
      setEntries((prev) => [res.data!, ...prev]);
      setNewSteamId("");
      setNewName("");
      setNewClanId("");
      setNewGroupId("");
      setNewExpiresAt("");
      const data = res.data as WhitelistEntry & { warnings?: string[] };
      if (data.warnings?.length) setWarnings(data.warnings);
    } else {
      setAddError(res.error || "Failed to add entry");
    }
    setAdding(false);
  }

  async function executeBulkAction() {
    if (!token || !pendingBulk) return;
    setBulkProcessing(true);
    const { action, ids, clear } = pendingBulk;

    let res: { success: boolean; error?: string };
    if (action === "delete") {
      res = await api.bulkDeleteWhitelist(token, ids);
      if (res.success) {
        const idSet = new Set(ids);
        setEntries((prev) => prev.filter((e) => !idSet.has(e.id)));
      }
    } else if (action === "group") {
      res = await api.bulkUpdateWhitelist(token, ids, { groupId: bulkGroupId || null });
      if (res.success) await refetchEntries();
    } else if (action === "clan") {
      res = await api.bulkUpdateWhitelist(token, ids, { clanId: bulkClanId || null });
      if (res.success) await refetchEntries();
    } else {
      res = await api.bulkUpdateWhitelist(token, ids, {
        expiresAt: bulkExpiresAt ? new Date(bulkExpiresAt).toISOString() : null,
      });
      if (res.success) await refetchEntries();
    }

    if (res.success) {
      clear();
      setPendingBulk(null);
    } else {
      notify.error(res.error, "Bulk action failed");
    }
    setBulkProcessing(false);
  }

  function handleExport() {
    const content = generateCfgContent(entries, groups, activeServer);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admins.cfg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const activeFilters: ActiveFilter[] = [];
  if (filterClan) {
    const c = clans.find((x) => x.id === filterClan);
    activeFilters.push({ key: "clan", label: `Clan: ${c ? c.tag : filterClan}` });
  }
  if (filterGroup) {
    const g = groups.find((x) => x.id === filterGroup);
    activeFilters.push({ key: "group", label: `Group: ${g ? g.name : filterGroup}` });
  }
  if (showExpired) activeFilters.push({ key: "expired", label: "Showing Expired" });

  const columns = useMemo<ColumnDef<WhitelistEntry, unknown>[]>(
    () => [
      {
        id: "steamId",
        accessorKey: "steamId",
        header: "Steam ID",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs text-accent">{row.original.steamId}</code>
            <Link
              href={
                row.original.userId
                  ? `/users/${row.original.userId}`
                  : `/users/by-steamid/${row.original.steamId}`
              }
              title="Open unified profile"
              className="rounded-sm border border-border/50 px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              profile →
            </Link>
          </div>
        ),
      },
      {
        id: "name",
        accessorFn: (e) => e.name ?? undefined,
        sortUndefined: "last",
        header: "Name",
        cell: ({ row }) =>
          row.original.name || <span className="text-text-muted">--</span>,
      },
      {
        id: "clan",
        accessorFn: (e) => e.clanName || e.clan || undefined,
        sortUndefined: "last",
        header: "Clan",
        cell: ({ row }) =>
          row.original.clanName || row.original.clan || (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        id: "group",
        accessorFn: (e) => e.groupName || e.role || undefined,
        sortUndefined: "last",
        header: "Group",
        cell: ({ row }) =>
          row.original.groupName ? (
            <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent">
              {row.original.groupName}
            </span>
          ) : row.original.role ? (
            <span className="text-text-secondary">{row.original.role}</span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        id: "expires",
        accessorFn: (e) => (e.expiresAt ? new Date(e.expiresAt).getTime() : undefined),
        sortUndefined: "last",
        header: "Expires",
        cell: ({ row }) => <ExpiryBadge expiresAt={row.original.expiresAt} />,
      },
      {
        id: "created",
        accessorFn: (e) => new Date(e.createdAt).getTime(),
        header: "Added",
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      {/* Toolbar */}
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={(key) => {
          if (key === "clan") setFilterClan("");
          if (key === "group") setFilterGroup("");
          if (key === "expired") setShowExpired(false);
        }}
        onClearAll={() => {
          setFilterClan("");
          setFilterGroup("");
          setShowExpired(false);
        }}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by Steam ID, name, clan, group..."
          className="min-w-64 flex-1"
        />
        <select
          value={filterClan}
          onChange={(e) => setFilterClan(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Clans</option>
          {clans.map((c) => (
            <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>
          ))}
        </select>
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <Button
          variant={showExpired ? "outlineGold" : "outline"}
          onClick={() => setShowExpired((v) => !v)}
        >
          {showExpired ? "Showing Expired" : "Show Expired"}
        </Button>
        <Button variant="outline" onClick={() => setCfgContent(generateCfgContent(entries, groups, activeServer))}>
          Review admins.cfg
        </Button>
        <Button variant="outline" onClick={handleExport}>
          Export admins.cfg
        </Button>
        {canManage && (
          <Button variant="outline" onClick={() => setShowImport(true)}>
            Import
          </Button>
        )}
      </FilterBar>

      {/* Duplicate warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-sm border border-warning/20 bg-warning/5 px-4 py-2.5 text-sm text-warning">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
          <button onClick={() => setWarnings([])} className="ml-3 text-text-muted hover:text-text-primary" aria-label="Dismiss warnings">
            x
          </button>
        </div>
      )}

      {importStatus && (
        <div className="mb-4 rounded-sm border border-accent/20 bg-accent/5 px-4 py-2.5 text-sm text-accent">
          {importStatus}
          <button onClick={() => setImportStatus(null)} className="ml-3 text-text-muted hover:text-text-primary" aria-label="Dismiss import status">
            x
          </button>
        </div>
      )}

      {/* Add entry form */}
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4">
          <Input type="text" value={newSteamId} onChange={(e) => setNewSteamId(e.target.value)} placeholder="Steam64 ID" className="flex-1 font-mono" required />
          <Input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="w-full sm:w-36" />
          <select value={newClanId} onChange={(e) => setNewClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-32">
            <option value="">No Clan</option>
            {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
          </select>
          <select value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-36">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <Input type="datetime-local" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className="w-full sm:w-48" title="Expiry (optional)" />
          <Button type="submit" variant="gold" disabled={adding}>
            {adding ? "Adding..." : "Add Entry"}
          </Button>
          {addError && <div className="w-full text-sm text-danger">{addError}</div>}
        </form>
      )}

      {/* Entries table */}
      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(e) => e.id}
        pageSize={50}
        initialSorting={[{ id: "clan", desc: false }]}
        onRowClick={openProfile}
        rowClassName={(e) =>
          e.expiresAt && new Date(e.expiresAt) < new Date() ? "opacity-50" : undefined
        }
        enableSelection={canManage}
        emptyState={
          <EmptyState
            className="py-8"
            message={search ? "No entries match your search" : "No whitelist entries yet"}
          />
        }
        bulkActions={(rows, clear) => (
          <>
            <span className="text-sm font-medium text-text-primary">{rows.length} selected</span>
            <Button variant="outline" size="sm" onClick={() => { setBulkGroupId(""); setPendingBulk({ action: "group", ids: rows.map((r) => r.id), clear }); }}>
              Change Group
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkClanId(""); setPendingBulk({ action: "clan", ids: rows.map((r) => r.id), clear }); }}>
              Change Clan
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkExpiresAt(""); setPendingBulk({ action: "expiry", ids: rows.map((r) => r.id), clear }); }}>
              Set Expiry
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setPendingBulk({ action: "delete", ids: rows.map((r) => r.id), clear })}>
              Delete
            </Button>
          </>
        )}
      />

      {/* Bulk action dialog */}
      <Dialog open={pendingBulk !== null} onOpenChange={(o) => { if (!o) setPendingBulk(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-semibold tracking-wide">
              {pendingBulk ? BULK_TITLES[pendingBulk.action] : ""}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-text-secondary">
            This will affect {pendingBulk?.ids.length ?? 0} selected {pendingBulk?.ids.length === 1 ? "entry" : "entries"}.
          </p>

          {pendingBulk?.action === "group" && (
            <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}

          {pendingBulk?.action === "clan" && (
            <select value={bulkClanId} onChange={(e) => setBulkClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
              <option value="">No Clan</option>
              {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
            </select>
          )}

          {pendingBulk?.action === "expiry" && (
            <Input type="datetime-local" value={bulkExpiresAt} onChange={(e) => setBulkExpiresAt(e.target.value)} />
          )}

          {pendingBulk?.action === "delete" && (
            <p className="text-sm text-danger">
              Are you sure you want to permanently delete {pendingBulk.ids.length} {pendingBulk.ids.length === 1 ? "entry" : "entries"}? This cannot be undone.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingBulk(null)}>Cancel</Button>
            <Button
              variant={pendingBulk?.action === "delete" ? "destructive" : "gold"}
              onClick={executeBulkAction}
              disabled={bulkProcessing}
            >
              {bulkProcessing ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EntryProfileDialog
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        groups={groups}
        clans={clans}
        token={token}
        canManage={canManage}
        onUpdated={(updated) =>
          setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        }
        onDeleted={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
        api={api}
        notify={notify}
      />

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        entries={entries}
        groups={groups}
        clans={clans}
        token={token}
        activeServer={activeServer}
        onImported={(msg) => {
          setImportStatus(msg);
          refetchEntries();
        }}
        api={api}
      />

      <CfgDialog
        open={cfgContent !== null}
        onClose={() => setCfgContent(null)}
        content={cfgContent ?? ""}
        activeServer={activeServer}
      />
    </>
  );
}
```

(Requires Task 8's file to export `ExpiryBadge`, `defaultApi`, and `ProfileDialogApi` — Task 8's code already exports the type and component per its Interfaces block; add `export` to its `defaultApi` const when implementing Task 8. Task 9's `ImportApi` is exported. Note the sorting deviation for the reviewer: tanstack's first-click direction is ascending for every column, where the old table defaulted `expires`/`created` to descending on first click — sanctioned under the DataTable idiom.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/whitelist-entries-tab.test.tsx && bunx tsc --noEmit`
Expected: PASS (5 tests), zero warnings, tsc clean.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/entries-tab.tsx" packages/web/test/whitelist-entries-tab.test.tsx
git commit -m "feat(web): rebuild whitelist entries tab on DataTable with dialogs"
```

### Task 11: Page shell + wave gates + version bump

Rewrite `page.tsx` as the slim shell: identical init (server configs → server list → stored default; groups+clans in parallel), identical per-server load (entries + candidates when `canManage`, dismissed reset), identical 20s auto-refresh, SFTP toggle (now toasting on failure — previously silent), server switcher pills, `ui/tabs` with the Requests count badge, and the five tab components. Then close the wave: sweep gates, full suite, version bump.

**Files:**
- Modify: `packages/web/app/(protected)/whitelist/page.tsx` (full rewrite)
- Modify: `package.json` (repo root — version only)

**Interfaces:**
- Consumes: everything produced by Tasks 5-10 (default exports `EntriesTab`, `RequestsTab`, `GroupsTab`, `ClansTab`, `ActivityTab`), `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, lib (`DEFAULT_SERVERS`, `getStoredDefaultServer`), `Skeleton`/`SkeletonCard`/`SkeletonTableRows`, `toastError`, `useAutoRefresh`, api functions (`getServerConfigs`, `getAdminGroups`, `getClans`, `getWhitelist`, `getWhitelistCandidates`, `toggleServerSync`).

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `packages/web/app/(protected)/whitelist/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAdminGroups,
  getClans,
  getServerConfigs,
  getWhitelist,
  getWhitelistCandidates,
  toggleServerSync,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePermissions } from "@/lib/permission-context";
import { toastError } from "@/lib/toast";
import { Skeleton, SkeletonCard, SkeletonTableRows } from "@/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AdminGroup,
  Clan,
  ServerConfig,
  WhitelistCandidate,
  WhitelistEntry,
} from "shared";
import { DEFAULT_SERVERS, getStoredDefaultServer } from "./lib";
import EntriesTab from "./entries-tab";
import RequestsTab from "./requests-tab";
import GroupsTab from "./groups-tab";
import ClansTab from "./clans-tab";
import ActivityTab from "./activity-tab";

type Tab = "entries" | "requests" | "groups" | "clans" | "activity";

export default function WhitelistPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canManage = hasPermission("manage:whitelist");
  const canSync = hasPermission("manage:whitelist-sync");
  const canViewAudit = hasPermission("view:audit-logs");

  const [tab, setTab] = useState<Tab>("entries");
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [candidates, setCandidates] = useState<WhitelistCandidate[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [clans, setClans] = useState<Clan[]>([]);
  const [serverConfigs, setServerConfigs] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server selection
  const [servers, setServers] = useState<{ server: string; label: string }[]>(DEFAULT_SERVERS);
  const [activeServer, setActiveServer] = useState<string>("");

  // Dismissed candidates (client-side only)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Toggling sync
  const [togglingSync, setTogglingSync] = useState(false);

  // Initialize: fetch server configs then load data for default server
  useEffect(() => {
    async function init() {
      if (!apiToken) return;
      try {
        const configRes = await getServerConfigs(apiToken);
        if (configRes.success && configRes.data && configRes.data.length > 0) {
          setServerConfigs(configRes.data);
          const srvList = configRes.data.map((c) => ({ server: c.server, label: c.label }));
          setServers(srvList);
          const stored = getStoredDefaultServer();
          const initial = srvList.find((s) => s.server === stored)?.server || srvList[0].server;
          setActiveServer(initial);
        } else {
          const stored = getStoredDefaultServer();
          const initial = DEFAULT_SERVERS.find((s) => s.server === stored)?.server || "main";
          setActiveServer(initial);
        }

        const [grpRes, clanRes] = await Promise.all([
          getAdminGroups(apiToken),
          getClans(apiToken),
        ]);
        if (grpRes.success && grpRes.data) setGroups(grpRes.data);
        if (clanRes.success && clanRes.data) setClans(clanRes.data);
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [apiToken]);

  // Fetch entries and candidates when active server changes
  useEffect(() => {
    // Clear dismissed set so candidates approved on other servers still show
    setDismissed(new Set());

    async function loadServer() {
      if (!apiToken || !activeServer) return;
      try {
        const wlRes = await getWhitelist(apiToken, activeServer);
        if (wlRes.success && wlRes.data) setEntries(wlRes.data);
        else setError(wlRes.error || "Failed to load whitelist");

        if (canManage) {
          const candRes = await getWhitelistCandidates(apiToken, activeServer);
          if (candRes.success && candRes.data) setCandidates(candRes.data);
        }
      } catch {
        setError("Failed to load whitelist");
      }
    }
    loadServer();
  }, [apiToken, activeServer, canManage]);

  const refreshWhitelist = useCallback(async () => {
    if (!apiToken || !activeServer) return;
    try {
      const [wlRes, grpRes, clanRes] = await Promise.all([
        getWhitelist(apiToken, activeServer),
        getAdminGroups(apiToken),
        getClans(apiToken),
      ]);
      if (wlRes.success && wlRes.data) setEntries(wlRes.data);
      if (grpRes.success && grpRes.data) setGroups(grpRes.data);
      if (clanRes.success && clanRes.data) setClans(clanRes.data);
      if (canManage) {
        const candRes = await getWhitelistCandidates(apiToken, activeServer);
        if (candRes.success && candRes.data) setCandidates(candRes.data);
      }
    } catch {
      /* silent */
    }
  }, [apiToken, activeServer, canManage]);

  useAutoRefresh(refreshWhitelist, 20_000, !!apiToken && !!activeServer);

  async function handleToggleSync() {
    if (!apiToken || !activeServer) return;
    setTogglingSync(true);
    const current = serverConfigs.find((c) => c.server === activeServer);
    const res = await toggleServerSync(apiToken, activeServer, !current?.syncEnabled);
    if (res.success && res.data) {
      setServerConfigs((prev) =>
        prev.map((c) => (c.server === activeServer ? res.data! : c)),
      );
    } else {
      toastError(res.error, "Failed to toggle SFTP sync");
    }
    setTogglingSync(false);
  }

  if (loading)
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-11 w-52" />
        </div>
        <div className="mb-6 flex gap-2 border-b border-border pb-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20" />
          ))}
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="ml-auto h-10 w-24" />
        </div>
        <SkeletonCard pad="p-0">
          <table className="w-full text-sm">
            <tbody>
              <SkeletonTableRows
                rows={8}
                columns={[
                  { key: "steamId" },
                  { key: "name" },
                  { key: "clan" },
                  { key: "group" },
                  { key: "expires" },
                  { key: "created" },
                ]}
              />
            </tbody>
          </table>
        </SkeletonCard>
      </div>
    );
  if (error) return <div className="text-danger">{error}</div>;

  const pendingCandidates = candidates.filter((c) => !dismissed.has(c.userId));
  const currentConfig = serverConfigs.find((c) => c.server === activeServer);

  const visibleTabs: Tab[] = canViewAudit
    ? ["entries", "requests", "groups", "clans", "activity"]
    : ["entries", "requests", "groups", "clans"];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">Whitelist</h1>
        <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
          {entries.length} entries
        </span>
      </div>

      {/* Server switcher + SFTP sync */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex gap-1 rounded-sm border border-border bg-bg-tertiary p-1">
          {servers.map((s) => (
            <button
              key={s.server}
              onClick={() => setActiveServer(s.server)}
              className={`rounded-sm px-4 py-2 text-sm font-medium tracking-wide transition-all ${
                activeServer === s.server
                  ? "border border-accent/20 bg-accent/10 text-accent"
                  : "border border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {canSync && currentConfig && (
          <button
            onClick={handleToggleSync}
            disabled={togglingSync}
            className={`ml-auto flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-medium tracking-wide transition-all disabled:opacity-50 ${
              currentConfig.syncEnabled
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-bg-tertiary text-text-muted"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${currentConfig.syncEnabled ? "bg-success" : "bg-text-muted"}`}
              aria-hidden="true"
            />
            SFTP Sync {currentConfig.syncEnabled ? "On" : "Off"}
          </button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="line" className="mb-6 w-full justify-start border-b border-border">
          {visibleTabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              <span className="capitalize">{t}</span>
              {t === "requests" && pendingCandidates.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-bold text-destructive-foreground">
                  {pendingCandidates.length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="entries">
          <EntriesTab
            entries={entries}
            setEntries={setEntries}
            groups={groups}
            clans={clans}
            token={apiToken}
            canManage={canManage}
            activeServer={activeServer}
          />
        </TabsContent>
        <TabsContent value="requests">
          <RequestsTab
            candidates={pendingCandidates}
            groups={groups}
            onApproved={(created) => setEntries((prev) => [created, ...prev])}
            dismissed={dismissed}
            setDismissed={setDismissed}
            token={apiToken}
            canManage={canManage}
            activeServer={activeServer}
          />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab groups={groups} setGroups={setGroups} token={apiToken} canManage={canManage} />
        </TabsContent>
        <TabsContent value="clans">
          <ClansTab clans={clans} setClans={setClans} token={apiToken} canManage={canManage} />
        </TabsContent>
        {canViewAudit && (
          <TabsContent value="activity">
            <ActivityTab token={apiToken} groups={groups} clans={clans} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
```

(If `TabsContent` does not exist in `components/ui/tabs.tsx` — check the file; the gallery imports it, so it does. If Base UI's `onValueChange` delivers `(value, eventDetails)`, the first argument is the value — the handler above is compatible.)

- [ ] **Step 2: Sweep gates (must all be empty)**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web
grep -rn "bg-red-500\|bg-green-500\|bg-amber-500\|bg-blue-500\|text-red-400\|text-green-400\|text-amber-400\|text-blue-400\|accent-accent" "app/(protected)/whitelist" ; \
grep -rn "components/modal\|components/search-input\"" "app/(protected)/whitelist" ; \
grep -rn "function CopyableId\|function InfoField\|SQUAD_PERMISSIONS = \[" "app/(protected)/whitelist/page.tsx"
```

Expected: no output (exit 1) from all three. These prove: no raw palette classes or native accent-checkboxes anywhere in the whitelist directory, no legacy Modal / legacy SearchInput imports, no leftover local helper components in the page.

- [ ] **Step 3: Full suite + types**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test && bunx tsc --noEmit`
Expected: all tests pass, zero warnings, tsc clean.

- [ ] **Step 4: Commit the shell**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/whitelist/page.tsx"
git commit -m "feat(web): compose whitelist page from tab components on ui tabs"
```

- [ ] **Step 5: Version bump and wave-close commit**

Edit the repo-root `package.json`: `"version": "2.8.0"` → `"version": "2.9.0"`.

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add package.json
git commit -m "chore(web): phase 2c whitelist wave, bump to 2.9.0"
```

---

## Wave-Close Verification (controller-level, after all tasks)

- Full suite + tsc from `packages/web`: green, zero warnings.
- Dev smoke (controller runs this): `bun dev`, then `/` → 200, `/whitelist` → 307 unauthenticated, `/design` → 200.
- `git status` clean; branch NOT pushed; ledger updated per task under "PHASE 2c".
- Known deferred items (do NOT fix this wave): `modal.tsx` still exists (other consumers, Phase 3); native selects (Phase 3 form kit); `bg-green-500` in audit-logs / rcon-console / live-server pages (their waves); `-v2` renames (Phase 3).

## Spec-Coverage Self-Review (done at plan time)

- Decomposition into toolbar/entries table/entry profile modal/candidates queue/admin groups/clans/activity log → Tasks 5-11 (toolbar lives inside entries-tab as FilterBar).
- DataTable/FilterBar adoption → Tasks 1, 5, 10.
- AuditDetail renderer (WL_DETAIL_LABELS, id→name resolution, from→to rows, show-raw) → Tasks 3, 4, 5.
- Resolved `addedByName` for bot/system actors (never a raw snowflake) → Task 8 (renders `addedByName || addedBy`, test-asserted).
- Requests-tab pending-count badge → Task 11 (TabsTrigger badge).
- Import modal with dupe-classification preview → Tasks 3 (parse/classify/counts), 9 (dialog).
- SFTP-sync status toggle → Task 11 (+ failure toast).
- Server tab switcher → Task 11.
- Identical behavior, feature-by-feature → each task names its source lines; sanctioned deviations listed in Global Constraints.
- Deactivated entries invisible → API-filtered; nothing client-side (noted in constraints).
- Modal → Dialog census for this page (bulk, profile, cfg, import) → Tasks 8, 9, 10.
- StatusBadge whitelist variants → Task 2.
- Raw palette classes in activity badges → Tasks 3 (getActionTone) + 5 (StatusBadge tone), grep-gated in Task 11.

<!-- PLAN-END -->

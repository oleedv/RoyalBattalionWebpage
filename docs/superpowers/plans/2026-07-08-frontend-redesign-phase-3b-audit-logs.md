# Phase 3b — Audit Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate `/audit-logs` onto the Gilded Regiment design system — DataTable-v2 (`serverPagination` + `renderDetail`→`AuditDetail`), FilterBar with a date-range, search-input-v2, tokenized action badges, and an AlertDialog delete — preserving identical behavior.

**Architecture:** Extract the pure helpers (action-tone map, detail summariser, `AuditDetail` mapper) into `audit-logs/lib.ts`, then rewrite `audit-logs/page.tsx` thin over the new composites with a DI `api` seam for testability. Server-side pagination, all five filters, 20s auto-refresh, and developer-only delete are preserved feature-for-feature.

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, `@tanstack/react-table` via `@/components/data-table-v2`, Base UI AlertDialog, bun test + happy-dom.

## Global Constraints

- **Identical behavior, feature-by-feature:** the five filters (action select, resource select, user name search, from-date, to-date — `to` gets `T23:59:59.999Z` appended), server pagination (`page`/`total`, `PAGE_SIZE=50`, prev/next), 20s silent auto-refresh, developer-only per-row Delete, and the collapsed detail summary (`formatDetailSummary`) all preserved. Filter changes reset to page 1.
- **Design tokens only** — the `ActionBadge` `colorMap` currently uses raw palette (`bg-blue-500/15 text-blue-400`, purple/green/yellow/orange/red/cyan/pink/indigo/rose/gray). Replace with a token-tone map (5 semantic tones). NO raw palette (`bg-\w+-\d`, `text-\w+-\d`) may remain in the audit-logs tree.
- **No `window.confirm`/`alert`/`prompt`** — the delete `confirm()` becomes a controlled Base UI AlertDialog (pending-delete state), matching the 2d pattern.
- **Base UI primitives only.** Adopt `DataTable` (`@/components/data-table-v2`), `FilterBar`, `SearchInput` (`@/components/search-input-v2`), `AuditDetail`, `StatusBadge`.
- **Sanctioned deltas** (precedented by 2c/2e): the bespoke row-click-to-expand-the-Details-cell becomes DataTable-v2 chevron-expand → `AuditDetail` panel; the raw `DetailView` key-value dump is replaced by `AuditDetail` (grid + raw-JSON toggle).
- **DialogContent width gotcha:** any `DialogContent`/`AlertDialogContent` with a `max-w` override MUST also pass the `sm:`-prefixed width (Base UI base is `sm:max-w-sm`; tailwind-merge only dedupes same-modifier classes).
- **No emojis.** Conventional Commits one-liners, no `Co-Authored-By`/AI attribution.
- **Version:** bump ROOT `package.json` 2.12.0 → 2.13.0 (last task).
- **Testing gate:** from `packages/web`, `bun test` = zero failures AND zero warnings; `bunx tsc --noEmit` clean. Tab/page components take a DI `api` prop (default = real client). HARD RULE: fix ambiguous-query test failures in the TEST (getAllБy/`within`), never by deleting product UI.

---

### Task 1: audit-logs/lib.ts — pure helpers

**Files:**
- Create: `packages/web/app/(protected)/audit-logs/lib.ts`
- Test: `packages/web/test/audit-logs-lib.test.ts`
- Source: current `audit-logs/page.tsx` — `formatAction` (41-43), `ActionBadge` colorMap (46-59), `formatDetailSummary` (67-107).

**Interfaces:**
- Produces:
  - `formatAction(action: string): string` — moved verbatim.
  - `actionTone(action: string): "success"|"warning"|"danger"|"accent"|"neutral"` — maps the action prefix (`action.split(".")[0]`) to a StatusBadge tone (replaces the raw-palette colorMap).
  - `formatDetailSummary(action: string, detail: Record<string, unknown> | null): string | null` — moved verbatim.
  - `toAuditDetail(detail: Record<string, unknown> | null): { fields: {label:string;value:string}[]; raw: unknown }` — maps each detail entry to a field (`label: key`, `value: object→JSON.stringify else String(value ?? "")`), `raw: detail`. Empty/null detail → `{ fields: [], raw: detail }`.

**Tone mapping (prefix → tone):** `whitelist`→success, `member`→success, `role`→accent, `discord_bot`→accent, `match`→accent, `admin_group`→warning, `clan`→warning, `squadjs`→warning, `server_config`→danger, `rcon`→danger; default→neutral.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/test/audit-logs-lib.test.ts
import { test, expect } from "bun:test";
import { formatAction, actionTone, formatDetailSummary, toAuditDetail } from "@/app/(protected)/audit-logs/lib";

test("formatAction humanises dotted/underscored actions", () => {
  expect(formatAction("rcon.switchteam")).toBe("Rcon Switchteam");
  expect(formatAction("whitelist.add")).toBe("Whitelist Add");
});

test("actionTone maps prefixes to semantic tones (no raw palette)", () => {
  expect(actionTone("whitelist.add")).toBe("success");
  expect(actionTone("member.disable")).toBe("success");
  expect(actionTone("role.update")).toBe("accent");
  expect(actionTone("admin_group.create")).toBe("warning");
  expect(actionTone("server_config.update")).toBe("danger");
  expect(actionTone("rcon.kick")).toBe("danger");
  expect(actionTone("mystery.thing")).toBe("neutral");
});

test("formatDetailSummary renders known action summaries", () => {
  expect(formatDetailSummary("rcon.warn", { playerName: "Bob", message: "stop" })).toBe('Warned Bob -- "stop"');
  expect(formatDetailSummary("whitelist.add", { name: "Al", server: "main" })).toBe("Added Al on main");
  expect(formatDetailSummary("unknown", { x: 1 })).toBeNull();
});

test("toAuditDetail flattens detail into fields + raw", () => {
  const r = toAuditDetail({ name: "Al", nested: { a: 1 } });
  expect(r.fields).toContainEqual({ label: "name", value: "Al" });
  expect(r.fields).toContainEqual({ label: "nested", value: '{"a":1}' });
  expect(r.raw).toEqual({ name: "Al", nested: { a: 1 } });
  expect(toAuditDetail(null)).toEqual({ fields: [], raw: null });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd packages/web && bun test test/audit-logs-lib.test.ts` → module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/web/app/(protected)/audit-logs/lib.ts
type Tone = "success" | "warning" | "danger" | "accent" | "neutral";

export function formatAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_TONES: Record<string, Tone> = {
  whitelist: "success",
  member: "success",
  role: "accent",
  discord_bot: "accent",
  match: "accent",
  admin_group: "warning",
  clan: "warning",
  squadjs: "warning",
  server_config: "danger",
  rcon: "danger",
};

export function actionTone(action: string): Tone {
  return ACTION_TONES[action.split(".")[0]] ?? "neutral";
}

export function formatDetailSummary(action: string, detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const name = detail.playerName as string | undefined;
  const names = detail.playerNames as string[] | undefined;
  switch (action) {
    case "rcon.warn":
      return name ? `Warned ${name}${detail.message ? ` -- "${detail.message}"` : ""}` : null;
    case "rcon.kick":
      return name ? `Kicked ${name}${detail.reason ? ` -- ${detail.reason}` : ""}` : null;
    case "rcon.switchteam":
      return name ? `Moved ${name} to other team` : null;
    case "rcon.switchsquad":
      return names?.length ? `Moved ${detail.count} players (${names.join(", ")})` : detail.count ? `Moved ${detail.count} players` : null;
    case "rcon.switchclan":
      return `Moved ${detail.count || 0} clan members${detail.clanTag ? ` [${detail.clanTag}]` : ""}${names?.length ? ` (${names.join(", ")})` : ""} to Team ${detail.targetTeam || "?"}`;
    case "rcon.demotecommander":
      return name ? `Demoted ${name}` : null;
    case "rcon.broadcast":
      return detail.message ? `"${detail.message}"` : null;
    case "rcon.disband":
      return `Disbanded squad ${detail.squadID || "?"} on team ${detail.teamID || "?"}`;
    case "rcon.setnextlayer":
      return detail.layer ? `Set next layer: ${detail.layer}` : null;
    case "rcon.endmatch":
      return "Ended current match";
    case "whitelist.add":
      return detail.name ? `Added ${detail.name}${detail.server ? ` on ${detail.server}` : ""}` : null;
    case "whitelist.delete":
      return detail.name ? `Removed ${detail.name}` : null;
    default:
      return null;
  }
}

export function toAuditDetail(detail: Record<string, unknown> | null): {
  fields: { label: string; value: string }[];
  raw: unknown;
} {
  if (!detail) return { fields: [], raw: detail };
  const fields = Object.entries(detail).map(([label, value]) => ({
    label,
    value: typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? ""),
  }));
  return { fields, raw: detail };
}
```

- [ ] **Step 4: Run test to verify it passes** — expect 4 pass, 0 warnings.
- [ ] **Step 5: Commit** — `git add "packages/web/app/(protected)/audit-logs/lib.ts" packages/web/test/audit-logs-lib.test.ts && git commit -m "refactor(web): extract audit-logs helpers with tokenized action tones"`

---

### Task 2: audit-logs/page.tsx — rewrite on the design system

**Files:**
- Rewrite: `packages/web/app/(protected)/audit-logs/page.tsx`
- Test: `packages/web/test/audit-logs-page.test.tsx`
- Consumes Task 1 (`formatAction`, `actionTone`, `formatDetailSummary`, `toAuditDetail`).

**Interfaces:**
- `default AuditLogsPage()` renders a thin default-export that reads `usePermissions()` and delegates to `AuditLogsView({ token, canDelete, api })`. Export `AuditLogsView` + `type AuditLogsApi = { getAuditLogs: typeof getAuditLogs; deleteAuditLog: typeof deleteAuditLog }` with a `defaultApi`.
- Behavior preserved exactly (see Global Constraints): 5 filters, `to`+`T23:59:59.999Z`, server pagination, 20s auto-refresh, developer-only delete, filter-change resets to page 1, user-name search filters the CURRENT page client-side (as today).

**Structure (transcribe the current page's logic, swapping components):**
- **Toolbar** → `<FilterBar activeFilters={...} onClear={...} onClearAll={resetFilters}>` containing: action `<select>`, resource `<select>`, user `<SearchInput value={userSearch} onChange={setUserSearch}>` (from `@/components/search-input-v2`), and two `<input type="date">` (from/to). Selects keep their token styling (`rounded-sm border border-border bg-bg-tertiary ...`). `activeFilters` chips: one per active filter (action/resource/user/from/to) with `onClear` clearing that one.
- **Table** → `<DataTable columns={columns} data={filteredLogs} getRowId={(l)=>l.id} serverPagination={{ page, totalPages, onPageChange: setPage }} loading={loading && logs.length===0} renderDetail={(log)=> <AuditDetail {...toAuditDetail(log.detail)} changes={[]} />} emptyState={<EmptyState message="No audit log entries found" />} />`. Columns: Time (`formatDateTime`), User, Action (`<StatusBadge tone={actionTone(log.action)}>{formatAction(log.action)}</StatusBadge>`), Resource, Resource ID (mono, truncated >16), Details (collapsed summary via `formatDetailSummary`; if none but detail present → muted "expand for details"; else "--"), and a developer-only Delete action column (opens the AlertDialog).
- **Delete** → controlled `AlertDialog` driven by `pendingDelete: AuditLogEntry | null`. Confirm calls `api.deleteAuditLog(token, id)`, removes the row + decrements total on success. Title "Delete audit log entry", body "This cannot be undone.", destructive confirm. `AlertDialogContent` with `max-w-md sm:max-w-md`.
- **Header** → keep the bare `<h1 className="font-display text-2xl font-bold tracking-wide text-text-primary">Audit Logs</h1>` + description + `{total} entries` count (matching current).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/audit-logs-page.test.tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AuditLogEntry } from "shared";
import { AuditLogsView, type AuditLogsApi } from "@/app/(protected)/audit-logs/page";

const rows: AuditLogEntry[] = [
  { id: "1", userId: "u1", userName: "Alice", action: "whitelist.add", resource: "whitelist", resourceId: "76561190000000000", detail: { name: "Bob", server: "main" }, createdAt: "2026-02-01T10:00:00.000Z" },
  { id: "2", userId: "u2", userName: "Carol", action: "rcon.kick", resource: "live_server", resourceId: null, detail: { playerName: "Eve", reason: "afk" }, createdAt: "2026-02-01T11:00:00.000Z" },
];

function makeApi(over: Partial<AuditLogsApi> = {}): AuditLogsApi {
  return {
    getAuditLogs: async () => ({ success: true, data: { items: rows, total: 2, page: 1, limit: 50, hasNext: false } }),
    deleteAuditLog: async () => ({ success: true, data: { deleted: true } }),
    ...over,
  };
}

test("lists entries with tokenized action badges and a summary", async () => {
  render(<AuditLogsView token="t" canDelete={false} api={makeApi()} />);
  expect(await screen.findByText("Alice")).toBeDefined();
  const badge = screen.getByText("Whitelist Add");
  expect(badge.className).toContain("text-success");
  expect(badge.className).not.toMatch(/blue-\d/);
  expect(screen.getByText("Added Bob on main")).toBeDefined(); // formatDetailSummary
});

test("expanding a row shows the AuditDetail grid", async () => {
  render(<AuditLogsView token="t" canDelete={false} api={makeApi()} />);
  await screen.findByText("Alice");
  fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]);
  expect(await screen.findByText("Details")).toBeDefined(); // AuditDetail heading
  expect(screen.getByText("server")).toBeDefined(); // detail field label
});

test("developer delete opens an AlertDialog and removes the row on confirm", async () => {
  const deleteAuditLog = (async () => ({ success: true, data: { deleted: true } })) as AuditLogsApi["deleteAuditLog"];
  render(<AuditLogsView token="t" canDelete api={makeApi({ deleteAuditLog })} />);
  await screen.findByText("Alice");
  fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
  const confirm = await screen.findByRole("button", { name: "Delete" });
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByText("Alice")).toBeNull());
});
```

- [ ] **Step 2: Run test to verify it fails** — module/exports missing.

- [ ] **Step 3: Write the implementation.** Rewrite `page.tsx`: read the CURRENT file for the exact fetch/filter/pagination/auto-refresh logic (lines 128-223) and transcribe it into `AuditLogsView`, swapping the toolbar/table/delete per the Structure above. Move `RESOURCE_OPTIONS`/`ACTION_PREFIXES`/`PAGE_SIZE` in. Import helpers from `./lib`. Wire the DI `api`. Keep `userSearch` as the client-side current-page filter (`filteredLogs`). The default export:

```tsx
export default function AuditLogsPage() {
  const { apiToken, hasPermission } = usePermissions();
  return <AuditLogsView token={apiToken} canDelete={hasPermission("developer")} api={defaultApi} />;
}
```

- [ ] **Step 4: Run the test + full suite + tsc.** `cd packages/web && bun test test/audit-logs-page.test.tsx` then `bun test` (all pass, 0 warnings) then `bunx tsc --noEmit` (clean).

- [ ] **Step 5: Grep-gate.** `grep -rnE "window\.(confirm|prompt|alert)|bg-\w+-[0-9]|text-\w+-[0-9]|components/data-table\"|components/search-input\"" "app/(protected)/audit-logs"` → NO output (no confirm, no raw palette, no legacy data-table/search-input imports).

- [ ] **Step 6: Commit** — `git commit -m "refactor(web): rebuild audit-logs on DataTable-v2, FilterBar, AuditDetail"`

---

### Task 3: version bump

**Files:** Modify ROOT `package.json`.

- [ ] **Step 1:** Change `"version": "2.12.0"` → `"version": "2.13.0"`.
- [ ] **Step 2:** `cd packages/web && bunx tsc --noEmit` (clean) and confirm root version reads 2.13.0.
- [ ] **Step 3: Commit** — `git commit -m "chore(web): bump version to 2.13.0"`

---

## Self-Review

- **Spec coverage** (spec §5: "Audit-logs adopts the AuditDetail renderer and the date-range FilterBar fields"): AuditDetail via `renderDetail` (Task 2) + `toAuditDetail` (Task 1); FilterBar with from/to date inputs (Task 2). ✓
- **Behavior preservation:** fetch params (incl. `to`+`T23:59:59.999Z`), server pagination, 20s auto-refresh, user client-filter, developer delete, page-1 reset — all transcribed from the current page. ✓
- **Token/UX rules:** action badges tokenized (Task 1 tones, tested no-palette); `confirm()`→AlertDialog; legacy DataTable/SearchInput → v2. ✓
- **Placeholder scan:** helpers have complete code; the page rewrite references exact current-file line ranges + a precise structure spec + the DI signature. No TBDs.

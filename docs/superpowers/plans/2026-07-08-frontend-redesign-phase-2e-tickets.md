# Phase 2e — Tickets (read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 1,298-line `/tickets` page on the Gilded Regiment design-system composites (DataTable-v2 renderDetail, FilterBar, SearchInput-v2, StatusBadge, DescriptionList/InfoField, EmptyState, Tabs) plus a new shared `DownloadButton`, decomposed into a thin shell + two tab consumers + two detail renderers + a pure lib — preserving identical functional behavior.

**Architecture:** The page is ALREADY read-only (all close/escalate/reopen/force-close actions and their API route were deleted in 1794ee6). This wave is a pure component migration, mirroring the Phase 2c whitelist decomposition. Data loading stays per-tab and lazy (list on mount + 20s auto-refresh; full transcript fetched on row-expand and cached). Each tab owns its own filter state, details cache, and Discord-name map. The bespoke facet-border card rows become DataTable rows with a chevron-expanded detail panel.

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, `@tanstack/react-table` (via `@/components/data-table-v2`), Base UI Tabs, bun test + @testing-library/react + happy-dom.

## Global Constraints

Every task's requirements implicitly include this section.

- **Read-only — NO action buttons.** Ticket lifecycle is bot-only; close/escalate/reopen/force-close actions AND their route were deleted (1794ee6). Do NOT verify against or re-add action buttons. No bulk-action bar. `enableSelection` stays OFF on both tables.
- **Identical functional behavior, verified feature-by-feature.** Preserve exactly: the search/status/tier filter logic; permission-gated tier visibility (`getVisibleTiers` moved verbatim); unified current+legacy ticket list sorted by date descending; lazy detail fetch on expand WITH caching (no refetch on re-expand) and a skeleton while loading; the per-row "open in new tab" links (`/ticket/{uuid}`, `/ticket/legacy/{uuid}`, `/prospect/{uuid}`); and the `.txt` export CONTENT (the three `export*Text` functions are the staff artifact — move them BYTE-FOR-BYTE identical).
- **Design tokens only** — no raw hex, no Tailwind palette classes. The only raw-palette occurrences in the source and their REQUIRED mappings:
  - `text-blue-400` (comp_team tier) → `text-team-one`
  - `text-emerald-400` (whitelist tier) → `text-success`
  - `bg-blue-500/15 text-blue-400` (legacy `from_user`/`chat` message label) → `bg-team-one/15 text-team-one`
  - (`--color-team-one` and `--color-success` exist in `app/globals.css @theme` for both themes — added/verified in Phase 2d.)
- **Sanctioned design-system changes** (precedented by the Phase 2c whitelist migration — call these out for the reviewer, they are NOT accidental regressions):
  1. Pagination: DataTable-v2's built-in pager (`pageSize={50}`, prev/next + `page/total`) REPLACES the bespoke page-size selector (10..1000), First/Last buttons, "X–Y of Z" count, and the `rb-tickets-page-size` localStorage key.
  2. Tabs: shared `Tabs`/`TabsList variant="line"` REPLACES the hand-rolled tab buttons.
  3. Badges: shared `StatusBadge` (uppercase design-system styling) REPLACES the inline `StatusBadge`/`TierBadge`/`LegacyBadge`.
  4. Rows: DataTable rows with a chevron expander + `renderDetail` panel REPLACE the facet-border card rows; the decorative per-row icon boxes are dropped; expand is via the chevron (not whole-row click).
- **Base UI primitives only.** No `window.confirm`/`alert`/`prompt` (N/A here — read-only).
- **No emojis** anywhere (code, comments, UI, commits).
- **Commits:** Conventional Commits one-liners, no `Co-Authored-By` / AI attribution.
- **Version:** bump ROOT `package.json` 2.10.0 → 2.11.0 (last task).
- **Testing gate:** run from `packages/web`; `bun test` = zero failures AND zero warnings; `bunx tsc --noEmit` clean. Tab components take a DI `api` prop (default = real client) for testability, mirroring `entries-tab.tsx`.
- **Worktree:** never `bun install` here (deps present); run tests/tsc from `packages/web`.

## File Structure

- Create `packages/web/components/download-button.tsx` — shared `.txt` blob-download button (Task 1).
- Modify `packages/web/components/status-badge.tsx` — add `ticket-closing` variant + `ticketStatusVariant()` (Task 2).
- Create `packages/web/app/(protected)/tickets/lib.ts` — pure helpers: `fmtDate`, `export{Ticket,LegacyTicket,Prospect}Text`, `parseAttachments`, `isImageUrl`, `ALL_TIERS`, `TIER_LABELS`, `TIER_COLORS`, `getVisibleTiers`, `LEGACY_MSG_STYLES` (Task 3).
- Create `packages/web/app/(protected)/tickets/ticket-detail.tsx` — `MessageAttachments`, `LegacyMessageItem`, `DetailSkeleton`, `TicketDetailPanel`, `LegacyTicketDetailPanel` (Task 4).
- Create `packages/web/app/(protected)/tickets/prospect-detail.tsx` — `ProspectDetailPanel` (Task 5).
- Create `packages/web/app/(protected)/tickets/tickets-tab.tsx` — unified tickets DataTable consumer, DI (Task 6).
- Create `packages/web/app/(protected)/tickets/prospects-tab.tsx` — prospects DataTable consumer, DI (Task 7).
- Rewrite `packages/web/app/(protected)/tickets/page.tsx` — thin shell (Task 8).
- Modify `packages/web/app/design/gallery.tsx` + ROOT `package.json` (Task 9).
- Tests: `packages/web/test/{download-button,tickets-lib,ticket-detail,prospect-detail,tickets-tab,prospects-tab}.test.tsx` + extend `status-badge.test.tsx`.

---

### Task 1: DownloadButton composite

**Files:**
- Create: `packages/web/components/download-button.tsx`
- Test: `packages/web/test/download-button.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/button` (Button), `lucide-react` (Download).
- Produces: `DownloadButton({ text: string; filename: string; label?: string; className?: string })` — renders a `Button variant="outline" size="sm"` that downloads `text` as a `text/plain` blob named `filename`; default label `"Download"`; calls `e.stopPropagation()` first.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/download-button.test.tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { DownloadButton } from "@/components/download-button";

test("clicking downloads a text/plain blob with the given filename", () => {
  const createURL = mock(() => "blob:mock-url");
  const revokeURL = mock(() => {});
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = createURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeURL as unknown as typeof URL.revokeObjectURL;

  let captured: HTMLAnchorElement | null = null;
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    captured = this;
  };

  try {
    render(<DownloadButton text="hello world" filename="ticket-1.txt" />);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    expect(createURL).toHaveBeenCalledTimes(1);
    const blob = createURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/plain");
    expect(captured).not.toBeNull();
    expect(captured!.download).toBe("ticket-1.txt");
    expect(captured!.href).toContain("blob:mock-url");
    expect(revokeURL).toHaveBeenCalledTimes(1);
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    HTMLAnchorElement.prototype.click = origClick;
  }
});

test("renders a custom label", () => {
  render(<DownloadButton text="x" filename="f.txt" label="Export .txt" />);
  expect(screen.getByRole("button", { name: /export \.txt/i })).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && bun test test/download-button.test.tsx`
Expected: FAIL — `Cannot find module '@/components/download-button'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/web/components/download-button.tsx
"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Downloads `text` as a text/plain artifact named `filename`. Used for the
 * staff-facing .txt exports (tickets, prospects, discord-bot prospects). */
export function DownloadButton({
  text,
  filename,
  label = "Download",
  className,
}: {
  text: string;
  filename: string;
  label?: string;
  className?: string;
}) {
  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDownload}
      className={className}
    >
      <Download className="size-3.5" />
      {label}
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && bun test test/download-button.test.tsx`
Expected: PASS (2 tests, 0 warnings).

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/download-button.tsx packages/web/test/download-button.test.tsx
git commit -m "feat(web): add DownloadButton composite"
```

---

### Task 2: StatusBadge — ticket-closing variant + ticketStatusVariant

**Files:**
- Modify: `packages/web/components/status-badge.tsx`
- Test: `packages/web/test/status-badge.test.tsx` (extend)

**Interfaces:**
- Produces: new variant key `"ticket-closing"` (`{ tone: "warning", label: "Closing" }`); `ticketStatusVariant(status: string): StatusVariant` mapping `open→ticket-open`, `closing→ticket-closing`, `accepted→ticket-accepted`, `denied→ticket-denied`, everything else (`closed` + unknown) → `ticket-closed`. Consumed by Tasks 6 & 7.

- [ ] **Step 1: Write the failing test** (append to `packages/web/test/status-badge.test.tsx`)

```tsx
import { StatusBadge, matchResultVariant, ticketStatusVariant } from "@/components/status-badge";

test("ticket-closing variant renders warning tone", () => {
  render(<StatusBadge variant="ticket-closing" />);
  const el = screen.getByText("Closing");
  expect(el.className).toContain("text-warning");
});

test("ticketStatusVariant maps ticket and prospect statuses", () => {
  expect(ticketStatusVariant("open")).toBe("ticket-open");
  expect(ticketStatusVariant("closing")).toBe("ticket-closing");
  expect(ticketStatusVariant("closed")).toBe("ticket-closed");
  expect(ticketStatusVariant("accepted")).toBe("ticket-accepted");
  expect(ticketStatusVariant("denied")).toBe("ticket-denied");
  expect(ticketStatusVariant("whatever")).toBe("ticket-closed");
});
```

Note: the existing test file already imports `StatusBadge, matchResultVariant` on line 3 — REPLACE that import line with the three-symbol import above (do not add a duplicate import). Keep all existing tests unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && bun test test/status-badge.test.tsx`
Expected: FAIL — `ticketStatusVariant` is not exported; `"ticket-closing"` not assignable to `StatusVariant`.

- [ ] **Step 3: Write minimal implementation**

In `packages/web/components/status-badge.tsx`, add one entry to the `VARIANTS` object immediately after the `"ticket-legacy"` line:

```ts
  "ticket-closing": { tone: "warning", label: "Closing" },
```

Then append this helper after the existing `matchResultVariant` function (end of file):

```ts
/** Map a ticket/prospect status string to its StatusBadge variant. */
export function ticketStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "open":
      return "ticket-open";
    case "closing":
      return "ticket-closing";
    case "accepted":
      return "ticket-accepted";
    case "denied":
      return "ticket-denied";
    default:
      return "ticket-closed";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && bun test test/status-badge.test.tsx`
Expected: PASS (all prior + 2 new, 0 warnings).

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/status-badge.tsx packages/web/test/status-badge.test.tsx
git commit -m "feat(web): add ticket-closing StatusBadge variant and ticketStatusVariant"
```

---

### Task 3: tickets/lib.ts — pure helpers (moved verbatim + tokenized maps)

**Files:**
- Create: `packages/web/app/(protected)/tickets/lib.ts`
- Test: `packages/web/test/tickets-lib.test.ts`
- Source to transcribe: current `packages/web/app/(protected)/tickets/page.tsx` — `fmtDate` (24-26), `exportTicketText` (28-52), `exportLegacyTicketText` (54-71), `exportProspectText` (73-114), `parseAttachments` (136-146), `isImageUrl` (148-150), `LEGACY_MSG_STYLES` (229-236), `ALL_TIERS`/`TIER_LABELS` (825-832), `getVisibleTiers` (834-849).

**Interfaces:**
- Produces (imported by Tasks 4–7):
  - `fmtDate(iso: string): string`
  - `exportTicketText(t: Ticket): string`, `exportLegacyTicketText(t: LegacyTicket): string`, `exportProspectText(p: Prospect): string`
  - `parseAttachments(raw: string | string[] | null): string[]`, `isImageUrl(url: string): boolean`
  - `ALL_TIERS` (readonly tuple), `TIER_LABELS: Record<string,string>`, `TIER_COLORS: Record<string,string>`, `getVisibleTiers(permissions: Permission[]): string[]`
  - `LEGACY_MSG_STYLES: Record<string, { border: string; bg: string; label: string; labelColor: string }>`

**CRITICAL:** `exportTicketText`, `exportLegacyTicketText`, `exportProspectText`, `parseAttachments`, `isImageUrl`, `fmtDate`, `ALL_TIERS`, `TIER_LABELS`, `getVisibleTiers` are moved BYTE-FOR-BYTE from the source (they are the staff .txt artifact + permission gate). The ONLY edits versus source: (a) add the `import type`, (b) tokenize `LEGACY_MSG_STYLES.labelColor` for `from_user`/`chat`, (c) add the NEW `TIER_COLORS` map.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/test/tickets-lib.test.ts
import { test, expect } from "bun:test";
import type { Ticket, LegacyTicket, Prospect, Permission } from "shared";
import {
  exportTicketText,
  exportLegacyTicketText,
  exportProspectText,
  parseAttachments,
  isImageUrl,
  getVisibleTiers,
  TIER_COLORS,
} from "@/app/(protected)/tickets/lib";

const ticket: Ticket = {
  id: 7, uuid: "u-7", channelId: "c", userId: "111",
  status: "closed", tier: "normal",
  createdAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-02T00:00:00.000Z", closedBy: "222",
  events: [{ id: 1, ticketId: 7, eventType: "created", actorId: "111", detail: null, createdAt: "2026-01-01T00:00:00.000Z" }],
  messages: [{ id: 1, ticketId: 7, authorId: "111", authorTag: "User#1", content: "hi", attachments: null, isStaff: false, createdAt: "2026-01-01T00:00:00.000Z" }],
};

test("exportTicketText includes header, timeline and messages", () => {
  const out = exportTicketText(ticket);
  expect(out).toContain("Ticket #7 [closed] - normal");
  expect(out).toContain("UUID: u-7");
  expect(out).toContain("--- Timeline ---");
  expect(out).toContain("--- Messages ---");
  expect(out).toContain("User#1");
});

test("exportLegacyTicketText and exportProspectText render their headers", () => {
  const legacy: LegacyTicket = {
    id: 3, uuid: "l-3", threadNumber: 12, userId: "9", username: "bob",
    nickname: null, previousThreads: null, startedAt: "2026-01-01T00:00:00.000Z", closedAt: null, messages: [],
  };
  expect(exportLegacyTicketText(legacy)).toContain("Legacy Ticket #3 [closed]");
  const prospect = {
    id: 5, uuid: "p-5", channelId: "c", userId: "9", status: "open", alias: "Alfa",
    nationality: "NO", dateOfBirth: "2000", squadHours: 10, preferredRoles: "SL", prevClan: "",
    whyRb: "because", activeHours: "eve", competitive: "yes", steamId: "765", mentorId: null,
    pausedAt: null, extraDays: 0, createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
  } as Prospect;
  expect(exportProspectText(prospect)).toContain("Prospect: Alfa [open]");
  expect(exportProspectText(prospect)).toContain("Why Royal Battalion?");
});

test("parseAttachments handles arrays, JSON, comma-strings and null", () => {
  expect(parseAttachments(null)).toEqual([]);
  expect(parseAttachments(["a", "b"])).toEqual(["a", "b"]);
  expect(parseAttachments('["x","y"]')).toEqual(["x", "y"]);
  expect(parseAttachments("p, q ,r")).toEqual(["p", "q", "r"]);
});

test("isImageUrl matches image extensions and discord cdn", () => {
  expect(isImageUrl("https://x/y.png")).toBe(true);
  expect(isImageUrl("https://cdn.discordapp.com/whatever")).toBe(true);
  expect(isImageUrl("https://x/y.txt")).toBe(false);
});

test("getVisibleTiers grants all tiers to broad perms, else granular", () => {
  expect(getVisibleTiers(["developer"] as Permission[])).toHaveLength(5);
  expect(getVisibleTiers(["view:tickets"] as Permission[])).toHaveLength(5);
  expect(getVisibleTiers(["view:tickets:normal"] as Permission[])).toEqual(["normal"]);
  expect(getVisibleTiers([] as Permission[])).toEqual([]);
});

test("TIER_COLORS uses only design tokens (no raw palette)", () => {
  const joined = Object.values(TIER_COLORS).join(" ");
  expect(joined).not.toMatch(/blue-\d|emerald-\d/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && bun test test/tickets-lib.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/web/app/(protected)/tickets/lib.ts
import type { Ticket, LegacyTicket, Prospect, Permission } from "shared";

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export function exportTicketText(ticket: Ticket) {
  const lines: string[] = [];
  lines.push(`Ticket #${ticket.id} [${ticket.status}] - ${ticket.tier}`);
  lines.push(`User: ${ticket.userId}`);
  lines.push(`Created: ${fmtDate(ticket.createdAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${fmtDate(ticket.closedAt)}${ticket.closedBy ? ` by ${ticket.closedBy}` : ""}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of ticket.events) {
      lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) {
      const staff = m.isStaff ? " [STAFF]" : "";
      lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${staff}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

export function exportLegacyTicketText(ticket: LegacyTicket) {
  const lines: string[] = [];
  lines.push(`Legacy Ticket #${ticket.id} [closed]`);
  lines.push(`User: ${ticket.nickname || ticket.username} (${ticket.userId})`);
  if (ticket.threadNumber) lines.push(`Thread: #${ticket.threadNumber}`);
  lines.push(`Started: ${fmtDate(ticket.startedAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${fmtDate(ticket.closedAt)}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) {
      lines.push(`[${fmtDate(m.createdAt)}] [${m.type}] ${m.author || "System"}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

export function exportProspectText(prospect: Prospect) {
  const lines: string[] = [];
  lines.push(`Prospect: ${prospect.alias} [${prospect.status}]`);
  lines.push(`User: ${prospect.userId}`);
  lines.push(`Nationality: ${prospect.nationality}`);
  lines.push(`Date of Birth: ${prospect.dateOfBirth}`);
  lines.push(`Squad Hours: ${prospect.squadHours}h`);
  lines.push(`Preferred Roles: ${prospect.preferredRoles}`);
  lines.push(`Previous Clan: ${prospect.prevClan || "--"}`);
  lines.push(`Active Hours: ${prospect.activeHours}`);
  lines.push(`Competitive: ${prospect.competitive}`);
  lines.push(`Steam ID: ${prospect.steamId}`);
  if (prospect.mentorId) lines.push(`Mentor: ${prospect.mentorId}`);
  lines.push(`Created: ${fmtDate(prospect.createdAt)}`);
  if (prospect.closedAt) lines.push(`Closed: ${fmtDate(prospect.closedAt)}${prospect.closedBy ? ` by ${prospect.closedBy}` : ""}`);
  lines.push(`UUID: ${prospect.uuid}`);
  lines.push("", `--- Why Royal Battalion? ---`, prospect.whyRb);

  if (prospect.votes?.length) {
    lines.push("", "--- Votes ---");
    for (const v of prospect.votes) {
      lines.push(`[${fmtDate(v.createdAt)}] ${v.voterTag || v.voterId}: ${v.vote}${v.reason ? ` -- ${v.reason}` : ""}`);
    }
  }

  if (prospect.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of prospect.events) {
      lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }

  if (prospect.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of prospect.messages) {
      const staff = m.isStaff ? " [STAFF]" : "";
      lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${staff}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

export function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((u: unknown) => typeof u === "string");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u: unknown) => typeof u === "string");
  } catch {
    // Not JSON, try comma-separated
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("cdn.discordapp.com");
}

export const ALL_TIERS = ["normal", "community_officer", "admin_officer", "comp_team", "whitelist"] as const;

export const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
  comp_team: "Comp Team",
  whitelist: "Whitelist",
};

/** Tier -> token text color (tokenized: blue-400 -> team-one, emerald-400 -> success). */
export const TIER_COLORS: Record<string, string> = {
  normal: "text-text-secondary",
  community_officer: "text-accent",
  admin_officer: "text-danger",
  comp_team: "text-team-one",
  whitelist: "text-success",
};

export function getVisibleTiers(permissions: Permission[]): string[] {
  if (
    permissions.includes("developer") ||
    permissions.includes("view:tickets") ||
    permissions.includes("manage:tickets")
  ) {
    return [...ALL_TIERS];
  }
  const tiers: string[] = [];
  if (permissions.includes("view:tickets:normal")) tiers.push("normal");
  if (permissions.includes("view:tickets:community_officer")) tiers.push("community_officer");
  if (permissions.includes("view:tickets:admin_officer")) tiers.push("admin_officer");
  if (permissions.includes("view:tickets:comp_team")) tiers.push("comp_team");
  if (permissions.includes("view:tickets:whitelist")) tiers.push("whitelist");
  return tiers;
}

export const LEGACY_MSG_STYLES: Record<string, { border: string; bg: string; label: string; labelColor: string }> = {
  from_user: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "User", labelColor: "bg-team-one/15 text-team-one" },
  chat: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "Chat", labelColor: "bg-team-one/15 text-team-one" },
  to_user: { border: "border-accent/20", bg: "bg-accent/5", label: "Staff", labelColor: "bg-accent/15 text-accent" },
  command: { border: "border-accent/20", bg: "bg-accent/5", label: "Command", labelColor: "bg-accent/15 text-accent" },
  bot: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
  bot_to_user: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && bun test test/tickets-lib.test.ts`
Expected: PASS (6 tests, 0 warnings).

- [ ] **Step 5: Commit**

```bash
git add "packages/web/app/(protected)/tickets/lib.ts" packages/web/test/tickets-lib.test.ts
git commit -m "refactor(web): extract tickets lib helpers with tokenized maps"
```

---

### Task 4: ticket-detail.tsx — current + legacy transcript panels

**Files:**
- Create: `packages/web/app/(protected)/tickets/ticket-detail.tsx`
- Test: `packages/web/test/ticket-detail.test.tsx`
- Source to transcribe: current `page.tsx` — `MessageAttachments` (152-182), `StatusBadge`/`LegacyMessageItem` (238-262), `LegacyTicketDetail` (264-319), `TicketDetail` (321-433), `DetailSkeleton` (591-610).

**Interfaces:**
- Consumes: `./lib` (fmtDate, exportTicketText, exportLegacyTicketText, parseAttachments, isImageUrl, LEGACY_MSG_STYLES), `@/components/description-list` (DescriptionList, InfoField), `@/components/download-button` (DownloadButton), `@/components/skeleton` (Skeleton, SkeletonRegion).
- Produces:
  - `MessageAttachments({ attachments: string | null })` (also imported by Task 5)
  - `TicketDetailPanel({ ticket: Ticket; detail: Ticket | undefined; ensureDetail: (id: number) => void; displayName: (id: string | null) => string })`
  - `LegacyTicketDetailPanel({ ticket: LegacyTicket; detail: LegacyTicket | undefined; ensureDetail: (id: number) => void })`
- Behavior: each `*Panel` calls `ensureDetail(id)` once on mount (lazy fetch trigger); renders `<DetailSkeleton />` until `detail` is defined, then the transcript. NO outer `border-t px-5` wrapper (the DataTable detail cell already pads) — use a `space-y-5` container.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/ticket-detail.test.tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { Ticket, LegacyTicket } from "shared";
import { TicketDetailPanel, LegacyTicketDetailPanel } from "@/app/(protected)/tickets/ticket-detail";

const full: Ticket = {
  id: 7, uuid: "u-7", channelId: "c", userId: "111",
  status: "closed", tier: "normal",
  createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
  events: [{ id: 1, ticketId: 7, eventType: "created", actorId: "111", detail: "opened", createdAt: "2026-01-01T00:00:00.000Z" }],
  messages: [{ id: 1, ticketId: 7, authorId: "111", authorTag: "User#1", content: "hello there", attachments: null, isStaff: false, createdAt: "2026-01-01T00:00:00.000Z" }],
};

test("renders skeleton until detail arrives, then the transcript + download", () => {
  const calls: number[] = [];
  const ensure = (id: number) => calls.push(id);
  const stub: Ticket = { ...full, events: [], messages: [] };

  const { rerender } = render(
    <TicketDetailPanel ticket={stub} detail={undefined} ensureDetail={ensure} displayName={(id) => `name:${id}`} />,
  );
  expect(calls).toEqual([7]); // fetch triggered on mount
  expect(screen.queryByText("hello there")).toBeNull();

  rerender(
    <TicketDetailPanel ticket={stub} detail={full} ensureDetail={ensure} displayName={(id) => `name:${id}`} />,
  );
  expect(screen.getByText("hello there")).toBeDefined();
  expect(screen.getByText("name:111")).toBeDefined(); // displayName applied
  expect(screen.getByRole("button", { name: /download/i })).toBeDefined();
});

test("legacy panel renders its messages once detail arrives", () => {
  const legacy: LegacyTicket = {
    id: 3, uuid: "l-3", threadNumber: 12, userId: "9", username: "bob",
    nickname: null, previousThreads: null, startedAt: "2026-01-01T00:00:00.000Z", closedAt: null,
    messages: [{ id: 1, ticketId: 3, type: "from_user", author: "bob", content: "legacy hi", createdAt: "2026-01-01T00:00:00.000Z" }],
  };
  render(<LegacyTicketDetailPanel ticket={legacy} detail={legacy} ensureDetail={() => {}} />);
  expect(screen.getByText("legacy hi")).toBeDefined();
  expect(screen.getByRole("button", { name: /download/i })).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && bun test test/ticket-detail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/web/app/(protected)/tickets/ticket-detail.tsx
"use client";

import { useEffect } from "react";
import type { Ticket, LegacyTicket, LegacyTicketMessage } from "shared";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { DescriptionList, InfoField } from "@/components/description-list";
import { DownloadButton } from "@/components/download-button";
import {
  fmtDate,
  exportTicketText,
  exportLegacyTicketText,
  parseAttachments,
  isImageUrl,
  LEGACY_MSG_STYLES,
} from "./lib";

export function MessageAttachments({ attachments }: { attachments: string | null }) {
  const urls = parseAttachments(attachments);
  if (urls.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url, i) =>
        isImageUrl(url) ? (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={url}
              alt={`Attachment ${i + 1}`}
              className="max-h-32 max-w-48 rounded-sm border border-border/50 object-cover transition-opacity hover:opacity-80"
              loading="lazy"
            />
          </a>
        ) : (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-accent transition-colors hover:bg-bg-card-hover"
          >
            Attachment {i + 1}
          </a>
        )
      )}
    </div>
  );
}

function LegacyMessageItem({ msg }: { msg: LegacyTicketMessage }) {
  const style = LEGACY_MSG_STYLES[msg.type] || LEGACY_MSG_STYLES.bot;
  const isBotType = msg.type === "bot" || msg.type === "bot_to_user";

  return (
    <div className={`rounded-sm border p-3 ${style.border} ${style.bg}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-sm font-medium ${isBotType ? "text-text-muted" : "text-text-primary"}`}>
          {msg.author || "System"}
        </span>
        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        <span className="text-xs text-text-muted">{fmtDate(msg.createdAt)}</span>
      </div>
      {msg.content && (
        <p className={`whitespace-pre-wrap text-sm ${isBotType ? "text-text-muted" : "text-text-secondary"}`}>
          {msg.content}
        </p>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <SkeletonRegion label="Loading details…" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-sm" />
        <Skeleton className="h-16 w-full rounded-sm" />
      </div>
    </SkeletonRegion>
  );
}

function TicketDetailBody({
  ticket,
  displayName,
}: {
  ticket: Ticket;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <DescriptionList className="lg:grid-cols-4">
          <InfoField label="User">{displayName(ticket.userId)}</InfoField>
          <InfoField label="Created">{fmtDate(ticket.createdAt)}</InfoField>
          {ticket.closedAt && <InfoField label="Closed">{fmtDate(ticket.closedAt)}</InfoField>}
          {ticket.closedBy && <InfoField label="Closed By">{displayName(ticket.closedBy)}</InfoField>}
        </DescriptionList>
        <DownloadButton text={exportTicketText(ticket)} filename={`ticket-${ticket.id}.txt`} />
      </div>

      {ticket.events && ticket.events.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Timeline</h4>
          <div className="space-y-2">
            {ticket.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary capitalize">{event.eventType}</span>
                    <span className="text-xs text-text-muted">by {displayName(event.actorId)}</span>
                  </div>
                  {event.detail && <p className="text-xs text-text-secondary">{event.detail}</p>}
                  <span className="text-xs text-text-muted">{fmtDate(event.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ticket.messages && ticket.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Messages</h4>
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-sm border p-3 ${
                  msg.isStaff ? "border-accent/20 bg-accent/5" : "border-border/50 bg-bg-tertiary/30"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{msg.authorTag}</span>
                  {msg.isStaff && (
                    <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
                      Staff
                    </span>
                  )}
                  <span className="text-xs text-text-muted">{fmtDate(msg.createdAt)}</span>
                </div>
                {msg.content && (
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">{msg.content}</p>
                )}
                <MessageAttachments attachments={msg.attachments} />
              </div>
            ))}
          </div>
        </div>
      )}

      {!ticket.events?.length && !ticket.messages?.length && (
        <p className="py-4 text-center text-sm text-text-muted">No events or messages recorded</p>
      )}
    </div>
  );
}

function LegacyTicketDetailBody({ ticket }: { ticket: LegacyTicket }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <DescriptionList className="lg:grid-cols-4">
          <InfoField label="User">{ticket.nickname || ticket.username}</InfoField>
          {ticket.threadNumber && <InfoField label="Thread">#{ticket.threadNumber}</InfoField>}
          <InfoField label="Started">{fmtDate(ticket.startedAt)}</InfoField>
          {ticket.closedAt && <InfoField label="Closed">{fmtDate(ticket.closedAt)}</InfoField>}
          {ticket.previousThreads != null && ticket.previousThreads > 0 && (
            <InfoField label="Previous Threads">{ticket.previousThreads}</InfoField>
          )}
        </DescriptionList>
        <DownloadButton text={exportLegacyTicketText(ticket)} filename={`legacy-ticket-${ticket.id}.txt`} />
      </div>

      {ticket.messages && ticket.messages.length > 0 ? (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Messages ({ticket.messages.length})
          </h4>
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
              <LegacyMessageItem key={msg.id} msg={msg} />
            ))}
          </div>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-text-muted">No messages recorded</p>
      )}
    </div>
  );
}

export function TicketDetailPanel({
  ticket,
  detail,
  ensureDetail,
  displayName,
}: {
  ticket: Ticket;
  detail: Ticket | undefined;
  ensureDetail: (id: number) => void;
  displayName: (id: string | null) => string;
}) {
  useEffect(() => {
    ensureDetail(ticket.id);
  }, [ticket.id, ensureDetail]);

  if (!detail) return <DetailSkeleton />;
  return <TicketDetailBody ticket={detail} displayName={displayName} />;
}

export function LegacyTicketDetailPanel({
  ticket,
  detail,
  ensureDetail,
}: {
  ticket: LegacyTicket;
  detail: LegacyTicket | undefined;
  ensureDetail: (id: number) => void;
}) {
  useEffect(() => {
    ensureDetail(ticket.id);
  }, [ticket.id, ensureDetail]);

  if (!detail) return <DetailSkeleton />;
  return <LegacyTicketDetailBody ticket={detail} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && bun test test/ticket-detail.test.tsx`
Expected: PASS (2 tests, 0 warnings).

- [ ] **Step 5: Commit**

```bash
git add "packages/web/app/(protected)/tickets/ticket-detail.tsx" packages/web/test/ticket-detail.test.tsx
git commit -m "refactor(web): add tickets transcript detail panels"
```

---

### Task 5: prospect-detail.tsx — prospect detail panel

**Files:**
- Create: `packages/web/app/(protected)/tickets/prospect-detail.tsx`
- Test: `packages/web/test/prospect-detail.test.tsx`
- Source to transcribe: current `page.tsx` — `ProspectDetail` (435-589).

**Interfaces:**
- Consumes: `./lib` (fmtDate, exportProspectText), `./ticket-detail` (MessageAttachments), `@/components/description-list` (DescriptionList, InfoField), `@/components/download-button` (DownloadButton), `@/components/copyable-id` (CopyableId), `@/components/skeleton` (Skeleton, SkeletonRegion).
- Produces: `ProspectDetailPanel({ prospect: Prospect; detail: Prospect | undefined; ensureDetail: (id: number) => void; displayName: (id: string | null) => string })` — same skeleton-until-detail + `space-y-5` container contract as Task 4. Application-info grid uses `DescriptionList`/`InfoField`; the Steam ID uses `CopyableId`; votes/timeline/messages keep their current rendering (already token-based). Reuse the SAME `DetailSkeleton` shape as Task 4 (transcribe it locally — it is a tiny private helper, duplication is acceptable per the two-panel split).

**Note on CopyableId:** check `@/components/copyable-id` for the exact prop name (it renders a JetBrains-Mono ID with a copy affordance). If its value prop differs from `value`, adapt. Fallback if unclear: render `<span className="font-mono text-xs text-accent">{prospect.steamId}</span>` inside the InfoField. Resolve this before writing the test's Steam-ID assertion.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/prospect-detail.test.tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { Prospect } from "shared";
import { ProspectDetailPanel } from "@/app/(protected)/tickets/prospect-detail";

const prospect: Prospect = {
  id: 5, uuid: "p-5", channelId: "c", userId: "9", status: "open", alias: "Alfa",
  nationality: "NO", dateOfBirth: "2000-01-01", squadHours: 120, preferredRoles: "SL, Medic",
  prevClan: "", whyRb: "I like the community", activeHours: "evenings", competitive: "yes",
  steamId: "76561198000000000", mentorId: null, pausedAt: null, extraDays: 0,
  createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
  votes: [{ id: 1, prospectId: 5, voterId: "1", voterTag: "Cap#1", vote: "yes", reason: "solid", createdAt: "2026-01-01T00:00:00.000Z" }],
  events: [], messages: [],
};

test("triggers fetch on mount and renders application info once detail arrives", () => {
  const calls: number[] = [];
  const { rerender } = render(
    <ProspectDetailPanel prospect={prospect} detail={undefined} ensureDetail={(id) => calls.push(id)} displayName={(id) => `name:${id}`} />,
  );
  expect(calls).toEqual([5]);
  expect(screen.queryByText("I like the community")).toBeNull();

  rerender(
    <ProspectDetailPanel prospect={prospect} detail={prospect} ensureDetail={() => {}} displayName={(id) => `name:${id}`} />,
  );
  expect(screen.getByText("I like the community")).toBeDefined();
  expect(screen.getByText("76561198000000000")).toBeDefined();
  expect(screen.getByText("Cap#1")).toBeDefined(); // vote
  expect(screen.getByRole("button", { name: /download/i })).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && bun test test/prospect-detail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Transcribe `ProspectDetail` (source 435-589) into a `ProspectDetailBody`, applying these transforms, then wrap it in the self-fetching `ProspectDetailPanel`:

1. Drop the outer `<div className="border-t border-border/50 px-5 pb-5 pt-4">`; use `<div className="space-y-5">`.
2. Replace the application-info grid (`<div className="mb-5 grid gap-3 ...">` block, source 442-485) with a `DescriptionList` of `InfoField`s: Alias, Nationality, Date of Birth, Squad Hours (`{p.squadHours}h`), Preferred Roles, Previous Clan (`{p.prevClan || "--"}`), Active Hours, Competitive, Steam ID (`<CopyableId ... />`), and Mentor (`displayName(p.mentorId)`, only when `p.mentorId`).
3. Keep the "Why Royal Battalion?" block, votes block, timeline block, and messages block VERBATIM (they already use tokens: success/danger/accent). Replace the DownloadButton usage with the shared `@/components/download-button` (same `text`/`filename` args). Reuse `MessageAttachments` from `./ticket-detail`.
4. The `ProspectDetailPanel` wrapper mirrors Task 4 exactly (useEffect ensureDetail on mount; `<DetailSkeleton />` until `detail`).

```tsx
// packages/web/app/(protected)/tickets/prospect-detail.tsx
"use client";

import { useEffect } from "react";
import type { Prospect } from "shared";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { DescriptionList, InfoField } from "@/components/description-list";
import { DownloadButton } from "@/components/download-button";
import { CopyableId } from "@/components/copyable-id";
import { fmtDate, exportProspectText } from "./lib";
import { MessageAttachments } from "./ticket-detail";

function DetailSkeleton() {
  return (
    <SkeletonRegion label="Loading details…" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-sm" />
        <Skeleton className="h-16 w-full rounded-sm" />
      </div>
    </SkeletonRegion>
  );
}

function ProspectDetailBody({
  prospect,
  displayName,
}: {
  prospect: Prospect;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <DownloadButton text={exportProspectText(prospect)} filename={`prospect-${prospect.alias}.txt`} />
      </div>

      <DescriptionList>
        <InfoField label="Alias">{prospect.alias}</InfoField>
        <InfoField label="Nationality">{prospect.nationality}</InfoField>
        <InfoField label="Date of Birth">{prospect.dateOfBirth}</InfoField>
        <InfoField label="Squad Hours">{prospect.squadHours}h</InfoField>
        <InfoField label="Preferred Roles">{prospect.preferredRoles}</InfoField>
        <InfoField label="Previous Clan">{prospect.prevClan || "--"}</InfoField>
        <InfoField label="Active Hours">{prospect.activeHours}</InfoField>
        <InfoField label="Competitive">{prospect.competitive}</InfoField>
        <InfoField label="Steam ID">
          <CopyableId value={prospect.steamId} />
        </InfoField>
        {prospect.mentorId && <InfoField label="Mentor">{displayName(prospect.mentorId)}</InfoField>}
      </DescriptionList>

      <div>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">Why Royal Battalion?</span>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{prospect.whyRb}</p>
      </div>

      {prospect.votes && prospect.votes.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Votes ({prospect.votes.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {prospect.votes.map((v) => {
              const color =
                v.vote === "yes"
                  ? "text-success border-success/30 bg-success/10"
                  : v.vote === "no"
                    ? "text-danger border-danger/30 bg-danger/10"
                    : "text-accent border-accent/30 bg-accent/10";
              return (
                <div key={v.id} className={`rounded-sm border px-3 py-1.5 ${color}`}>
                  <div className="text-xs font-medium">{v.voterTag || v.voterId}</div>
                  <div className="text-[10px] uppercase font-semibold">{v.vote}</div>
                  {v.reason && <div className="mt-0.5 text-[10px] opacity-80">{v.reason}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {prospect.events && prospect.events.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Timeline</h4>
          <div className="space-y-2">
            {prospect.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {event.eventType.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-text-muted">by {displayName(event.actorId)}</span>
                  </div>
                  {event.detail && <p className="text-xs text-text-secondary">{event.detail}</p>}
                  <span className="text-xs text-text-muted">{fmtDate(event.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {prospect.messages && prospect.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Messages</h4>
          <div className="space-y-3">
            {prospect.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-sm border p-3 ${
                  msg.isStaff ? "border-accent/20 bg-accent/5" : "border-border/50 bg-bg-tertiary/30"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{msg.authorTag}</span>
                  {msg.isStaff && (
                    <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
                      Staff
                    </span>
                  )}
                  <span className="text-xs text-text-muted">{fmtDate(msg.createdAt)}</span>
                </div>
                {msg.content && (
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">{msg.content}</p>
                )}
                <MessageAttachments attachments={msg.attachments} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProspectDetailPanel({
  prospect,
  detail,
  ensureDetail,
  displayName,
}: {
  prospect: Prospect;
  detail: Prospect | undefined;
  ensureDetail: (id: number) => void;
  displayName: (id: string | null) => string;
}) {
  useEffect(() => {
    ensureDetail(prospect.id);
  }, [prospect.id, ensureDetail]);

  if (!detail) return <DetailSkeleton />;
  return <ProspectDetailBody prospect={detail} displayName={displayName} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && bun test test/prospect-detail.test.tsx`
Expected: PASS (1 test, 0 warnings). If the `CopyableId` prop name differs, fix the import/usage and the Steam-ID assertion per the Interfaces note, then re-run.

- [ ] **Step 5: Commit**

```bash
git add "packages/web/app/(protected)/tickets/prospect-detail.tsx" packages/web/test/prospect-detail.test.tsx
git commit -m "refactor(web): add prospect detail panel"
```

---

### Task 6: tickets-tab.tsx — unified tickets DataTable consumer

**Files:**
- Create: `packages/web/app/(protected)/tickets/tickets-tab.tsx`
- Test: `packages/web/test/tickets-tab.test.tsx`
- Source for filter logic: current `page.tsx` — `filteredUnifiedTickets` (1020-1064), the tickets `handleExpand*` (969-999), the status/tier `<select>`s (1161-1184).

**Interfaces:**
- Consumes: `@/components/data-table-v2` (DataTable), `@/components/filter-bar` (FilterBar, ActiveFilter), `@/components/search-input-v2` (SearchInput), `@/components/empty-state` (EmptyState), `@/components/status-badge` (StatusBadge, ticketStatusVariant), `./lib` (TIER_LABELS, TIER_COLORS, getVisibleTiers), `./ticket-detail` (TicketDetailPanel, LegacyTicketDetailPanel), `@/lib/api-client` (getTickets, getTicket, getLegacyTickets, getLegacyTicket, resolveDiscordNames), `@/hooks/use-auto-refresh` (useAutoRefresh).
- Produces: `default TicketsTab({ token: string | null; permissions: Permission[]; api?: TicketsApi })` and `export type TicketsApi`.
- Row model: `type UnifiedTicket = { kind: "current"; data: Ticket } | { kind: "legacy"; data: LegacyTicket }`; `getRowId` = `` `${kind}-${data.id}` ``.

**Behavior to preserve (verbatim from source):**
- Filter `filteredUnifiedTickets` logic EXACTLY (status/tier/visibleTiers/search across both current + legacy, then merge + sort by date desc). Legacy rows: only shown when `statusFilter` is `all`/`closed` and `tierFilter` is `all`/`legacy`.
- Lazy detail: on expand, fetch `getTicket`/`getLegacyTicket` once and cache; `resolveNames` for event actors after ticket-detail load.
- Discord name resolution: `resolveNames` collects unknown ids, dedupes, calls `resolveDiscordNames`, merges into `nameMap`; `displayName(id)` returns `nameMap[id] || id`, `"--"` for null.
- Initial load + 20s `useAutoRefresh` (both `getTickets` + `getLegacyTickets`); resolve `[userId, closedBy]` names on load.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/tickets-tab.test.tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { Ticket, LegacyTicket, Permission } from "shared";
import TicketsTab, { type TicketsApi } from "@/app/(protected)/tickets/tickets-tab";

const t1: Ticket = { id: 1, uuid: "u1", channelId: "c", userId: "100", status: "open", tier: "normal", createdAt: "2026-02-01T00:00:00.000Z", closedAt: null, closedBy: null };
const t2: Ticket = { id: 2, uuid: "u2", channelId: "c", userId: "200", status: "closed", tier: "comp_team", createdAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-05T00:00:00.000Z", closedBy: "300" };
const legacy: LegacyTicket = { id: 9, uuid: "l9", threadNumber: 42, userId: "400", username: "olduser", nickname: null, previousThreads: null, startedAt: "2025-12-01T00:00:00.000Z", closedAt: null };

function makeApi(overrides: Partial<TicketsApi> = {}): TicketsApi {
  return {
    getTickets: async () => ({ success: true, data: [t1, t2] }),
    getLegacyTickets: async () => ({ success: true, data: [legacy] }),
    getTicket: async (_t, id) => ({ success: true, data: { ...(id === 1 ? t1 : t2), messages: [{ id: 1, ticketId: id, authorId: "100", authorTag: "Neo#1", content: "detail body", attachments: null, isStaff: false, createdAt: "2026-02-01T00:00:00.000Z" }] } }),
    getLegacyTicket: async (_t, _id) => ({ success: true, data: { ...legacy, messages: [] } }),
    resolveDiscordNames: async () => ({ success: true, data: {} }),
    ...overrides,
  };
}

const allPerms = ["view:tickets"] as Permission[];

test("loads and lists current + legacy rows", async () => {
  render(<TicketsTab token="tok" permissions={allPerms} api={makeApi()} />);
  expect(await screen.findByText(/Ticket #1/)).toBeDefined();
  expect(screen.getByText(/Ticket #2/)).toBeDefined();
  expect(screen.getByText(/Thread #42/)).toBeDefined();
});

test("search filters the list", async () => {
  render(<TicketsTab token="tok" permissions={allPerms} api={makeApi()} />);
  await screen.findByText(/Ticket #1/);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "olduser" } });
  await waitFor(() => expect(screen.queryByText(/Ticket #1/)).toBeNull());
  expect(screen.getByText(/Thread #42/)).toBeDefined();
});

test("expanding a ticket fetches and shows the transcript", async () => {
  render(<TicketsTab token="tok" permissions={allPerms} api={makeApi()} />);
  await screen.findByText(/Ticket #1/);
  const expanders = screen.getAllByRole("button", { name: "Expand row" });
  fireEvent.click(expanders[0]);
  expect(await screen.findByText("detail body")).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && bun test test/tickets-tab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/web/app/(protected)/tickets/tickets-tab.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Ticket, LegacyTicket, Permission } from "shared";
import {
  getTickets,
  getTicket,
  getLegacyTickets,
  getLegacyTicket,
  resolveDiscordNames,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table-v2";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { SearchInput } from "@/components/search-input-v2";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, ticketStatusVariant } from "@/components/status-badge";
import { TIER_LABELS, TIER_COLORS, getVisibleTiers } from "./lib";
import { TicketDetailPanel, LegacyTicketDetailPanel } from "./ticket-detail";

export type TicketsApi = {
  getTickets: typeof getTickets;
  getTicket: typeof getTicket;
  getLegacyTickets: typeof getLegacyTickets;
  getLegacyTicket: typeof getLegacyTicket;
  resolveDiscordNames: typeof resolveDiscordNames;
};

const defaultApi: TicketsApi = {
  getTickets,
  getTicket,
  getLegacyTickets,
  getLegacyTicket,
  resolveDiscordNames,
};

type UnifiedTicket =
  | { kind: "current"; data: Ticket }
  | { kind: "legacy"; data: LegacyTicket };

export default function TicketsTab({
  token,
  permissions,
  api = defaultApi,
}: {
  token: string | null;
  permissions: Permission[];
  api?: TicketsApi;
}) {
  const visibleTiers = useMemo(() => getVisibleTiers(permissions), [permissions]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [legacyTickets, setLegacyTickets] = useState<LegacyTicket[]>([]);
  const [ticketDetails, setTicketDetails] = useState<Record<number, Ticket>>({});
  const [legacyDetails, setLegacyDetails] = useState<Record<number, LegacyTicket>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");

  const resolveNames = useCallback(
    async (ids: string[]) => {
      if (!token) return;
      const unknown = ids.filter((id) => id);
      if (unknown.length === 0) return;
      const res = await api.resolveDiscordNames(token, [...new Set(unknown)]);
      if (res.success && res.data) setNameMap((prev) => ({ ...prev, ...res.data }));
    },
    [token, api],
  );

  const displayName = useCallback(
    (id: string | null): string => (!id ? "--" : nameMap[id] || id),
    [nameMap],
  );

  const load = useCallback(async () => {
    if (!token) return;
    const [ticketRes, legacyRes] = await Promise.all([
      api.getTickets(token),
      api.getLegacyTickets(token),
    ]);
    if (ticketRes.success && ticketRes.data) {
      setTickets(ticketRes.data);
      resolveNames(ticketRes.data.flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]));
    }
    if (legacyRes.success && legacyRes.data) setLegacyTickets(legacyRes.data);
  }, [token, api, resolveNames]);

  useEffect(() => {
    if (!token) return;
    load().finally(() => setLoaded(true));
  }, [token, load]);

  useAutoRefresh(load, 20_000, !!token);

  const ensureTicketDetail = useCallback(
    async (id: number) => {
      if (ticketDetails[id] || !token) return;
      const res = await api.getTicket(token, id);
      if (res.success && res.data) {
        setTicketDetails((prev) => ({ ...prev, [id]: res.data! }));
        resolveNames((res.data.events || []).map((e) => e.actorId).filter(Boolean));
      }
    },
    [ticketDetails, token, api, resolveNames],
  );

  const ensureLegacyDetail = useCallback(
    async (id: number) => {
      if (legacyDetails[id] || !token) return;
      const res = await api.getLegacyTicket(token, id);
      if (res.success && res.data) setLegacyDetails((prev) => ({ ...prev, [id]: res.data! }));
    },
    [legacyDetails, token, api],
  );

  const rows = useMemo<UnifiedTicket[]>(() => {
    const q = search.toLowerCase();

    const currentFiltered: UnifiedTicket[] = tickets
      .filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (tierFilter !== "all" && tierFilter !== "legacy" && t.tier !== tierFilter) return false;
        if (tierFilter === "legacy") return false;
        if (!visibleTiers.length || !visibleTiers.includes(t.tier)) return false;
        if (!q) return true;
        return (
          String(t.id).includes(q) ||
          t.userId.toLowerCase().includes(q) ||
          t.uuid.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q) ||
          (nameMap[t.userId] || "").toLowerCase().includes(q)
        );
      })
      .map((data): UnifiedTicket => ({ kind: "current", data }));

    const legacyFiltered: UnifiedTicket[] = legacyTickets
      .filter((t) => {
        if (statusFilter !== "all" && statusFilter !== "closed") return false;
        if (tierFilter !== "all" && tierFilter !== "legacy") return false;
        if (!q) return true;
        return (
          String(t.id).includes(q) ||
          (t.threadNumber ? String(t.threadNumber).includes(q) : false) ||
          t.username.toLowerCase().includes(q) ||
          (t.nickname || "").toLowerCase().includes(q) ||
          t.userId.toLowerCase().includes(q) ||
          t.uuid.toLowerCase().includes(q)
        );
      })
      .map((data): UnifiedTicket => ({ kind: "legacy", data }));

    const unified = [...currentFiltered, ...legacyFiltered];
    unified.sort((a, b) => {
      const dateA = a.kind === "current" ? a.data.createdAt : a.data.startedAt;
      const dateB = b.kind === "current" ? b.data.createdAt : b.data.startedAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    return unified;
  }, [tickets, legacyTickets, search, statusFilter, tierFilter, visibleTiers, nameMap]);

  const activeFilters: ActiveFilter[] = [];
  if (statusFilter !== "all") activeFilters.push({ key: "status", label: `Status: ${statusFilter}` });
  if (tierFilter !== "all") {
    activeFilters.push({ key: "tier", label: `Type: ${tierFilter === "legacy" ? "Legacy" : TIER_LABELS[tierFilter] || tierFilter}` });
  }

  const columns = useMemo<ColumnDef<UnifiedTicket, unknown>[]>(
    () => [
      {
        id: "ref",
        header: "Ticket",
        cell: ({ row }) => {
          const item = row.original;
          const label =
            item.kind === "current"
              ? `Ticket #${item.data.id}`
              : item.data.threadNumber
                ? `Thread #${item.data.threadNumber}`
                : `Ticket #${item.data.id}`;
          return <span className="font-display text-sm font-semibold tracking-wide text-text-primary">{label}</span>;
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.kind === "current" ? (
            <StatusBadge variant={ticketStatusVariant(row.original.data.status)} />
          ) : (
            <StatusBadge variant="ticket-closed" />
          ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => {
          const item = row.original;
          if (item.kind === "legacy") return <StatusBadge variant="ticket-legacy" />;
          return (
            <span className={`text-xs ${TIER_COLORS[item.data.tier] || "text-text-muted"}`}>
              {TIER_LABELS[item.data.tier] || item.data.tier}
            </span>
          );
        },
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const item = row.original;
          const label = item.kind === "current" ? displayName(item.data.userId) : item.data.nickname || item.data.username;
          return <span className="text-sm text-text-secondary">{label}</span>;
        },
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => {
          const item = row.original;
          const iso = item.kind === "current" ? item.data.createdAt : item.data.startedAt;
          return <span className="text-xs text-text-muted">{new Date(iso).toLocaleDateString()}</span>;
        },
      },
      {
        id: "closed",
        header: "Closed",
        cell: ({ row }) => {
          const closed = row.original.data.closedAt;
          return closed ? (
            <span className="text-xs text-text-muted">{new Date(closed).toLocaleDateString()}</span>
          ) : (
            <span className="text-text-muted">--</span>
          );
        },
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => {
          const item = row.original;
          const href = item.kind === "current" ? `/ticket/${item.data.uuid}` : `/ticket/legacy/${item.data.uuid}`;
          return (
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-7 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
              title="Open in new tab"
            >
              <ExternalLink className="size-4" />
            </Link>
          );
        },
      },
    ],
    [displayName],
  );

  return (
    <>
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={(key) => {
          if (key === "status") setStatusFilter("all");
          if (key === "tier") setTierFilter("all");
        }}
        onClearAll={() => {
          setStatusFilter("all");
          setTierFilter("all");
        }}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by ID, user, UUID, username..."
          className="min-w-64 flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {["all", "open", "closing", "closed"].map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="all">All Types</option>
          {visibleTiers.map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t] || t}
            </option>
          ))}
          <option value="legacy">Legacy</option>
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => `${r.kind}-${r.data.id}`}
        pageSize={50}
        loading={!loaded}
        renderDetail={(row) =>
          row.kind === "current" ? (
            <TicketDetailPanel
              ticket={row.data}
              detail={ticketDetails[row.data.id]}
              ensureDetail={ensureTicketDetail}
              displayName={displayName}
            />
          ) : (
            <LegacyTicketDetailPanel
              ticket={row.data}
              detail={legacyDetails[row.data.id]}
              ensureDetail={ensureLegacyDetail}
            />
          )
        }
        emptyState={
          <EmptyState
            className="py-8"
            message={
              tickets.length === 0 && legacyTickets.length === 0
                ? "No tickets found"
                : "No tickets match your search"
            }
          />
        }
      />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && bun test test/tickets-tab.test.tsx`
Expected: PASS (3 tests, 0 warnings).

- [ ] **Step 5: Commit**

```bash
git add "packages/web/app/(protected)/tickets/tickets-tab.tsx" packages/web/test/tickets-tab.test.tsx
git commit -m "refactor(web): rebuild tickets list on DataTable-v2"
```

---

### Task 7: prospects-tab.tsx — prospects DataTable consumer

**Files:**
- Create: `packages/web/app/(protected)/tickets/prospects-tab.tsx`
- Test: `packages/web/test/prospects-tab.test.tsx`
- Source for filter logic: current `page.tsx` — `filteredProspects` (1066-1080), `handleExpandProspect` (1001-1018).

**Interfaces:**
- Consumes: DataTable, FilterBar, SearchInput, EmptyState, StatusBadge/ticketStatusVariant, `./prospect-detail` (ProspectDetailPanel), api-client (getProspects, getProspect, resolveDiscordNames), useAutoRefresh.
- Produces: `default ProspectsTab({ token: string | null; api?: ProspectsApi })` and `export type ProspectsApi`.
- Behavior: preserve `filteredProspects` search logic (alias/userId/nationality/status/steamId/uuid) + status filter (`all`/open/closed/accepted/denied); lazy `getProspect` on expand with cache; resolve `[userId, closedBy, mentorId]` on load and `[event.actorId, vote.voterId]` on detail load; 20s auto-refresh.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/prospects-tab.test.tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Prospect } from "shared";
import ProspectsTab, { type ProspectsApi } from "@/app/(protected)/tickets/prospects-tab";

const p1: Prospect = {
  id: 1, uuid: "p1", channelId: "c", userId: "10", status: "open", alias: "Bravo",
  nationality: "SE", dateOfBirth: "1999", squadHours: 50, preferredRoles: "Medic", prevClan: "",
  whyRb: "reasons", activeHours: "day", competitive: "no", steamId: "765", mentorId: null,
  pausedAt: null, extraDays: 0, createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
};

function makeApi(): ProspectsApi {
  return {
    getProspects: async () => ({ success: true, data: [p1] }),
    getProspect: async (_t, _id) => ({ success: true, data: { ...p1, whyRb: "full application text" } }),
    resolveDiscordNames: async () => ({ success: true, data: {} }),
  };
}

test("lists prospects and expands to fetch detail", async () => {
  render(<ProspectsTab token="tok" api={makeApi()} />);
  expect(await screen.findByText("Bravo")).toBeDefined();
  fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]);
  expect(await screen.findByText("full application text")).toBeDefined();
});

test("status filter narrows the list", async () => {
  render(<ProspectsTab token="tok" api={makeApi()} />);
  await screen.findByText("Bravo");
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[0], { target: { value: "accepted" } });
  expect(screen.queryByText("Bravo")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && bun test test/prospects-tab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/web/app/(protected)/tickets/prospects-tab.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Prospect } from "shared";
import { getProspects, getProspect, resolveDiscordNames } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table-v2";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { SearchInput } from "@/components/search-input-v2";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, ticketStatusVariant } from "@/components/status-badge";
import { ProspectDetailPanel } from "./prospect-detail";

export type ProspectsApi = {
  getProspects: typeof getProspects;
  getProspect: typeof getProspect;
  resolveDiscordNames: typeof resolveDiscordNames;
};

const defaultApi: ProspectsApi = { getProspects, getProspect, resolveDiscordNames };

export default function ProspectsTab({
  token,
  api = defaultApi,
}: {
  token: string | null;
  api?: ProspectsApi;
}) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [details, setDetails] = useState<Record<number, Prospect>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const resolveNames = useCallback(
    async (ids: string[]) => {
      if (!token) return;
      const unknown = ids.filter((id) => id);
      if (unknown.length === 0) return;
      const res = await api.resolveDiscordNames(token, [...new Set(unknown)]);
      if (res.success && res.data) setNameMap((prev) => ({ ...prev, ...res.data }));
    },
    [token, api],
  );

  const displayName = useCallback(
    (id: string | null): string => (!id ? "--" : nameMap[id] || id),
    [nameMap],
  );

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api.getProspects(token);
    if (res.success && res.data) {
      setProspects(res.data);
      resolveNames(res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]));
    }
  }, [token, api, resolveNames]);

  useEffect(() => {
    if (!token) return;
    load().finally(() => setLoaded(true));
  }, [token, load]);

  useAutoRefresh(load, 20_000, !!token);

  const ensureDetail = useCallback(
    async (id: number) => {
      if (details[id] || !token) return;
      const res = await api.getProspect(token, id);
      if (res.success && res.data) {
        setDetails((prev) => ({ ...prev, [id]: res.data! }));
        resolveNames([
          ...(res.data.events || []).map((e) => e.actorId),
          ...(res.data.votes || []).map((v) => v.voterId),
        ].filter(Boolean));
      }
    },
    [details, token, api, resolveNames],
  );

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return prospects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.alias.toLowerCase().includes(q) ||
        p.userId.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        p.steamId.toLowerCase().includes(q) ||
        p.uuid.toLowerCase().includes(q)
      );
    });
  }, [prospects, search, statusFilter]);

  const activeFilters: ActiveFilter[] = [];
  if (statusFilter !== "all") activeFilters.push({ key: "status", label: `Status: ${statusFilter}` });

  const columns = useMemo<ColumnDef<Prospect, unknown>[]>(
    () => [
      {
        id: "alias",
        header: "Prospect",
        cell: ({ row }) => (
          <span className="font-display text-sm font-semibold tracking-wide text-text-primary">{row.original.alias}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge variant={ticketStatusVariant(row.original.status)} />,
      },
      {
        id: "nationality",
        header: "Nationality",
        cell: ({ row }) => <span className="text-sm text-text-secondary">{row.original.nationality}</span>,
      },
      {
        id: "squadHours",
        header: "Squad Hrs",
        cell: ({ row }) => <span className="text-xs text-text-muted">{row.original.squadHours}h</span>,
      },
      {
        id: "created",
        header: "Applied",
        cell: ({ row }) => (
          <span className="text-xs text-text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Link
            href={`/prospect/${row.original.uuid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-7 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
            title="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={() => setStatusFilter("all")}
        onClearAll={() => setStatusFilter("all")}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by alias, nationality, steam ID, UUID..."
          className="min-w-64 flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {["all", "open", "closed", "accepted", "denied"].map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        pageSize={50}
        loading={!loaded}
        renderDetail={(row) => (
          <ProspectDetailPanel
            prospect={row}
            detail={details[row.id]}
            ensureDetail={ensureDetail}
            displayName={displayName}
          />
        )}
        emptyState={
          <EmptyState
            className="py-8"
            message={prospects.length === 0 ? "No prospect applications found" : "No prospects match your search"}
          />
        }
      />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && bun test test/prospects-tab.test.tsx`
Expected: PASS (2 tests, 0 warnings).

- [ ] **Step 5: Commit**

```bash
git add "packages/web/app/(protected)/tickets/prospects-tab.tsx" packages/web/test/prospects-tab.test.tsx
git commit -m "refactor(web): rebuild prospects list on DataTable-v2"
```

---

### Task 8: page.tsx — thin shell rewrite

**Files:**
- Rewrite: `packages/web/app/(protected)/tickets/page.tsx` (replace the ENTIRE 1,298-line file).

**Interfaces:**
- Consumes: `usePermissions` from `@/lib/permission-context`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `@/components/ui/tabs`, `./tickets-tab` (default), `./prospects-tab` (default).
- Behavior: `usePermissions()` gives `apiToken` + `permissions`; render an `<h1>Tickets</h1>` header, then a `Tabs variant="line"` with two triggers ("Support Tickets" / "Prospect Applications") and two panels. Pass `token={apiToken}` + `permissions` to `TicketsTab`, `token={apiToken}` to `ProspectsTab`. Base UI `Tabs.Panel` mounts lazily (inactive panel unmounted) so each tab fetches only when first shown — preserving the current per-tab load.

- [ ] **Step 1: Confirm the permission-context shape**

Run: `cd packages/web && bunx tsc --noEmit` is deferred to Step 4. First verify the hook exposes `apiToken` and `permissions` (it does — used by the current page line 862: `const { apiToken, permissions } = usePermissions();`). No test step for this thin shell; behavior is covered by Tasks 6–7. Proceed.

- [ ] **Step 2: Write the implementation** (replace the whole file)

```tsx
// packages/web/app/(protected)/tickets/page.tsx
"use client";

import { usePermissions } from "@/lib/permission-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TicketsTab from "./tickets-tab";
import ProspectsTab from "./prospects-tab";

export default function TicketsPage() {
  const { apiToken, permissions } = usePermissions();

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">Tickets</h1>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList variant="line" className="mb-6 w-full justify-start border-b border-border">
          <TabsTrigger value="tickets">Support Tickets</TabsTrigger>
          <TabsTrigger value="prospects">Prospect Applications</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <TicketsTab token={apiToken} permissions={permissions} />
        </TabsContent>
        <TabsContent value="prospects">
          <ProspectsTab token={apiToken} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Run the full suite + typecheck**

Run: `cd packages/web && bun test`
Expected: ALL pass, 0 warnings (the six new test files + extended status-badge test included).

Run: `cd packages/web && bunx tsc --noEmit`
Expected: exit 0. If `permissions` is typed as `string[]` rather than `Permission[]`, cast at the call site (`permissions={permissions as Permission[]}`) — matching how the current page consumed it.

- [ ] **Step 4: Grep-gate — no raw palette, no dead helpers**

Run: `cd packages/web && grep -rnE "blue-[0-9]|emerald-[0-9]|rb-tickets-page-size" "app/(protected)/tickets"`
Expected: NO output (palette tokenized; the old localStorage key retired).

- [ ] **Step 5: Commit**

```bash
git add "packages/web/app/(protected)/tickets/page.tsx"
git commit -m "refactor(web): reduce tickets page to a tabbed shell"
```

---

### Task 9: gallery demo + version bump

**Files:**
- Modify: `packages/web/app/design/gallery.tsx`
- Modify: `package.json` (ROOT)

**Interfaces:**
- Consumes: `DownloadButton` (new), `StatusBadge` (existing import).

- [ ] **Step 1: Add the gallery imports**

In `packages/web/app/design/gallery.tsx`, add after the existing composite imports (near line 31):

```tsx
import { DownloadButton } from "@/components/download-button";
```

- [ ] **Step 2: Add a "Tickets composites" section**

Insert a new `<section>` immediately AFTER the "Live Server composites" section (which starts near line 226). Match the existing section shape (`<section className="space-y-3"><h2 className="font-display text-lg font-bold">...`):

```tsx
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Tickets composites</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant="ticket-open" />
          <StatusBadge variant="ticket-closing" />
          <StatusBadge variant="ticket-closed" />
          <StatusBadge variant="ticket-accepted" />
          <StatusBadge variant="ticket-denied" />
          <StatusBadge variant="ticket-legacy" />
          <DownloadButton text="Ticket #1 [open]" filename="ticket-1.txt" label="Export .txt" />
        </div>
      </section>
```

- [ ] **Step 3: Bump the version**

In ROOT `package.json`, change `"version": "2.10.0"` to `"version": "2.11.0"`.

- [ ] **Step 4: Verify the gallery compiles and version is set**

Run: `cd packages/web && bunx tsc --noEmit`
Expected: exit 0.

Run: `node -e "console.log(require('./package.json').version)"` from the repo root.
Expected: `2.11.0`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/design/gallery.tsx package.json
git commit -m "chore(web): gallery tickets composites and bump to 2.11.0"
```

---

## Self-Review

**Spec coverage** (spec §5 Tickets: "list + filters + expandable detail (timeline, transcript) + .txt export (DownloadButton)"):
- List + filters → Tasks 6/7 (DataTable + FilterBar + SearchInput, filter logic verbatim).
- Expandable detail (timeline, transcript) → Tasks 4/5 (renderDetail panels).
- .txt export (DownloadButton) → Task 1 (composite) + Tasks 4/5 (consumers).
- Read-only, no action buttons → Global Constraints + no `enableSelection`/`bulkActions` anywhere.
- Permission-gated tiers → `getVisibleTiers` moved verbatim (Task 3), consumed in Task 6.
- DownloadButton spec §2 composite → Task 1.

**Placeholder scan:** every code step contains complete code or an exhaustive, exact transformation list against named source line ranges. No TBD/TODO.

**Type consistency:** `TicketsApi`/`ProspectsApi` DI shapes match `@/lib/api-client` signatures (verified: `getTicket(token, id)`, `resolveDiscordNames(token, ids)`, etc.). `UnifiedTicket` row type + `getRowId` `${kind}-${id}` are consistent across Task 6. `ensureDetail(id: number)` signature matches between the tabs (6/7) and the panels (4/5). `ticketStatusVariant` (Task 2) is consumed by Tasks 6/7. `TIER_COLORS`/`TIER_LABELS`/`getVisibleTiers` (Task 3) consumed by Task 6.

**Behavior-preservation watch-items for the reviewer:** (1) the three `export*Text` functions are byte-identical to source; (2) the unified filter logic is transcribed verbatim; (3) lazy-detail caching preserved (ensureDetail checks the cache before fetching); (4) open-in-new-tab hrefs preserved. Sanctioned deltas (pager, tabs, badges, chevron-expand, dropped row icons) are enumerated in Global Constraints so they are not misread as regressions.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-frontend-redesign-phase-2e-tickets.md`. Executing via **Subagent-Driven Development** (the standing choice for this redesign): fresh implementer per task + two-stage review, then a whole-wave fable review.

# Frontend Redesign Phase 2b — Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the dashboard (the densest member-facing page, ~1,300 lines across `page.tsx` + `player-stats-section.tsx`) onto the Gilded Regiment design system: profile header card, BirthdayAdminCard on new ConfigCard/TimezoneCombobox/Switch, personal Squad stats with token-themed recharts, server cards on CapacityBar + multi-series sparkline, and Sonner as the first toast consumer.

**Architecture:** Build the missing shared composites first (toast contract, InfoTip/FieldTip, StatCard extensions, Command+TimezoneCombobox, ConfigCard, CapacityBar, MultiSparkline), then rebuild the dashboard as four focused components (`profile-card.tsx`, `birthday-admin-card.tsx`, `server-status-card.tsx`, rebuilt `player-stats-section.tsx` + extracted `player-stats-charts.tsx`) composed by a slimmed `page.tsx`. Data fetching, permissions, and API behavior are byte-identical to today; only presentation and feedback (inline spans → toasts, native checkboxes → Switch) change.

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, shadcn-on-Base-UI primitives (`@base-ui/react`), cmdk 1.1.1, sonner 2.0.7, recharts ^2.15, bun test + happy-dom + @testing-library/react.

## Global Constraints

Copied from the spec (`docs/superpowers/specs/2026-07-05-frontend-redesign-design.md`) and standing session rules. Every task's requirements implicitly include this section.

- Branch `integration/gilded-regiment` in worktree `C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment`, base commit `059d673`. NEVER push (pushing deploys Railway staging + prod).
- Commits: Conventional Commits one-liners. NO `Co-Authored-By`, NO AI attribution, NO emojis anywhere (code, commits, content).
- Tokens only — no raw hex/`rgba(...)` colors in component code. Charts get colors from `lib/chart-tokens.ts` (`useChartTokens()`); inline SVG uses `currentColor` + `text-*` utility classes. The `DARK` fallback map inside `lib/chart-tokens.ts` is the single sanctioned hex location.
- Custom CSS classes live inside `@layer components` in `globals.css` (Tailwind v4 cascade rule). This wave should not need new CSS classes.
- recharts: `isAnimationActive={false}` on EVERY series (spec Charts section: animations off).
- Data freshness: `hooks/use-auto-refresh.ts` is the canonical polling primitive (visibility-aware). Dashboard keeps its 30s cadence: `useAutoRefresh(load, 30_000)`. Skeletons on initial load only; background refresh keeps stale data on screen.
- Toast contract (spec Toasts section): api-client guarantees `error` is a displayable string; machine codes `ACCOUNT_DISABLED` and `NOT_IN_GUILD` NEVER toast (the protected layout's full-screen states own them). `lib/toast.ts` (Task 1) makes this structural — all toast calls in pages go through it.
- Base UI, not Radix: polymorphism via the `render` prop (e.g. `<PopoverTrigger render={<Button/>} />`). In `components/ui/*` the Tailwind `accent` utility is renamed `accent-ui`.
- Tests run FROM `packages/web` (`cd packages/web && bun test` / `bunx tsc --noEmit`), never from repo root (happy-dom preload breaks). Every Bash command starts with an absolute `cd`.
- Zero-warning suite: tests must produce no console errors/warnings (React `act()` warnings included).
- `next build` is CI-only (local Windows EPERM). Do NOT run `bun install` in the worktree (known bun-types failure); all deps for this wave are already installed (`cmdk` confirmed at `packages/web/node_modules/cmdk`).
- Behavior preservation: endpoints, payloads, permission gates (`developer`, `view:members`, `view:whitelist`, `manage:matches`, `manage:discord-bot`), the 2-minute context re-sync interaction, and en-GB date formats are unchanged.
- TDD: write the failing test first for every unit that has one (Red → Green), verify both states.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/web/lib/toast.ts` | Create | Toast contract: machine-code bypass + `toastError`/`toastSuccess` |
| `packages/web/app/(protected)/layout.tsx` | Modify | Mount `<Toaster />` once for all admin pages |
| `packages/web/components/info-tip.tsx` | Create | Shared "i" explainer tooltip (hover+focus+tap, Escape/outside dismiss) |
| `packages/web/components/field-tip.tsx` | Create | Shared read-only-field tooltip ("If this is incorrect, create a community ticket.") |
| `packages/web/components/stat-card.tsx` | Modify | Add `accent`, `href`, `tip` slots + `StatGroup` label wrapper |
| `packages/web/components/ui/command.tsx` | Create | cmdk primitive (shadcn-style, token-themed) |
| `packages/web/components/timezone-combobox.tsx` | Create | Validated IANA timezone picker on Popover+Command |
| `packages/web/components/config-card.tsx` | Create | Feature-config card recipe (title/description/headerAction/footer) |
| `packages/web/components/capacity-bar.tsx` | Create | Player-fill meter bar with transition |
| `packages/web/components/sparkline.tsx` | Modify | Add `MultiSparkline` (multi-series area + legend, fixed max) |
| `packages/web/app/(protected)/dashboard/birthday-admin-card.tsx` | Create | Admin birthday config (ConfigCard consumer) |
| `packages/web/app/(protected)/dashboard/profile-card.tsx` | Create | Profile header: identity FieldTips, roles, Steam link, birthday privacy Switches |
| `packages/web/app/(protected)/dashboard/server-status-card.tsx` | Create | Server card: StatusBadge + CapacityBar + queue badge + MultiSparkline |
| `packages/web/app/(protected)/dashboard/player-stats-charts.tsx` | Create | recharts Area/Line charts themed via chart-token bridge |
| `packages/web/app/(protected)/dashboard/player-stats-section.tsx` | Modify | Rebuild on shared composites (StatCard/StatGroup/InfoTip/ToggleGroup/EmptyState) |
| `packages/web/app/(protected)/dashboard/page.tsx` | Modify | Slim to composition + quick stats + recent matches + `useAutoRefresh` |
| `packages/web/app/design/gallery.tsx` | Modify | Gallery entries for the new composites |
| `package.json` (root) | Modify | Version 2.7.0 → 2.8.0 at wave close |

Existing pieces consumed as-is: `components/status-badge.tsx` (`StatusBadge`, `matchResultVariant`), `components/empty-state.tsx`, `components/skeleton.tsx` (`Skeleton`, `SkeletonCard`, `SkeletonStatGrid`), `components/ui/{switch,toggle-group,input,button,popover,sonner}.tsx`, `lib/chart-tokens.ts`, `hooks/use-auto-refresh.ts`, `lib/format.ts` (`formatDate`).

---

### Task 1: Toast contract (`lib/toast.ts`) + mount Toaster

The spec's toast contract: Sonner replaces all inline "Saved."/error spans; api-client already guarantees `error` is a string; the machine codes `ACCOUNT_DISABLED` / `NOT_IN_GUILD` must bypass toasts because `app/(protected)/layout.tsx:69-95` renders dedicated full-screen states for them. This task creates the helper every later consumer uses, and mounts the (already existing, never-mounted) `components/ui/sonner.tsx` Toaster in the protected layout.

**Files:**
- Create: `packages/web/lib/toast.ts`
- Create: `packages/web/test/toast.test.ts`
- Modify: `packages/web/app/(protected)/layout.tsx` (imports + mount point only)

**Interfaces:**
- Consumes: `toast` from `sonner`; `Toaster` from `@/components/ui/sonner`.
- Produces (later tasks rely on these exact signatures):
  - `coerceErrorMessage(error: string | null | undefined, fallback?: string): string | null` — returns the displayable message, or `null` when it must not toast.
  - `toastError(error: string | null | undefined, fallback?: string): void`
  - `toastSuccess(message: string): void`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/toast.test.ts`:

```ts
import { test, expect } from "bun:test";
import { coerceErrorMessage, TOAST_BYPASS_CODES } from "@/lib/toast";

test("passes ordinary error strings through", () => {
  expect(coerceErrorMessage("Failed to save")).toBe("Failed to save");
});

test("falls back when error is missing", () => {
  expect(coerceErrorMessage(undefined)).toBe("Request failed");
  expect(coerceErrorMessage(null, "Could not link Steam ID")).toBe(
    "Could not link Steam ID",
  );
});

test("machine codes never toast", () => {
  expect(coerceErrorMessage("ACCOUNT_DISABLED")).toBeNull();
  expect(coerceErrorMessage("NOT_IN_GUILD")).toBeNull();
  expect(TOAST_BYPASS_CODES.has("ACCOUNT_DISABLED")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/toast.test.ts`
Expected: FAIL — `Cannot find module '@/lib/toast'`.

- [ ] **Step 3: Write the implementation**

Create `packages/web/lib/toast.ts`:

```ts
import { toast } from "sonner";

/**
 * Toast contract (design spec, Toasts section): the api-client guarantees
 * `error` is a displayable string, so toasts render it directly. The stable
 * machine codes below bypass toasts entirely — the protected layout renders
 * dedicated full-screen states for them.
 */
export const TOAST_BYPASS_CODES: ReadonlySet<string> = new Set([
  "ACCOUNT_DISABLED",
  "NOT_IN_GUILD",
]);

export function coerceErrorMessage(
  error: string | null | undefined,
  fallback = "Request failed",
): string | null {
  const message = error || fallback;
  return TOAST_BYPASS_CODES.has(message) ? null : message;
}

export function toastError(
  error: string | null | undefined,
  fallback?: string,
): void {
  const message = coerceErrorMessage(error, fallback);
  if (message) toast.error(message);
}

export function toastSuccess(message: string): void {
  toast.success(message);
}
```

(`toastError`/`toastSuccess` are two-line wrappers over sonner; the testable logic is `coerceErrorMessage`. Do not mock the `sonner` module — bun's `mock.module` persists for the whole test process and would poison other files.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/toast.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Mount the Toaster in the protected layout**

In `packages/web/app/(protected)/layout.tsx`, add to the imports:

```tsx
import { Toaster } from "@/components/ui/sonner";
```

Then in the final return (currently `<PermissionProvider ...><SidebarProvider ...>...</SidebarProvider></PermissionProvider>`), mount the Toaster as a sibling AFTER `</SidebarProvider>`, still inside `PermissionProvider`:

```tsx
      </SidebarProvider>
      <Toaster position="bottom-right" />
    </PermissionProvider>
```

Do not touch anything else in the layout — its auth machinery is review-frozen from Phase 2a.

- [ ] **Step 6: Verify the whole suite and types**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test && bunx tsc --noEmit`
Expected: all tests pass (77 existing + 3 new), zero warnings, tsc clean.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/lib/toast.ts packages/web/test/toast.test.ts "packages/web/app/(protected)/layout.tsx"
git commit -m "feat(web): add toast contract helper and mount sonner toaster"
```

### Task 2: InfoTip + FieldTip shared composites

The spec's two-tier tooltip system. Both already exist as page-local components — `InfoTip` in `app/(protected)/dashboard/player-stats-section.tsx:58-122` (behavior-complete: hover + focus + tap-to-open, Escape/outside dismiss, `aria-describedby`) and `FieldTip` in `app/(protected)/dashboard/page.tsx:224-233`. This task extracts them to `components/` as shared composites. The only code change during extraction: InfoTip's popover surface currently uses raw colors (`border-white/10 bg-[rgba(18,17,13,0.97)]`) — swap to the token surface `bg-bg-primary ring-1 ring-border` (the surface FieldTip already uses), which works in both themes. The old page-local copies stay in place until Tasks 8/10 replace their files — a known, temporary duplication window.

**Files:**
- Create: `packages/web/components/info-tip.tsx`
- Create: `packages/web/components/field-tip.tsx`
- Create: `packages/web/test/info-tip.test.tsx`
- Create: `packages/web/test/field-tip.test.tsx`

**Interfaces:**
- Produces: `InfoTip({ text, label }: { text: string; label: string })` and `FieldTip({ children }: { children: React.ReactNode })` — named exports, both `"use client"`.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/info-tip.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { InfoTip } from "@/components/info-tip";

test("opens on click with tooltip text and aria wiring", () => {
  render(<InfoTip label="KDR" text="Kills divided by deaths." />);
  const btn = screen.getByRole("button", { name: "KDR — what's this?" });
  expect(btn.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(btn);
  const tip = screen.getByRole("tooltip");
  expect(tip.textContent).toBe("Kills divided by deaths.");
  expect(btn.getAttribute("aria-expanded")).toBe("true");
  expect(btn.getAttribute("aria-describedby")).toBe(tip.id);
});

test("closes on Escape", () => {
  render(<InfoTip label="KDR" text="Kills divided by deaths." />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("opens on focus and closes on blur", () => {
  render(<InfoTip label="KDR" text="Kills divided by deaths." />);
  const btn = screen.getByRole("button");
  fireEvent.focus(btn);
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  fireEvent.blur(btn);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
```

Create `packages/web/test/field-tip.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { FieldTip } from "@/components/field-tip";

test("wraps children and carries the ticket hint", () => {
  render(
    <FieldTip>
      <code>76561198012345678</code>
    </FieldTip>,
  );
  expect(screen.getByText("76561198012345678")).toBeDefined();
  expect(
    screen.getByText("If this is incorrect, create a community ticket."),
  ).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/info-tip.test.tsx test/field-tip.test.tsx`
Expected: FAIL — cannot find modules `@/components/info-tip` / `@/components/field-tip`.

- [ ] **Step 3: Write the implementations**

Create `packages/web/components/info-tip.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Small "i" info tooltip. Opens on hover + focus + tap (so it works on touch
 * and for keyboard users), closes on outside-click / Escape / blur. The
 * popover overrides any uppercase/tracking label styling so the explanation
 * reads as normal prose.
 */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label} — what's this?`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex items-center justify-center rounded-full text-text-muted/60 transition-colors hover:text-accent focus-visible:text-accent focus:outline-none"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-sm bg-bg-primary px-2.5 py-1.5 text-[11px] leading-snug font-normal normal-case tracking-normal text-text-secondary shadow-lg ring-1 ring-border"
        >
          {text}
        </span>
      )}
    </span>
  );
}
```

Create `packages/web/components/field-tip.tsx`:

```tsx
"use client";

/**
 * Wraps an immutable profile field. On hover it surfaces a hint that the value
 * can't be self-edited and a ticket is the way to correct it.
 */
export function FieldTip({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex cursor-help items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-bg-primary px-2 py-1 text-[10px] text-text-secondary opacity-0 shadow-lg ring-1 ring-border transition-opacity group-hover:opacity-100">
        If this is incorrect, create a community ticket.
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/info-tip.test.tsx test/field-tip.test.tsx`
Expected: PASS (4 tests), no warnings.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/info-tip.tsx packages/web/components/field-tip.tsx packages/web/test/info-tip.test.tsx packages/web/test/field-tip.test.tsx
git commit -m "feat(web): extract InfoTip and FieldTip composites"
```

### Task 3: StatCard extensions + StatGroup

Spec (section 2, extended requirements): "StatCard: sub-line, accent variant, info-tooltip slot, grouped stat sections with uppercase group labels (dashboard StatTile pattern)." The composite at `components/stat-card.tsx` already has label/value/hint/children; this task adds `accent` (gold value), `tip` (InfoTip beside the label), `href` (whole card is a Link with hover), and a `StatGroup` wrapper. All additions are backward-compatible — existing consumers (`app/design/gallery.tsx`) need no change.

**Files:**
- Modify: `packages/web/components/stat-card.tsx`
- Create: `packages/web/test/stat-card.test.tsx`

**Interfaces:**
- Consumes: `InfoTip` from Task 2.
- Produces:
  - `StatCard({ label, value, hint, accent, tip, href, children, className }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean; tip?: string; href?: string; children?: React.ReactNode; className?: string })`
  - `StatGroup({ label, children, className }: { label: string; children: React.ReactNode; className?: string })`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/stat-card.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatCard, StatGroup } from "@/components/stat-card";

test("renders label, value and hint", () => {
  render(<StatCard label="Playtime" value="42h" hint="last 30 days" />);
  expect(screen.getByText("Playtime")).toBeDefined();
  expect(screen.getByText("42h")).toBeDefined();
  expect(screen.getByText("last 30 days")).toBeDefined();
});

test("accent variant colors the value gold", () => {
  render(<StatCard label="KDR" value="1.42" accent />);
  expect(screen.getByText("1.42").className).toContain("text-accent");
});

test("href wraps the card in a link", () => {
  render(<StatCard label="Open Tickets" value={3} href="/tickets" />);
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/tickets");
});

test("tip renders an InfoTip trigger next to the label", () => {
  render(<StatCard label="Seed Days" value={5} tip="Distinct seeding days." />);
  expect(
    screen.getByRole("button", { name: "Seed Days — what's this?" }),
  ).toBeDefined();
});

test("StatGroup renders an uppercase group label above children", () => {
  render(
    <StatGroup label="Combat">
      <div>tiles</div>
    </StatGroup>,
  );
  expect(screen.getByText("Combat").className).toContain("uppercase");
  expect(screen.getByText("tiles")).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/stat-card.test.tsx`
Expected: FAIL — `StatGroup` not exported; accent/href/tip assertions fail.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `packages/web/components/stat-card.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent,
  tip,
  href,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: boolean;
  tip?: string;
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const card = (
    <Card
      className={cn(
        "flex flex-row items-center justify-between gap-4 p-4",
        href && "transition-colors hover:bg-bg-card-hover",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
          <span>{label}</span>
          {tip && <InfoTip text={tip} label={label} />}
        </p>
        <p
          className={cn(
            "mt-1 font-mono text-xl tabular-nums",
            accent ? "text-accent" : "text-text-primary",
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
      </div>
      {children}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }
  return card;
}

export function StatGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-xs font-medium uppercase tracking-[0.15em] text-text-secondary">
        {label}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/stat-card.test.tsx && bunx tsc --noEmit`
Expected: PASS (5 tests); tsc clean (gallery consumers unaffected).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/stat-card.tsx packages/web/test/stat-card.test.tsx
git commit -m "feat(web): extend StatCard with accent, href, tip slots and StatGroup"
```

### Task 4: Command primitive + TimezoneCombobox

Spec: "TimezoneCombobox (Command-based, validated IANA list — replaces the birthday card's free-text field)". `cmdk@1.1.1` is installed (`packages/web/node_modules/cmdk`); there is no `components/ui/command.tsx` yet. Hand-write the primitive (do NOT run the shadcn CLI — network + worktree-install quirks); style it with the same token/data-slot conventions as the other `ui/*` files. The combobox composes Base UI Popover (`render` polymorphism on the trigger) with Command, and is validated-by-construction: users can only pick from `Intl.supportedValuesOf("timeZone")`.

**Files:**
- Create: `packages/web/components/ui/command.tsx`
- Create: `packages/web/components/timezone-combobox.tsx`
- Create: `packages/web/test/timezone-combobox.test.tsx`

**Interfaces:**
- Consumes: `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`; `Button` from `@/components/ui/button`; `cn` from `@/lib/utils`; icons from `lucide-react`.
- Produces:
  - `Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandShortcut` from `@/components/ui/command`
  - `getTimezones(): string[]` and `TimezoneCombobox({ value, onChange, disabled, className }: { value: string; onChange: (tz: string) => void; disabled?: boolean; className?: string })` from `@/components/timezone-combobox`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/timezone-combobox.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getTimezones, TimezoneCombobox } from "@/components/timezone-combobox";

test("getTimezones returns a validated IANA list", () => {
  const zones = getTimezones();
  expect(zones.length).toBeGreaterThan(10);
  expect(zones).toContain("Europe/Oslo");
  expect(zones).toContain("UTC");
  // every entry must be constructible as a real timezone
  for (const tz of zones.slice(0, 25)) {
    expect(() => new Intl.DateTimeFormat("en-GB", { timeZone: tz })).not.toThrow();
  }
});

test("trigger shows the current value", () => {
  render(<TimezoneCombobox value="Europe/Oslo" onChange={() => {}} />);
  expect(
    screen.getByRole("combobox", { name: /Europe\/Oslo/ }),
  ).toBeDefined();
});

test("opens, filters and selects a timezone", async () => {
  const onChange = mock((_tz: string) => {});
  render(<TimezoneCombobox value="UTC" onChange={onChange} />);
  fireEvent.click(screen.getByRole("combobox"));
  const input = await screen.findByPlaceholderText("Search timezone...");
  fireEvent.change(input, { target: { value: "Oslo" } });
  await waitFor(() => {
    expect(screen.getByText("Europe/Oslo")).toBeDefined();
  });
  fireEvent.click(screen.getByText("Europe/Oslo"));
  expect(onChange).toHaveBeenCalledWith("Europe/Oslo");
});
```

Note for the implementer: the third test exercises cmdk + Base UI Popover under happy-dom. If cmdk's internal pointer handling makes `fireEvent.click` on the item unreliable, selecting via keyboard (`fireEvent.keyDown(input, { key: "Enter" })` after filtering to a single visible item) is an acceptable equivalent assertion — the requirement is that selection calls `onChange` with the picked zone. Do NOT weaken the first two tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/timezone-combobox.test.tsx`
Expected: FAIL — `Cannot find module '@/components/timezone-combobox'`.

- [ ] **Step 3: Write the Command primitive**

Create `packages/web/components/ui/command.tsx`:

```tsx
"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-sm bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b border-border px-3"
    >
      <SearchIcon className="size-4 shrink-0 text-text-muted" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm text-text-muted"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-muted",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-text-muted",
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
};
```

- [ ] **Step 4: Write the TimezoneCombobox**

Create `packages/web/components/timezone-combobox.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/** Minimal fallback for runtimes without Intl.supportedValuesOf. */
const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/Oslo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Stockholm",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function getTimezones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone");
      return zones.includes("UTC") ? zones : ["UTC", ...zones];
    }
  } catch {
    // fall through to the static list
  }
  return FALLBACK_TIMEZONES;
}

export function TimezoneCombobox({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (tz: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timezones = useMemo(getTimezones, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-mono text-xs normal-case tracking-normal",
              className,
            )}
          >
            {value || "Select timezone"}
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezone..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {timezones.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  onSelect={(selected) => {
                    onChange(selected);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-3.5",
                      tz === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-xs">{tz}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/timezone-combobox.test.tsx && bunx tsc --noEmit`
Expected: PASS (3 tests), zero warnings, tsc clean. If the selection test needed the keyboard fallback (see Step 1 note), report that in your completion notes.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/ui/command.tsx packages/web/components/timezone-combobox.tsx packages/web/test/timezone-combobox.test.tsx
git commit -m "feat(web): add Command primitive and TimezoneCombobox"
```

### Task 5: ConfigCard + CapacityBar composites

Two small presentational composites from the spec inventory. **ConfigCard**: "permission-gated feature-config card hosted on a content page" — the card recipe itself (facet-border surface, display-font title, header action slot, footer action row); permission gating stays at the call site as today (`hasPermission(...) && <Card/>`). **CapacityBar**: "server player-fill bar with transition", replacing the hand-rolled div pair in the dashboard server card.

**Files:**
- Create: `packages/web/components/config-card.tsx`
- Create: `packages/web/components/capacity-bar.tsx`
- Create: `packages/web/test/config-card.test.tsx`
- Create: `packages/web/test/capacity-bar.test.tsx`

**Interfaces:**
- Produces:
  - `ConfigCard({ title, description, headerAction, footer, children, className }: { title: string; description?: string; headerAction?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string })`
  - `CapacityBar({ value, max, className }: { value: number; max: number; className?: string })`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/config-card.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ConfigCard } from "@/components/config-card";

test("renders title, description, header action, children and footer", () => {
  render(
    <ConfigCard
      title="Birthday announcements"
      description="Posted once per day."
      headerAction={<button>Enabled</button>}
      footer={<button>Save</button>}
    >
      <p>form fields</p>
    </ConfigCard>,
  );
  expect(screen.getByText("Birthday announcements")).toBeDefined();
  expect(screen.getByText("Posted once per day.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Enabled" })).toBeDefined();
  expect(screen.getByText("form fields")).toBeDefined();
  expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
});

test("omits optional slots cleanly", () => {
  const { container } = render(
    <ConfigCard title="Plain">
      <p>body</p>
    </ConfigCard>,
  );
  expect(container.querySelectorAll("button").length).toBe(0);
});
```

Create `packages/web/test/capacity-bar.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { CapacityBar } from "@/components/capacity-bar";

function fill(container: HTMLElement): HTMLElement {
  return container.querySelector("[role=meter] > div") as HTMLElement;
}

test("fills proportionally with meter semantics", () => {
  const { container } = render(<CapacityBar value={50} max={100} />);
  const meter = container.querySelector("[role=meter]") as HTMLElement;
  expect(meter.getAttribute("aria-valuenow")).toBe("50");
  expect(meter.getAttribute("aria-valuemax")).toBe("100");
  expect(fill(container).style.width).toBe("50%");
});

test("clamps overflow and handles zero max", () => {
  const over = render(<CapacityBar value={120} max={100} />);
  expect(fill(over.container).style.width).toBe("100%");
  const zero = render(<CapacityBar value={5} max={0} />);
  expect(fill(zero.container).style.width).toBe("0%");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/config-card.test.tsx test/capacity-bar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `packages/web/components/config-card.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * Feature-config card hosted on a content page (e.g. the birthday admin card
 * on /dashboard). Permission gating happens at the call site.
 */
export function ConfigCard({
  title,
  description,
  headerAction,
  footer,
  children,
  className,
}: {
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("facet-border rounded-sm bg-bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-text-muted">{description}</p>
          )}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>
      {children}
      {footer && <div className="mt-4 flex items-center gap-3">{footer}</div>}
    </section>
  );
}
```

Create `packages/web/components/capacity-bar.tsx`:

```tsx
import { cn } from "@/lib/utils";

/** Server player-fill bar with a smooth width transition. */
export function CapacityBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-label={`${value} of ${max}`}
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-bg-tertiary",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-accent transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/config-card.test.tsx test/capacity-bar.test.tsx`
Expected: PASS (4 tests), no warnings.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/config-card.tsx packages/web/components/capacity-bar.tsx packages/web/test/config-card.test.tsx packages/web/test/capacity-bar.test.tsx
git commit -m "feat(web): add ConfigCard and CapacityBar composites"
```

### Task 6: MultiSparkline (multi-series area sparkline)

The dashboard server card draws a two-series area sparkline (players + queue) with a legend and a fixed max (server capacity) — today a page-local component with hardcoded hex colors (`page.tsx:19-82`). Extend the canonical `components/sparkline.tsx` with a `MultiSparkline` that takes series colored via `text-*` utility classes (`currentColor`), preserving the old geometry: baseline min 0, `fixedMax` support, 3px vertical padding, area fill at 0.2 opacity. Keep the existing single-series `Sparkline` and `sparklinePath` untouched.

**Files:**
- Modify: `packages/web/components/sparkline.tsx` (append only)
- Modify: `packages/web/test/sparkline.test.ts` (append new tests; note: `.ts` → rename to `test/sparkline.test.tsx` because the new assertions render JSX. `git mv` first, keep existing tests intact.)

**Interfaces:**
- Produces:
  - `interface SparklineSeries { values: number[]; label: string; className: string }` (className is a `text-*` color class, e.g. `"text-accent"`, `"text-warning"`)
  - `multiSparklineCoords(values: number[], width: number, height: number, max: number): { x: number; y: number }[]`
  - `MultiSparkline({ series, width, height, fixedMax, className }: { series: SparklineSeries[]; width?: number; height?: number; fixedMax?: number; className?: string })` — returns `null` unless at least one series has >= 2 points. Defaults: `width = 200`, `height = 64`.

- [ ] **Step 1: Rename the test file and write the failing tests**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web
git mv test/sparkline.test.ts test/sparkline.test.tsx
```

Append to `packages/web/test/sparkline.test.tsx` (add `render`/`screen` imports from `@testing-library/react` and the new component imports at the top; keep every existing test):

```tsx
import { render, screen } from "@testing-library/react";
import {
  MultiSparkline,
  multiSparklineCoords,
} from "@/components/sparkline";

test("multiSparklineCoords scales against a fixed max with 0 baseline", () => {
  const coords = multiSparklineCoords([0, 50, 100], 200, 64, 100);
  expect(coords.length).toBe(3);
  expect(coords[0]).toEqual({ x: 0, y: 61 }); // 0 -> bottom pad (height - 3)
  expect(coords[2]).toEqual({ x: 200, y: 3 }); // max -> top pad
  expect(coords[1].y).toBe(32); // midpoint
});

test("MultiSparkline renders one area+line pair per series and a legend", () => {
  const { container } = render(
    <MultiSparkline
      series={[
        { values: [10, 40, 80], label: "Players", className: "text-accent" },
        { values: [0, 2, 4], label: "Queue", className: "text-warning" },
      ]}
      fixedMax={100}
    />,
  );
  expect(container.querySelectorAll("polygon").length).toBe(2);
  expect(container.querySelectorAll("polyline").length).toBe(2);
  expect(screen.getByText(/Players:/)).toBeDefined();
  expect(screen.getByText("80")).toBeDefined(); // current value in legend
  expect(screen.getByText(/Queue:/)).toBeDefined();
});

test("MultiSparkline returns null when no series has two points", () => {
  const { container } = render(
    <MultiSparkline
      series={[{ values: [5], label: "Players", className: "text-accent" }]}
    />,
  );
  expect(container.innerHTML).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/sparkline.test.tsx`
Expected: existing tests PASS, new tests FAIL (`multiSparklineCoords` not exported).

- [ ] **Step 3: Write the implementation**

Append to `packages/web/components/sparkline.tsx`:

```tsx
export interface SparklineSeries {
  values: number[];
  label: string;
  /** A text color utility class, e.g. "text-accent" — strokes/fills use currentColor. */
  className: string;
}

export function multiSparklineCoords(
  values: number[],
  width: number,
  height: number,
  max: number,
): { x: number; y: number }[] {
  const pad = 3;
  const range = max || 1;
  return values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - (v / range) * (height - pad * 2) - pad,
  }));
}

/**
 * Multi-series area sparkline with a shared 0-based scale and a legend of
 * current values. Used by the dashboard server cards (players vs queue).
 */
export function MultiSparkline({
  series,
  width = 200,
  height = 64,
  fixedMax,
  className,
}: {
  series: SparklineSeries[];
  width?: number;
  height?: number;
  fixedMax?: number;
  className?: string;
}) {
  const drawable = series.filter((s) => s.values.length >= 2);
  if (drawable.length === 0) return null;

  const max = fixedMax ?? Math.max(...series.flatMap((s) => s.values), 1);
  const summary = series
    .map((s) => `${s.label} ${s.values[s.values.length - 1] ?? 0}`)
    .join(", ");

  return (
    <div className={className}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        role="img"
        aria-label={`Trend: ${summary}`}
      >
        {drawable.map((s) => {
          const coords = multiSparklineCoords(s.values, width, height, max);
          const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
          const area = `${line} ${width},${height} 0,${height}`;
          return (
            <g key={s.label} className={s.className}>
              <polygon fill="currentColor" fillOpacity="0.2" points={area} />
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                points={line}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center gap-4">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full bg-current ${s.className}`}
              aria-hidden="true"
            />
            <span className="text-[10px] text-text-muted">
              {s.label}:{" "}
              <span className="text-text-secondary">
                {s.values.length > 0 ? s.values[s.values.length - 1] : 0}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/sparkline.test.tsx && bunx tsc --noEmit`
Expected: PASS (all old + 3 new), tsc clean.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add packages/web/components/sparkline.tsx packages/web/test/sparkline.test.tsx
git commit -m "feat(web): add multi-series area MultiSparkline with legend"
```

### Task 7: BirthdayAdminCard on ConfigCard + TimezoneCombobox + Switch

Move the birthday admin card out of `page.tsx` (currently lines 237-354) into its own file, rebuilt on the new composites: ConfigCard shell, Switch for enable (replacing the native accent-checkbox), `Input` primitives for channel/time, TimezoneCombobox replacing the free-text timezone field, toasts replacing the inline "Saved."/error spans, Skeleton for the loading state (no "Loading..." text). Behavior preserved exactly: fetch on mount with cancellation, royal-lounge default channel pre-fill, PATCH the whole config object on save, re-hydrate from the response. The locked decision stands: this card lives on `/dashboard` behind `manage:discord-bot` (gating stays in `page.tsx`, Task 11).

**Files:**
- Create: `packages/web/app/(protected)/dashboard/birthday-admin-card.tsx`
- Create: `packages/web/test/birthday-admin-card.test.tsx`

**Interfaces:**
- Consumes: `ConfigCard` (Task 5), `TimezoneCombobox` (Task 4), `toastError`/`toastSuccess` (Task 1), `Switch`/`Input`/`Button` primitives, `Skeleton`, `getBirthdayConfig`/`updateBirthdayConfig` from `@/lib/api-client`, `BirthdayConfig` from `shared`.
- Produces (Task 11 relies on): default export `BirthdayAdminCard({ token, api?, notify? }: { token: string; api?: BirthdayApi; notify?: BirthdayNotify })`. The `api`/`notify` props exist for dependency injection in tests (the established `fetchers`-prop pattern from Phase 1) and default to the real client/toast helpers.

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/birthday-admin-card.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BirthdayAdminCard from "@/app/(protected)/dashboard/birthday-admin-card";
import type { BirthdayConfig } from "shared";

const baseConfig: BirthdayConfig = {
  enabled: false,
  channelId: null,
  postTime: "09:00",
  timezone: "Europe/Oslo",
};

const ok = (data: BirthdayConfig) =>
  Promise.resolve({ success: true as const, data });

function makeNotify() {
  return { success: mock(() => {}), error: mock(() => {}) };
}

test("loads config and pre-fills the royal-lounge default channel", async () => {
  const api = {
    get: mock(() => ok(baseConfig)),
    update: mock((_t: string, d: Partial<BirthdayConfig>) =>
      ok({ ...baseConfig, ...d }),
    ),
  };
  render(<BirthdayAdminCard token="tok" api={api} notify={makeNotify()} />);
  const channel = await screen.findByLabelText("Channel ID");
  expect((channel as HTMLInputElement).value).toBe("460898033794809856");
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect((screen.getByLabelText("Post time") as HTMLInputElement).value).toBe("09:00");
  expect(screen.getByRole("combobox").textContent).toContain("Europe/Oslo");
});

test("save PATCHes the edited config and toasts success", async () => {
  const api = {
    get: mock(() => ok(baseConfig)),
    update: mock((_t: string, d: Partial<BirthdayConfig>) =>
      ok({ ...baseConfig, ...d } as BirthdayConfig),
    ),
  };
  const notify = makeNotify();
  render(<BirthdayAdminCard token="tok" api={api} notify={notify} />);
  await screen.findByLabelText("Channel ID");

  fireEvent.click(screen.getByRole("switch"));
  fireEvent.change(screen.getByLabelText("Post time"), {
    target: { value: "10:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
  const sent = api.update.mock.calls[0][1] as BirthdayConfig;
  expect(sent.enabled).toBe(true);
  expect(sent.postTime).toBe("10:30");
  expect(sent.channelId).toBe("460898033794809856");
  expect(notify.error).not.toHaveBeenCalled();
});

test("failed save toasts the server error", async () => {
  const api = {
    get: mock(() => ok(baseConfig)),
    update: mock(() =>
      Promise.resolve({ success: false as const, error: "Bot unreachable" }),
    ),
  };
  const notify = makeNotify();
  render(<BirthdayAdminCard token="tok" api={api} notify={notify} />);
  await screen.findByLabelText("Channel ID");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      "Bot unreachable",
      "Failed to save birthday settings",
    ),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/birthday-admin-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/web/app/(protected)/dashboard/birthday-admin-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getBirthdayConfig, updateBirthdayConfig } from "@/lib/api-client";
import type { ApiResponse, BirthdayConfig } from "shared";
import { toastError, toastSuccess } from "@/lib/toast";
import { ConfigCard } from "@/components/config-card";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/skeleton";

const DEFAULT_LOUNGE_CHANNEL_ID = "460898033794809856";

export interface BirthdayApi {
  get: (token: string) => Promise<ApiResponse<BirthdayConfig>>;
  update: (
    token: string,
    data: Partial<BirthdayConfig>,
  ) => Promise<ApiResponse<BirthdayConfig>>;
}

export interface BirthdayNotify {
  success: (message: string) => void;
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: BirthdayApi = {
  get: getBirthdayConfig,
  update: updateBirthdayConfig,
};
const defaultNotify: BirthdayNotify = {
  success: toastSuccess,
  error: toastError,
};

function withDefaultChannel(config: BirthdayConfig): BirthdayConfig {
  // Pre-fill the royal-lounge default when no channel is set yet.
  return { ...config, channelId: config.channelId ?? DEFAULT_LOUNGE_CHANNEL_ID };
}

export default function BirthdayAdminCard({
  token,
  api = defaultApi,
  notify = defaultNotify,
}: {
  token: string;
  api?: BirthdayApi;
  notify?: BirthdayNotify;
}) {
  const [config, setConfig] = useState<BirthdayConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(token).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setConfig(withDefaultChannel(res.data));
      } else {
        setLoadError(res.error || "Failed to load birthday config");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, api]);

  async function save() {
    if (!config || saving) return;
    setSaving(true);
    const res = await api.update(token, config);
    setSaving(false);
    if (res.success && res.data) {
      setConfig(withDefaultChannel(res.data));
      notify.success("Birthday settings saved.");
    } else {
      notify.error(res.error, "Failed to save birthday settings");
    }
  }

  return (
    <ConfigCard
      title="Birthday announcements"
      headerAction={
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <Switch
            checked={config?.enabled ?? false}
            disabled={!config}
            onCheckedChange={(next) =>
              config && setConfig({ ...config, enabled: next })
            }
            aria-label="Birthday announcements enabled"
          />
          Enabled
        </label>
      }
      footer={
        config ? (
          <Button variant="gold" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        ) : undefined
      }
    >
      {!config ? (
        loadError ? (
          <p className="text-sm text-text-muted">{loadError}</p>
        ) : (
          <div
            className="grid gap-4 sm:grid-cols-3"
            role="status"
            aria-label="Loading birthday settings"
          >
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Channel ID
            </span>
            <Input
              type="text"
              value={config.channelId ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  channelId: e.target.value.trim() || null,
                })
              }
              placeholder={DEFAULT_LOUNGE_CHANNEL_ID}
              className="font-mono text-xs"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Post time
            </span>
            <Input
              type="time"
              value={config.postTime}
              onChange={(e) =>
                setConfig({ ...config, postTime: e.target.value })
              }
              className="font-mono text-xs"
            />
          </label>
          <div>
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Timezone
            </span>
            <TimezoneCombobox
              value={config.timezone}
              onChange={(tz) => setConfig({ ...config, timezone: tz })}
            />
          </div>
        </div>
      )}
    </ConfigCard>
  );
}
```

(If `ApiResponse` is not exported from `shared`, import it the way `lib/api-client.ts:1-41` does — it is in that import list, so it is available.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/birthday-admin-card.test.tsx && bunx tsc --noEmit`
Expected: PASS (3 tests), zero warnings (wrap interactions triggering state in the existing RTL patterns; `waitFor` handles the async settles).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/dashboard/birthday-admin-card.tsx" packages/web/test/birthday-admin-card.test.tsx
git commit -m "feat(web): rebuild birthday admin card on ConfigCard with timezone combobox"
```

### Task 8: ProfileCard (identity cluster + Steam link + birthday privacy)

Extract the profile header card out of `page.tsx` (lines 547-655, plus `BirthdayPrefsToggles` lines 356-425) into `app/(protected)/dashboard/profile-card.tsx`, rebuilt on: shared `FieldTip` (Task 2), `Switch` replacing the two native accent-checkboxes, `Input`/`Button` primitives for the Steam-link form, toasts replacing every inline error/success span. Behavior preserved: `displayUser = linkedUser || user`, optimistic prefs flip with revert on failure, prefs re-sync from props (the layout re-syncs the context user every ~2 min). The form gets `id="steam-link"` so the stats-section nudge (Task 10) can anchor-link to it. Do NOT assume an Activity/Seed-time row exists — it was never implemented (no `/playtime/me`).

**Files:**
- Create: `packages/web/app/(protected)/dashboard/profile-card.tsx`
- Create: `packages/web/test/profile-card.test.tsx`

**Interfaces:**
- Consumes: `FieldTip`, `Switch`, `Input`, `Button`, `toastError`/`toastSuccess`, `linkSteam`/`updateBirthdayPrefs` from `@/lib/api-client`, `formatDate` from `@/lib/format`, `UserWithRoles`/`ApiResponse` from `shared`.
- Produces (Task 11 relies on): default export
  `ProfileCard({ token, sessionName, sessionEmail, sessionImage, user, api?, notify? }: { token: string; sessionName: string | null; sessionEmail: string | null; sessionImage: string | null; user: UserWithRoles | null; api?: ProfileApi; notify?: ProfileNotify })`
  where `ProfileApi = { linkSteam: (token: string, steamId: string) => Promise<ApiResponse<UserWithRoles>>; updateBirthdayPrefs: (token: string, data: { birthdayOptOut?: boolean; birthdayShowAge?: boolean }) => Promise<ApiResponse<{ birthdayOptOut: boolean; birthdayShowAge: boolean }>> }` and `ProfileNotify = { success: (message: string) => void; error: (error: string | null | undefined, fallback?: string) => void }`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/profile-card.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileCard from "@/app/(protected)/dashboard/profile-card";
import type { UserWithRoles } from "shared";

const user: UserWithRoles = {
  id: "u1",
  discordId: "123456789012345678",
  discordName: "olie",
  displayName: null,
  steamId: null,
  eosId: null,
  avatarUrl: null,
  country: "NO",
  membershipDate: null,
  dateOfBirth: null,
  birthdayOptOut: false,
  birthdayShowAge: false,
  hasLoggedIn: true,
  disabled: false,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  roles: [{ id: "r1", discordRoleId: "9", name: "Member" }],
};

function makeNotify() {
  return { success: mock(() => {}), error: mock(() => {}) };
}

function baseProps(overrides: Partial<Parameters<typeof ProfileCard>[0]> = {}) {
  return {
    token: "tok",
    sessionName: "Olie",
    sessionEmail: "olie@example.com",
    sessionImage: null,
    user,
    ...overrides,
  };
}

test("renders identity cluster with field tips and roles", () => {
  render(<ProfileCard {...baseProps()} />);
  expect(screen.getByText("123456789012345678")).toBeDefined();
  expect(screen.getByText("Steam: not linked")).toBeDefined();
  expect(screen.getByText("NO")).toBeDefined();
  expect(screen.getByText("Member")).toBeDefined();
  expect(
    screen.getAllByText("If this is incorrect, create a community ticket.")
      .length,
  ).toBeGreaterThanOrEqual(3);
});

test("links a Steam ID, toasts success and swaps to the linked view", async () => {
  const api = {
    linkSteam: mock((_t: string, steamId: string) =>
      Promise.resolve({
        success: true as const,
        data: { ...user, steamId },
      }),
    ),
    updateBirthdayPrefs: mock(() =>
      Promise.resolve({
        success: true as const,
        data: { birthdayOptOut: false, birthdayShowAge: false },
      }),
    ),
  };
  const notify = makeNotify();
  render(<ProfileCard {...baseProps({ api, notify })} />);
  fireEvent.change(screen.getByPlaceholderText("Enter Steam64 ID to link"), {
    target: { value: "76561198000000001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  await waitFor(() => {
    expect(screen.getByText("76561198000000001")).toBeDefined();
  });
  expect(api.linkSteam).toHaveBeenCalledWith("tok", "76561198000000001");
  expect(notify.success).toHaveBeenCalledWith("Steam ID linked.");
  expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
});

test("empty Steam submit toasts a validation error without calling the API", () => {
  const api = {
    linkSteam: mock(() =>
      Promise.resolve({ success: false as const, error: "nope" }),
    ),
    updateBirthdayPrefs: mock(() =>
      Promise.resolve({ success: false as const, error: "nope" }),
    ),
  };
  const notify = makeNotify();
  render(<ProfileCard {...baseProps({ api, notify })} />);
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  expect(notify.error).toHaveBeenCalledWith("Please enter a Steam ID.");
  expect(api.linkSteam).not.toHaveBeenCalled();
});

test("birthday pref switch flips optimistically and reverts on failure", async () => {
  const api = {
    linkSteam: mock(() =>
      Promise.resolve({ success: false as const, error: "x" }),
    ),
    updateBirthdayPrefs: mock(() =>
      Promise.resolve({ success: false as const, error: "DB down" }),
    ),
  };
  const notify = makeNotify();
  render(<ProfileCard {...baseProps({ api, notify })} />);
  const optOut = screen.getByRole("switch", {
    name: "Don't announce my birthday",
  });
  expect(optOut.getAttribute("aria-checked")).toBe("false");
  // Base UI Switch renders span[role=switch]; happy-dom synthetic clicks don't
  // reach its pointer handlers, so toggle via the keyboard path (Space).
  optOut.focus();
  fireEvent.keyDown(optOut, { key: " " });
  fireEvent.keyUp(optOut, { key: " " });
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith("DB down", "Failed to save"),
  );
  expect(optOut.getAttribute("aria-checked")).toBe("false");
  expect(api.updateBirthdayPrefs).toHaveBeenCalledWith("tok", {
    birthdayOptOut: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/profile-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/web/app/(protected)/dashboard/profile-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { linkSteam, updateBirthdayPrefs } from "@/lib/api-client";
import type { ApiResponse, UserWithRoles } from "shared";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { FieldTip } from "@/components/field-tip";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ProfileApi {
  linkSteam: (
    token: string,
    steamId: string,
  ) => Promise<ApiResponse<UserWithRoles>>;
  updateBirthdayPrefs: (
    token: string,
    data: { birthdayOptOut?: boolean; birthdayShowAge?: boolean },
  ) => Promise<ApiResponse<{ birthdayOptOut: boolean; birthdayShowAge: boolean }>>;
}

export interface ProfileNotify {
  success: (message: string) => void;
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: ProfileApi = { linkSteam, updateBirthdayPrefs };
const defaultNotify: ProfileNotify = { success: toastSuccess, error: toastError };

function BirthdayPrefsToggles({
  token,
  initialOptOut,
  initialShowAge,
  api,
  notify,
}: {
  token: string;
  initialOptOut: boolean;
  initialShowAge: boolean;
  api: ProfileApi;
  notify: ProfileNotify;
}) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [showAge, setShowAge] = useState(initialShowAge);

  // Keep in sync if the context user re-syncs (token refresh every ~2 min).
  useEffect(() => {
    setOptOut(initialOptOut);
    setShowAge(initialShowAge);
  }, [initialOptOut, initialShowAge]);

  async function update(next: {
    birthdayOptOut?: boolean;
    birthdayShowAge?: boolean;
  }) {
    const res = await api.updateBirthdayPrefs(token, next);
    if (res.success && res.data) {
      setOptOut(res.data.birthdayOptOut);
      setShowAge(res.data.birthdayShowAge);
    } else {
      notify.error(res.error, "Failed to save");
      // Revert the optimistic flip.
      if (next.birthdayOptOut !== undefined) setOptOut(!next.birthdayOptOut);
      if (next.birthdayShowAge !== undefined) setShowAge(!next.birthdayShowAge);
    }
  }

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="mb-1.5 text-[10px] font-medium tracking-wider text-text-muted uppercase">
        Birthday
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <Switch
            checked={optOut}
            aria-label="Don't announce my birthday"
            onCheckedChange={(next) => {
              setOptOut(next);
              update({ birthdayOptOut: next });
            }}
          />
          Don&apos;t announce my birthday
        </label>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <Switch
            checked={showAge}
            aria-label="Show my age in the announcement"
            onCheckedChange={(next) => {
              setShowAge(next);
              update({ birthdayShowAge: next });
            }}
          />
          Show my age in the announcement
        </label>
      </div>
    </div>
  );
}

export default function ProfileCard({
  token,
  sessionName,
  sessionEmail,
  sessionImage,
  user,
  api = defaultApi,
  notify = defaultNotify,
}: {
  token: string;
  sessionName: string | null;
  sessionEmail: string | null;
  sessionImage: string | null;
  user: UserWithRoles | null;
  api?: ProfileApi;
  notify?: ProfileNotify;
}) {
  const [linkedUser, setLinkedUser] = useState<UserWithRoles | null>(null);
  const [steamId, setSteamId] = useState("");

  const displayUser = linkedUser || user;

  async function handleLinkSteam(e: React.FormEvent) {
    e.preventDefault();
    if (!steamId.trim()) {
      notify.error("Please enter a Steam ID.");
      return;
    }
    const res = await api.linkSteam(token, steamId.trim());
    if (res.success && res.data) {
      setLinkedUser(res.data);
      setSteamId("");
      notify.success("Steam ID linked.");
    } else {
      notify.error(res.error, "Failed to link Steam ID.");
    }
  }

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Avatar + name */}
        <div className="flex items-center gap-3 sm:min-w-0 sm:shrink-0">
          {sessionImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={sessionImage}
              alt="Avatar"
              className="h-10 w-10 rounded-full ring-2 ring-accent/20"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
              {(sessionName || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">
              {sessionName || "Unknown"}
            </div>
            <div className="truncate text-xs text-text-muted">
              {sessionEmail || ""}
            </div>
          </div>
        </div>

        {/* IDs */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:ml-auto">
          {displayUser?.discordId && (
            <FieldTip>
              <span className="text-text-muted">Discord </span>
              <code className="font-mono text-accent">{displayUser.discordId}</code>
            </FieldTip>
          )}
          {displayUser?.steamId ? (
            <FieldTip>
              <span className="text-text-muted">Steam </span>
              <code className="font-mono text-accent">{displayUser.steamId}</code>
            </FieldTip>
          ) : (
            <div className="text-text-muted">Steam: not linked</div>
          )}
          {displayUser?.eosId && (
            <FieldTip>
              <span className="text-text-muted">EOS </span>
              <code className="font-mono text-accent">{displayUser.eosId}</code>
            </FieldTip>
          )}
          <FieldTip>
            <span className="text-text-muted">Country </span>
            <span
              className={
                displayUser?.country ? "text-text-secondary" : "text-text-muted"
              }
            >
              {displayUser?.country || "--"}
            </span>
          </FieldTip>
          <FieldTip>
            <span className="text-text-muted">DOB </span>
            <span
              className={
                displayUser?.dateOfBirth
                  ? "text-text-secondary"
                  : "text-text-muted"
              }
            >
              {displayUser?.dateOfBirth
                ? formatDate(displayUser.dateOfBirth)
                : "--"}
            </span>
          </FieldTip>
        </div>
      </div>

      {/* Roles */}
      {displayUser?.roles && displayUser.roles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/30 pt-3">
          {displayUser.roles.map((role) => (
            <FieldTip key={role.id}>
              <span className="rounded-sm border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                {role.name}
              </span>
            </FieldTip>
          ))}
        </div>
      )}

      {/* Inline Steam link form (only if not linked) */}
      {!displayUser?.steamId && (
        <div className="mt-3 border-t border-border/30 pt-3">
          <form
            id="steam-link"
            onSubmit={handleLinkSteam}
            className="flex items-center gap-2"
          >
            <Input
              type="text"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="Enter Steam64 ID to link"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button type="submit" variant="gold" size="sm" className="shrink-0">
              Link
            </Button>
          </form>
        </div>
      )}

      {/* Birthday privacy self-service */}
      {displayUser && (
        <BirthdayPrefsToggles
          token={token}
          initialOptOut={displayUser.birthdayOptOut ?? false}
          initialShowAge={displayUser.birthdayShowAge ?? false}
          api={api}
          notify={notify}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/profile-card.test.tsx && bunx tsc --noEmit`
Expected: PASS (4 tests), zero warnings, tsc clean.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/dashboard/profile-card.tsx" packages/web/test/profile-card.test.tsx
git commit -m "feat(web): extract dashboard profile card with switches and toasts"
```

### Task 9: ServerStatusCard on CapacityBar + MultiSparkline + StatusBadge

Extract the dashboard server card out of `page.tsx` (lines 84-165) into its own file, rebuilt on the composites: `StatusBadge` server variants replace the hand-rolled dot+text pair, `CapacityBar` replaces the fill-bar divs, `MultiSparkline` (Players = `text-accent`, Queue = `text-warning`) replaces the page-local hex-colored sparkline. The `steam://` connect map, the hover-reveal Connect link, and the queue pill are preserved. Note: this is an admin page — the public-copy restrictions do not apply; the file name avoids colliding with the existing public `test/server-card.test.tsx`.

**Files:**
- Create: `packages/web/app/(protected)/dashboard/server-status-card.tsx`
- Create: `packages/web/test/server-status-card.test.tsx`

**Interfaces:**
- Consumes: `StatusBadge` (`variant="server-online" | "server-offline"`), `CapacityBar` (Task 5), `MultiSparkline`/`SparklineSeries` (Task 6), `ServerStatus` type from `@/lib/api-client`.
- Produces (Task 11 relies on): default export `ServerStatusCard({ server }: { server: ServerStatus })`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/server-status-card.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import ServerStatusCard from "@/app/(protected)/dashboard/server-status-card";
import type { ServerStatus } from "@/lib/api-client";

function makeServer(overrides: Partial<ServerStatus> = {}): ServerStatus {
  return {
    id: "1",
    name: "Royal Battalion Main",
    ip: "37.153.157.204",
    port: 27050,
    players: 87,
    maxPlayers: 100,
    map: "Narva AAS v2",
    status: "online",
    playerList: [],
    publicQueue: 3,
    reserveQueue: 1,
    metricHistory: [
      { time: 1, tickRate: null, playerCount: 80, publicQueue: 0, reserveQueue: 0 },
      { time: 2, tickRate: null, playerCount: 87, publicQueue: 3, reserveQueue: 1 },
    ],
    ...overrides,
  };
}

test("renders name, players, map, online badge and connect link", () => {
  render(<ServerStatusCard server={makeServer()} />);
  expect(screen.getByText("Royal Battalion Main")).toBeDefined();
  expect(screen.getByText("87")).toBeDefined();
  expect(screen.getByText("/ 100")).toBeDefined();
  expect(screen.getByText("Narva AAS v2")).toBeDefined();
  expect(screen.getByText("Online")).toBeDefined();
  const connect = screen.getByText("Connect");
  expect(connect.getAttribute("href")).toBe(
    "steam://connect/37.153.157.204:27050",
  );
});

test("shows the combined queue pill only when a queue exists", () => {
  render(<ServerStatusCard server={makeServer()} />);
  expect(screen.getByText("+4 queue")).toBeDefined();
  render(
    <ServerStatusCard
      server={makeServer({ publicQueue: 0, reserveQueue: 0, name: "RB Battle" })}
    />,
  );
  expect(screen.queryByText("+0 queue")).toBeNull();
});

test("renders the capacity meter and the players/queue sparkline legend", () => {
  const { container } = render(<ServerStatusCard server={makeServer()} />);
  const meter = container.querySelector("[role=meter]") as HTMLElement;
  expect(meter.getAttribute("aria-valuenow")).toBe("87");
  expect(screen.getByText(/Players:/)).toBeDefined();
  expect(screen.getByText(/Queue:/)).toBeDefined();
});

test("offline server shows the offline badge and no sparkline block", () => {
  const { container } = render(
    <ServerStatusCard
      server={makeServer({ status: "offline", players: 0, metricHistory: [] })}
    />,
  );
  expect(screen.getByText("Offline")).toBeDefined();
  expect(container.querySelector("svg")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/server-status-card.test.tsx`
Expected: FAIL — module not found.

(If the "Online"/"Offline" label assertions fail because `StatusBadge` renders different label text for the `server-online`/`server-offline` variants, check `components/status-badge.tsx` for the actual variant labels and adjust the ASSERTION to the real rendered text — the component must keep using the variants.)

- [ ] **Step 3: Write the implementation**

Create `packages/web/app/(protected)/dashboard/server-status-card.tsx`:

```tsx
"use client";

import type { ServerStatus } from "@/lib/api-client";
import { StatusBadge } from "@/components/status-badge";
import { CapacityBar } from "@/components/capacity-bar";
import { MultiSparkline } from "@/components/sparkline";

const CONNECT_URLS: Record<string, string> = {
  "37.153.157.204:27050": "steam://connect/37.153.157.204:27050",
  "37.153.157.204:27060": "steam://connect/37.153.157.204:27060",
};

export default function ServerStatusCard({ server }: { server: ServerStatus }) {
  const isOnline = server.status === "online";
  const connectUrl = CONNECT_URLS[`${server.ip}:${server.port}`] ?? "#";
  const queue = server.publicQueue + server.reserveQueue;

  const playerData = server.metricHistory?.map((s) => s.playerCount) || [];
  const queueData =
    server.metricHistory?.map((s) => s.publicQueue + s.reserveQueue) || [];
  const hasTrend = playerData.length >= 2 || queueData.length >= 2;

  return (
    <div className="facet-border group rounded-sm bg-bg-card transition-colors hover:bg-bg-card-hover">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            {server.name}
          </div>
          <StatusBadge variant={isOnline ? "server-online" : "server-offline"} />
        </div>

        <div className="mb-3 flex items-baseline gap-2">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold tabular-nums text-text-primary">
              {server.players}
            </span>
            <span className="text-sm text-text-muted">/ {server.maxPlayers}</span>
          </div>
          {queue > 0 && (
            <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              +{queue} queue
            </span>
          )}
        </div>

        <CapacityBar
          value={server.players}
          max={server.maxPlayers}
          className="mb-3"
        />

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{server.map}</span>
          <a
            href={connectUrl}
            className="text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100"
          >
            Connect
          </a>
        </div>
      </div>

      {hasTrend && (
        <div className="border-t border-border/30 px-4 pt-3 pb-3">
          <MultiSparkline
            series={[
              { values: playerData, label: "Players", className: "text-accent" },
              { values: queueData, label: "Queue", className: "text-warning" },
            ]}
            fixedMax={server.maxPlayers || 100}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/server-status-card.test.tsx && bunx tsc --noEmit`
Expected: PASS (4 tests), zero warnings, tsc clean.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/dashboard/server-status-card.tsx" packages/web/test/server-status-card.test.tsx
git commit -m "feat(web): extract dashboard server card on capacity bar and multi sparkline"
```

### Task 10: PlayerStatsSection rebuild + PlayerStatsCharts extraction

Rebuild `app/(protected)/dashboard/player-stats-section.tsx` (550 lines) on the design system: shared `InfoTip` replaces the local copy, `StatCard`/`StatGroup` replace the local `StatTile`/`GroupLabel`, `ToggleGroup` replaces the hand-rolled window buttons, `EmptyState` renders the two nudge states (now with CTAs), and the recharts blocks move to a new `player-stats-charts.tsx` themed entirely through the chart-token bridge (`useChartTokens()`) with `isAnimationActive={false}` on every series — deleting the raw hex constants (`#c8a84e`, `#ef4444`, `rgba(18,17,13,...)`, `#8a8780`, `#a8a29e`).

Charts are injected as a component prop with a default (`Charts = PlayerStatsCharts`) — the same DI spirit as Phase 1's `fetchers` props — because recharts' `ResponsiveContainer` needs a real layout engine and would emit size warnings under happy-dom, violating the zero-warning gate. `player-stats-charts.tsx` itself carries no unit test (documented reason: requires layout; it is exercised by tsc and the dev smoke) — state this in your report.

**Files:**
- Create: `packages/web/app/(protected)/dashboard/player-stats-charts.tsx`
- Modify: `packages/web/app/(protected)/dashboard/player-stats-section.tsx` (full rewrite)
- Create: `packages/web/test/player-stats-section.test.tsx`

**Interfaces:**
- Consumes: `InfoTip` (Task 2), `StatCard`/`StatGroup` (Task 3), `EmptyState`, `Skeleton`/`SkeletonCard`, `ToggleGroup`/`ToggleGroupItem`, `Button`, `useChartTokens` from `@/lib/chart-tokens`, `getPlayerStats` from `@/lib/api-client`, `usePermissions` from `@/lib/permission-context`, types `PlayerStats, PlayerStatsWindow, StatWindowKey, ApiResponse` from `shared`.
- Produces:
  - `player-stats-charts.tsx`: `interface ChartPoint { date: string; kills: number; deaths: number; playtime: number }` and `PlayerStatsCharts({ data }: { data: ChartPoint[] })` (named exports).
  - `player-stats-section.tsx`: default export `PlayerStatsSection({ api?, Charts? }: { api?: StatsApi; Charts?: React.ComponentType<{ data: ChartPoint[] }> })` where `StatsApi = { getPlayerStats: (token: string) => Promise<ApiResponse<PlayerStats>> }`; plus exported pure helpers `fmtHours(h: number): string`, `prettyWeapon(raw: string): string`, `shortDate(iso: string): string` for testing. The section reads `apiToken` from `usePermissions()` exactly as today.

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/player-stats-section.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { PermissionProvider } from "@/lib/permission-context";
import PlayerStatsSection, {
  fmtHours,
  prettyWeapon,
  shortDate,
} from "@/app/(protected)/dashboard/player-stats-section";
import type { PlayerStats, PlayerStatsWindow } from "shared";

const win = (kdr: number): PlayerStatsWindow => ({
  kills: 100,
  deaths: 40,
  kdr,
  teamkills: 2,
  revivesGiven: 30,
  revivesReceived: 25,
  playtimeHours: 42,
  seedHours: 5,
  sessions: 12,
  avgSessionMinutes: 95,
  slHours: 8,
  slRounds: 6,
  squadsCreated: 4,
  vehiclesDestroyed: 3,
  fobHabHits: 40,
  seedDays: 3,
});

const fullStats: PlayerStats = {
  linked: true,
  hasData: true,
  steamId: "76561198000000001",
  playerName: "Olie",
  windows: { d7: win(1.1), d30: win(2.5), d90: win(3.1), all: win(4.2) },
  records: {
    favoriteWeapon: { name: "BP_M4_Carbine_C", kills: 250 },
    favoriteMap: { map: "Narva", rounds: 40 },
    bestRound: { map: "Yehorivka", date: "2026-06-01", kills: 18 },
  },
  daily: [
    { date: "2026-07-01", kills: 5, deaths: 2, playtimeHours: 1.5 },
    { date: "2026-07-02", kills: 8, deaths: 3, playtimeHours: 2 },
    { date: "2026-07-03", kills: 2, deaths: 1, playtimeHours: 0.5 },
  ],
};

const ChartsStub = ({ data }: { data: { date: string }[] }) => (
  <div data-testid="charts">{data.length}</div>
);

function renderSection(stats: PlayerStats) {
  const api = {
    getPlayerStats: mock(() =>
      Promise.resolve({ success: true as const, data: stats }),
    ),
  };
  return render(
    <PermissionProvider permissions={[]} apiToken="tok" user={null}>
      <PlayerStatsSection api={api} Charts={ChartsStub} />
    </PermissionProvider>,
  );
}

test("pure helpers format values", () => {
  expect(prettyWeapon("BP_M4_Carbine_C")).toBe("M4 Carbine");
  expect(shortDate("2026-07-01")).toBe("01 Jul");
  expect(fmtHours(42.4)).toBe("42h");
});

test("not-linked renders the Steam nudge with an anchor CTA", async () => {
  renderSection({ ...fullStats, linked: false, hasData: false });
  const cta = await screen.findByRole("link", { name: "Link Steam ID" });
  expect(cta.getAttribute("href")).toBe("#steam-link");
  expect(screen.getByText(/Link your Steam ID above/)).toBeDefined();
});

test("linked but no data renders the activity nudge with a server CTA", async () => {
  renderSection({ ...fullStats, hasData: false });
  const cta = await screen.findByRole("link", { name: "How to Connect" });
  expect(cta.getAttribute("href")).toBe("/server");
  expect(screen.getByText(/No recorded activity/)).toBeDefined();
});

test("renders grouped tiles for the default 30D window and the charts slot", async () => {
  renderSection(fullStats);
  expect(await screen.findByText("2.50")).toBeDefined(); // d30 KDR
  expect(screen.getByText("Combat")).toBeDefined();
  expect(screen.getByText("Activity")).toBeDefined();
  expect(screen.getByText("Leadership & Objectives")).toBeDefined();
  expect(screen.getByTestId("charts").textContent).toBe("3");
  expect(screen.getByText("M4 Carbine")).toBeDefined(); // record, prettified
});

test("window toggle switches the displayed window", async () => {
  renderSection(fullStats);
  await screen.findByText("2.50");
  fireEvent.click(screen.getByRole("button", { name: "7D" }));
  expect(screen.getByText("1.10")).toBeDefined();
  expect(screen.queryByText("2.50")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/player-stats-section.test.tsx`
Expected: FAIL — no exported helpers / `api` prop unknown / nudge CTAs missing.

(If `PermissionProvider`'s props differ from `{ permissions, apiToken, user }`, check `lib/permission-context.tsx:23-29` — that is its exact signature.)

- [ ] **Step 3: Write PlayerStatsCharts**

Create `packages/web/app/(protected)/dashboard/player-stats-charts.tsx`:

```tsx
"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useChartTokens } from "@/lib/chart-tokens";

export interface ChartPoint {
  date: string;
  kills: number;
  deaths: number;
  playtime: number;
}

/**
 * Dashboard personal-stats charts, themed through the chart-token bridge so
 * both themes render correctly. recharts animations are disabled per the
 * design spec's motion rules.
 */
export function PlayerStatsCharts({ data }: { data: ChartPoint[] }) {
  const t = useChartTokens();
  const axisTick = { fontSize: 10, fill: t.axis } as const;
  const tooltipStyle = {
    background: t.tooltip.bg,
    border: `1px solid ${t.tooltip.border}`,
    borderRadius: 4,
    fontSize: 12,
    color: t.tooltip.text,
  } as const;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="facet-border rounded-sm bg-bg-card p-4">
        <div className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
          Playtime / day (hrs)
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="ptFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={axisTick}
              minTickGap={24}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisTick}
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: t.axis }} />
            <Area
              type="monotone"
              dataKey="playtime"
              name="Hours"
              stroke={t.accent}
              strokeWidth={2}
              fill="url(#ptFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="facet-border rounded-sm bg-bg-card p-4">
        <div className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
          Kills vs Deaths / day
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={axisTick}
              minTickGap={24}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisTick}
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: t.axis }} />
            <Line
              type="monotone"
              dataKey="kills"
              name="Kills"
              stroke={t.accent}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="deaths"
              name="Deaths"
              stroke={t.danger}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the section**

Replace the full contents of `packages/web/app/(protected)/dashboard/player-stats-section.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPlayerStats } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { StatCard, StatGroup } from "@/components/stat-card";
import { InfoTip } from "@/components/info-tip";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  PlayerStatsCharts,
  type ChartPoint,
} from "@/app/(protected)/dashboard/player-stats-charts";
import type {
  ApiResponse,
  PlayerStats,
  PlayerStatsWindow,
  StatWindowKey,
} from "shared";

/* ── helpers ─────────────────────────────────────────────────────────── */

const WINDOWS: { key: StatWindowKey; label: string; days: number }[] = [
  { key: "d7", label: "7D", days: 7 },
  { key: "d30", label: "30D", days: 30 },
  { key: "d90", label: "90D", days: 90 },
  { key: "all", label: "All", days: 90 },
];

export const fmtHours = (h: number) => (h >= 10 ? `${Math.round(h)}h` : `${h}h`);
const fmtNum = (n: number) => n.toLocaleString("en-US");

export function prettyWeapon(raw: string): string {
  return raw
    .replace(/_C$/, "")
    .replace(/^BP_/, "")
    .replace(/_/g, " ")
    .trim();
}

export function shortDate(iso: string): string {
  // iso is "YYYY-MM-DD"
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1] ?? ""}`;
}

export interface StatsApi {
  getPlayerStats: (token: string) => Promise<ApiResponse<PlayerStats>>;
}

const defaultApi: StatsApi = { getPlayerStats };

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
        My Squad Stats
      </h2>
      {children}
    </div>
  );
}

/* ── main section ────────────────────────────────────────────────────── */

export default function PlayerStatsSection({
  api = defaultApi,
  Charts = PlayerStatsCharts,
}: {
  api?: StatsApi;
  Charts?: React.ComponentType<{ data: ChartPoint[] }>;
}) {
  const { apiToken } = usePermissions();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeWindow, setActiveWindow] = useState<StatWindowKey>("d30");

  useEffect(() => {
    if (!apiToken) return;
    let cancelled = false;
    async function fetchStats() {
      const res = await api.getPlayerStats(apiToken!);
      if (!cancelled) {
        if (res.success && res.data) setStats(res.data);
        setLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [apiToken, api]);

  const win: PlayerStatsWindow | null = stats ? stats.windows[activeWindow] : null;

  const chartData: ChartPoint[] = useMemo(() => {
    if (!stats) return [];
    const days = WINDOWS.find((w) => w.key === activeWindow)?.days ?? 90;
    return stats.daily.slice(-days).map((p) => ({
      date: shortDate(p.date),
      kills: p.kills,
      deaths: p.deaths,
      playtime: p.playtimeHours,
    }));
  }, [stats, activeWindow]);

  if (loading) {
    return (
      <SkeletonCard>
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded" />
          ))}
        </div>
      </SkeletonCard>
    );
  }

  if (!stats) return null;

  // Not linked -> nudge toward the Steam-link form in the profile header above.
  if (!stats.linked) {
    return (
      <SectionCard>
        <EmptyState
          className="py-8"
          message="Link your Steam ID above to unlock your personal Squad stats — kills, K/D, playtime, squad-lead time and more."
          action={
            <Button
              variant="outlineGold"
              size="sm"
              render={<a href="#steam-link" />}
            >
              Link Steam ID
            </Button>
          }
        />
      </SectionCard>
    );
  }

  // Linked but no record on our servers yet.
  if (!stats.hasData) {
    return (
      <SectionCard>
        <EmptyState
          className="py-8"
          message="No recorded activity on our servers yet. Jump in-game and your stats will show up here."
          action={
            <Button
              variant="outlineGold"
              size="sm"
              render={<Link href="/server" />}
            >
              How to Connect
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const records = stats.records;

  return (
    <div className="facet-border rounded-sm bg-bg-card">
      {/* Header + window toggle */}
      <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
            My Squad Stats
          </h2>
          <p className="text-[11px] text-text-muted">
            {stats.playerName ? `${stats.playerName} · ` : ""}Royal Battalion servers · kills = enemies
            incapacitated
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <InfoTip
            label="Time window"
            text="7D, 30D and 90D show totals for the last 7, 30 or 90 days. All shows your lifetime totals. The charts below always cover the last 90 days."
          />
          <ToggleGroup
            value={[activeWindow]}
            onValueChange={(next) => {
              const key = next[0] as StatWindowKey | undefined;
              if (key) setActiveWindow(key);
            }}
            aria-label="Time window"
          >
            {WINDOWS.map((w) => (
              <ToggleGroupItem key={w.key} value={w.key}>
                {w.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {win && (
        <div className="space-y-5 p-5">
          <StatGroup label="Combat">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="KDR"
                value={win.kdr.toFixed(2)}
                accent
                tip="Kills ÷ deaths. With no deaths yet, this just shows your kill count."
              />
              <StatCard
                label="Kills"
                value={fmtNum(win.kills)}
                tip="Enemies you incapacitated (downed). The down counts even if they're revived afterwards. Teamkills don't count."
              />
              <StatCard
                label="Deaths"
                value={fmtNum(win.deaths)}
                tip="Times you were incapacitated (downed), from any cause."
              />
              <StatCard
                label="Teamkills"
                value={fmtNum(win.teamkills)}
                tip="Friendly players you downed by mistake."
              />
              <StatCard
                label="Revives"
                value={fmtNum(win.revivesGiven)}
                tip="Teammates you revived — counted each time you picked up a downed ally."
              />
              <StatCard
                label="Revived"
                value={fmtNum(win.revivesReceived)}
                tip="Times a teammate picked you up after you went down."
              />
            </div>
          </StatGroup>

          <StatGroup label="Activity">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Playtime"
                value={fmtHours(win.playtimeHours)}
                accent
                tip="Total time connected to our servers, added up across all your sessions."
              />
              <StatCard
                label="Sessions"
                value={fmtNum(win.sessions)}
                tip="How many times you joined and left — one session per connect-to-disconnect."
              />
              <StatCard
                label="Avg Session"
                value={
                  win.avgSessionMinutes >= 60
                    ? `${(win.avgSessionMinutes / 60).toFixed(1)}h`
                    : `${win.avgSessionMinutes}m`
                }
                tip="Your average session length (playtime ÷ sessions)."
              />
              <StatCard
                label="Seed Days"
                value={fmtNum(win.seedDays)}
                tip="Distinct days you helped seed the server, counted once per day."
              />
              <StatCard
                label="Seed Time"
                value={fmtHours(win.seedHours)}
                tip="Time you spent on the server while it was seeding (low population)."
              />
              <StatCard
                label="Vehicles"
                value={fmtNum(win.vehiclesDestroyed)}
                tip="Enemy vehicles you destroyed. Friendly vehicles don't count."
              />
            </div>
          </StatGroup>

          <StatGroup label="Leadership & Objectives">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="SL Time"
                value={fmtHours(win.slHours)}
                tip="Total time you spent leading a squad."
              />
              <StatCard
                label="Rounds as SL"
                value={fmtNum(win.slRounds)}
                tip="Number of rounds in which you led a squad."
              />
              <StatCard
                label="Squads Made"
                value={fmtNum(win.squadsCreated)}
                tip="Squads you created."
              />
              <StatCard
                label="FOB/HAB Hits"
                value={fmtNum(win.fobHabHits)}
                tip="Damage you dealt to enemy FOBs and HABs (their spawn structures)."
              />
            </div>
          </StatGroup>

          <Charts data={chartData} />

          {(records.favoriteWeapon || records.favoriteMap || records.bestRound) && (
            <StatGroup label="Records (all-time)">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Favorite Weapon"
                  tip="The weapon you've gotten the most kills with, all-time."
                  value={
                    records.favoriteWeapon
                      ? prettyWeapon(records.favoriteWeapon.name)
                      : "—"
                  }
                  hint={
                    records.favoriteWeapon
                      ? `${fmtNum(records.favoriteWeapon.kills)} kills`
                      : undefined
                  }
                />
                <StatCard
                  label="Most Played Map"
                  tip="The map you've played the most rounds on, all-time."
                  value={records.favoriteMap ? records.favoriteMap.map : "—"}
                  hint={
                    records.favoriteMap
                      ? `${fmtNum(records.favoriteMap.rounds)} rounds`
                      : undefined
                  }
                />
                <StatCard
                  label="Best Round (kills)"
                  tip="Your highest kill count in a single round, all-time."
                  accent
                  value={
                    records.bestRound
                      ? `${fmtNum(records.bestRound.kills)} kills`
                      : "—"
                  }
                  hint={
                    records.bestRound
                      ? `${records.bestRound.map ?? "Unknown"} · ${new Date(
                          records.bestRound.date,
                        ).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}`
                      : undefined
                  }
                />
              </div>
            </StatGroup>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test test/player-stats-section.test.tsx && bunx tsc --noEmit`
Expected: PASS (5 tests), zero warnings, tsc clean. Two known adjustment points if reality disagrees:
- If Base UI's `ToggleGroup` `onValueChange` delivers a non-array, check `node_modules/@base-ui/react/toggle-group/ToggleGroup.d.ts` — the signature is `onValueChange?: (groupValue: Value[], eventDetails) => void`, so `next[0]` is correct.
- If the `EmptyState` CTA `render={<a href="#steam-link" />}` renders no accessible link name, put the label inside the anchor instead: `render={<a href="#steam-link">Link Steam ID</a>}` and drop the Button children.

- [ ] **Step 6: Run the FULL suite (regression gate)**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test`
Expected: all files pass, zero warnings — this rewrite deletes the local InfoTip; nothing else may import it (nothing does today).

- [ ] **Step 7: Commit**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/dashboard/player-stats-section.tsx" "packages/web/app/(protected)/dashboard/player-stats-charts.tsx" packages/web/test/player-stats-section.test.tsx
git commit -m "feat(web): rebuild player stats on design system with themed charts"
```

### Task 11: Page composition + gallery + wave gates + version bump

Slim `page.tsx` from 742 lines to a composition of the extracted cards: ProfileCard, BirthdayAdminCard (still gated on `manage:discord-bot`), PlayerStatsSection, ServerStatusCard grid, quick-stat `StatCard`s, and the recent-matches card (result pill → `StatusBadge` + `matchResultVariant`). Data fetching migrates to the canonical `useAutoRefresh` (30s, visibility-aware — behavior identical to the hand-rolled interval it replaces). The pre-token state becomes a skeleton (no "Loading dashboard..." text). Add the new composites to the `/design` gallery. Close the wave: sweep gates, full suite, version bump.

**Files:**
- Modify: `packages/web/app/(protected)/dashboard/page.tsx` (full rewrite)
- Modify: `packages/web/app/design/gallery.tsx` (new section + imports)
- Modify: `package.json` (repo root — version only)

**Interfaces:**
- Consumes: everything produced by Tasks 7-10 (`ProfileCard`, `BirthdayAdminCard`, `ServerStatusCard`, `PlayerStatsSection` default exports), `StatCard` (Task 3), `ConfigCard`/`CapacityBar` (Task 5), `MultiSparkline` (Task 6), `TimezoneCombobox` (Task 4), `InfoTip`/`FieldTip` (Task 2), `StatusBadge`/`matchResultVariant`, `useAutoRefresh`, `SkeletonStatGrid`, `getDashboardStats`/`DashboardStats` from `@/lib/api-client`.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `packages/web/app/(protected)/dashboard/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getDashboardStats } from "@/lib/api-client";
import type { DashboardStats } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { StatusBadge, matchResultVariant } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { SkeletonStatGrid } from "@/components/skeleton";
import ProfileCard from "./profile-card";
import BirthdayAdminCard from "./birthday-admin-card";
import ServerStatusCard from "./server-status-card";
import PlayerStatsSection from "./player-stats-section";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { apiToken, user: contextUser, hasPermission } = usePermissions();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!apiToken) return;
    const res = await getDashboardStats(apiToken);
    if (res.success && res.data) setStats(res.data);
    setStatsLoading(false);
  }, [apiToken]);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, 30_000);

  if (!apiToken) {
    return (
      <SkeletonStatGrid
        count={4}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      />
    );
  }

  const isAdmin = hasPermission("developer");
  const canViewMembers = hasPermission("view:members");
  const canViewWhitelist = hasPermission("view:whitelist");
  const canManageMatches = hasPermission("manage:matches");

  const statCards: {
    label: string;
    value: string | number;
    accent?: boolean;
    href?: string;
  }[] = [];

  if (isAdmin && stats?.tickets) {
    statCards.push({
      label: "Open Tickets",
      value: stats.tickets.open,
      accent: stats.tickets.open > 0,
      href: "/tickets",
    });
  }

  if (isAdmin && stats?.prospects) {
    statCards.push({
      label: "Pending Prospects",
      value: stats.prospects.open,
      accent: stats.prospects.open > 0,
      href: "/tickets",
    });
  }

  if (canViewMembers && stats?.members) {
    statCards.push({
      label: "Total Members",
      value: stats.members.total,
    });
  }

  if (canViewWhitelist && stats?.whitelist) {
    statCards.push({
      label: "Whitelist Entries",
      value: stats.whitelist.total,
      href: "/whitelist",
    });
  }

  return (
    <div className="space-y-6">
      <ProfileCard
        token={apiToken}
        sessionName={session?.user?.name ?? null}
        sessionEmail={session?.user?.email ?? null}
        sessionImage={session?.user?.image ?? null}
        user={contextUser}
      />

      {hasPermission("manage:discord-bot") && (
        <BirthdayAdminCard token={apiToken} />
      )}

      <PlayerStatsSection />

      {statsLoading ? (
        <SkeletonStatGrid count={2} className="grid gap-4 sm:grid-cols-2" />
      ) : stats?.servers && stats.servers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {stats.servers.map((server) => (
            <ServerStatusCard key={server.id} server={server} />
          ))}
        </div>
      ) : null}

      {statCards.length > 0 && (
        <div
          className={`grid gap-4 ${
            statCards.length >= 4
              ? "grid-cols-2 lg:grid-cols-4"
              : statCards.length === 3
                ? "grid-cols-2 lg:grid-cols-3"
                : statCards.length === 2
                  ? "sm:grid-cols-2"
                  : ""
          }`}
        >
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {canManageMatches &&
        stats?.recentMatches &&
        stats.recentMatches.length > 0 && (
          <div className="facet-border rounded-sm bg-bg-card">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <h2 className="font-display text-sm font-semibold tracking-wide">
                Recent Matches
              </h2>
              <Link
                href="/match-manager"
                className="text-xs font-medium text-accent transition-colors hover:text-accent-bright"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-border/30">
              {stats.recentMatches.map((match) => (
                <div key={match.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-text-muted">
                    {new Date(match.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {match.map}
                  </span>
                  <span className="hidden text-xs text-text-muted sm:block">
                    {match.server}
                  </span>
                  <StatusBadge variant={matchResultVariant(match.result)} />
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
```

(Note: `hover:text-accent-muted` from the old page does not exist as a token utility — the shell uses `hover:text-accent-bright`; use that.)

- [ ] **Step 2: Add the gallery section**

In `packages/web/app/design/gallery.tsx`:

Add to the imports:

```tsx
import { useState } from "react";
import { ConfigCard } from "@/components/config-card";
import { CapacityBar } from "@/components/capacity-bar";
import { MultiSparkline } from "@/components/sparkline";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { InfoTip } from "@/components/info-tip";
import { FieldTip } from "@/components/field-tip";
import { StatGroup } from "@/components/stat-card";
```

(`Sparkline` is already imported from `@/components/sparkline` — merge into one import statement. `Switch`, `Button`, `StatCard` are already imported.)

Then add this section before the closing "Admin sidebar (embedded preview)" section:

```tsx
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Dashboard composites</h2>
        <GalleryDashboardComposites />
      </section>
```

And add this component at the bottom of the file:

```tsx
function GalleryDashboardComposites() {
  const [tz, setTz] = useState("Europe/Oslo");
  return (
    <div className="space-y-4">
      <ConfigCard
        title="Birthday announcements"
        description="ConfigCard: permission-gated feature config on a content page."
        headerAction={
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <Switch defaultChecked aria-label="Enabled" /> Enabled
          </label>
        }
        footer={
          <Button variant="gold" size="sm">
            Save
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Timezone
            </span>
            <TimezoneCombobox value={tz} onChange={setTz} />
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Capacity
            </span>
            <CapacityBar value={87} max={100} className="mt-3" />
          </div>
        </div>
      </ConfigCard>

      <StatGroup label="Stat tiles">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="KDR" value="1.42" accent tip="Kills divided by deaths." />
          <StatCard label="Playtime" value="42h" hint="last 30 days" />
          <StatCard label="Open Tickets" value={3} href="#" />
          <StatCard label="Trend" value="87">
            <MultiSparkline
              series={[
                { values: [40, 60, 87], label: "Players", className: "text-accent" },
                { values: [0, 2, 4], label: "Queue", className: "text-warning" },
              ]}
              fixedMax={100}
              className="w-28"
            />
          </StatCard>
        </div>
      </StatGroup>

      <p className="text-xs text-text-secondary">
        Read-only field:{" "}
        <FieldTip>
          <code className="font-mono text-accent">76561198012345678</code>
        </FieldTip>{" "}
        · Explainer: <InfoTip label="Seed time" text="Time on the server while seeding." />
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Sweep gates (must all be empty)**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web
grep -rn "accent-accent" "app/(protected)/dashboard" ; \
grep -rn "#c8a84e\|#f59e0b\|#ef4444\|#8a8780\|#a8a29e\|rgba(18,17,13\|rgba(255,255,255" "app/(protected)/dashboard" ; \
grep -rn "resultBadgeBg\|function FieldTip\|function InfoTip\|function StatTile\|interface SparklineLine" "app/(protected)/dashboard"
```

Expected: no output from any of the three (exit code 1 from grep = clean). These prove: no native accent-checkboxes, no raw colors, no leftover page-local component copies in the dashboard directory.

- [ ] **Step 4: Full suite + types**

Run: `cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment/packages/web && bun test && bunx tsc --noEmit`
Expected: all tests pass, zero warnings, tsc clean.

- [ ] **Step 5: Commit the rebuild**

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add "packages/web/app/(protected)/dashboard/page.tsx" packages/web/app/design/gallery.tsx
git commit -m "feat(web): compose dashboard from design system cards"
```

- [ ] **Step 6: Version bump and wave-close commit**

Edit the repo-root `package.json`: `"version": "2.7.0"` → `"version": "2.8.0"`.

```bash
cd C:/Users/OleEd/Azure/RoyalBattalionWebpage/.claude/worktrees/gilded-regiment
git add package.json
git commit -m "chore(web): phase 2b dashboard wave, bump to 2.8.0"
```

---

## Wave-Close Verification (controller-level, after all tasks)

- Full suite + tsc from `packages/web`: green, zero warnings.
- Dev smoke (controller runs this, not a task subagent): `bun dev` in `packages/web`, then `/` → 200, `/design` → 200 (gallery renders the new "Dashboard composites" section), `/dashboard` → 307 unauthenticated redirect.
- `git status` clean; branch `integration/gilded-regiment` NOT pushed.
- Ledger `.superpowers/sdd/progress.md` updated per task under a "PHASE 2b" heading.
- Known deferred items (do NOT fix in this wave): `bg-green-500` occurrences in audit-logs / rcon-console / live-server / whitelist (their own waves); the page-local `app/(protected)/live-server/components/sparkline.tsx` (absorbed in wave 2d/Phase 3); `modal.tsx` consumers (Phase 3).

## Spec-Coverage Self-Review (done at plan time)

- Profile header card (identity FieldTips, roles, inline Steam link, birthday privacy toggles) → Tasks 2, 8. Activity/Seed-time row intentionally absent (spec: never implemented).
- BirthdayAdminCard on /dashboard behind `manage:discord-bot`, first ConfigCard + TimezoneCombobox + Switch consumer → Tasks 4, 5, 7, 11.
- Personal stats: recharts themed via chart-token bridge, animations off, grouped StatTiles→StatCard/StatGroup, 7D/30D/90D/All ToggleGroup, InfoTips, two nudge empty states → Tasks 3, 10.
- Server cards: multi-series sparkline + CapacityBar + queue badge → Tasks 5, 6, 9.
- Quick stats + recent matches (StatusBadge win/loss/draw) → Task 11.
- Sonner first consumer + toast contract (machine-code bypass) → Task 1, consumed in 7, 8.
- Native accent-checkboxes → Switch → Tasks 7, 8 (grep-gated in 11).
- Data freshness: `use-auto-refresh` canonical, skeletons initial-load-only → Tasks 7, 10, 11.

<!-- PLAN-END -->

# Phase 2d — Live Server (Monitor + Console) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Live Server Monitor (`/live-server`) and RCON Console (`/live-server/console`) onto the Gilded Regiment design system — legacy `Modal` → Base UI `Dialog`/`AlertDialog`, native `window.confirm`/`prompt` → `AlertDialog`/`Dialog`, a new `TerminalPane` + `ConnectionStatus`/`ServerScope` composite set, the page-local sparkline absorbed into the composite `Sparkline`, a styled permission-denied state with tabs above the gate, and a full raw-palette → token sweep — with identical behavior.

**Architecture:** Six small, tested composites (`AreaSparkline`, `EmptyState` hint variant, `ConnectionStatus`, `ServerScope`, `AccessDeniedCard`, `TerminalPane`) are built first (Tasks 1–5), then wired into the console (Task 6) and the monitor (Tasks 7–9), then showcased in the gallery with a version bump (Task 10). The monitor is a reskin-in-place (its dialogs stay inline in `page.tsx`, not decomposed — spec §5 calls it a reskin, not a whitelist-style decomposition). The console becomes a thin wrapper wiring `useRconSocket` → `TerminalPane`. No data-fetching, WebSocket wiring, permissions, or behavior changes.

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, shadcn-on-Base-UI primitives (`@base-ui/react` Dialog/AlertDialog/Button, `cmdk` Command), bun test + @testing-library/react + happy-dom.

## Global Constraints

Every task's requirements implicitly include this section. Copy exact values verbatim.

- **NEVER push.** Railway auto-deploys the `origin/production` branch to BOTH staging and prod. Pushing is the user's explicit call — this wave ends merge-ready and unpushed.
- **Commits:** Conventional Commits one-liners (`type(scope): description`). NO `Co-Authored-By`, NO Claude/AI attribution, NO emojis anywhere (code, commits, comments, UI copy).
- **Design tokens only.** No raw hex and no Tailwind palette classes (`blue-`, `red-`, `green-`, `purple-`, `emerald-`, `orange-`, `yellow-`, `pink-`, `indigo-`, `teal-`, `cyan-`, `slate-`, etc. followed by a number). Team colors use the existing `team-one` / `team-two` tokens (`--color-team-one` = blue, `--color-team-two` = red, defined in `app/globals.css @theme`, both themes). Semantic states use `success` / `warning` / `danger` / `accent`. **Grep-gate (scoped to this wave's files):** after Task 9, this returns nothing:
  ```
  git grep -nE '(blue|red|green|purple|emerald|orange|yellow|pink|indigo|teal|cyan|slate)-[0-9]' -- "packages/web/app/(protected)/live-server" packages/web/components/terminal-pane.tsx packages/web/components/connection-status.tsx packages/web/components/access-denied-card.tsx
  ```
  (Out of scope: `audit-logs`, `tickets`, `lobby-monitor` still carry raw palette — those are 2e / Phase 3.)
- **Identical behavior, verified feature-by-feature.** Data fetching, WebSocket wiring (`useRconSocket`, the monitor's WS effect/keepalive/metric-sampling), permission gates, localStorage keys (`rb-default-server`, `rb-console-filters`), and all action payloads are unchanged. This is a visual + structural reskin.
- **Base UI primitives only.** Native `window.confirm` / `window.alert` / `window.prompt` are banned — replace with `AlertDialog` (confirms) or `Dialog` (input prompts).
- **Sidebar gating is ALREADY done** — `components/shell/nav-config.ts` already lists `manage:rcon-console` on the Live Server item (Phase 2a). Do NOT re-touch nav-config. The middleware (`middleware.ts`) gates on authentication only (session token), not permissions, so standalone-console users reach `/live-server/console` at the edge — no middleware change.
- **Worktree quirks:** NEVER run `bun install` here (bun-types failure; deps are present). Run tests and `tsc` FROM `packages/web` only. Start every shell command with an absolute `cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"`. QUOTE any parenthesized path (`"app/(protected)/..."`) in git/shell commands. The suite gate is zero failures AND zero warnings.

### Testing gotchas (carry forward from 2b/2c + new to this wave)

- **`cn` is `twMerge(clsx(...))`** — later Tailwind classes override earlier ones, so `className="max-w-md p-6"` on a `DialogContent` (whose base has `sm:max-w-sm ... p-4`) correctly wins.
- **Base UI `Button` renders UPPERCASE** (`uppercase tracking-[0.12em]` in `buttonVariants`). In the monitor's Modal→Dialog swaps, KEEP the existing custom footer `<button>` elements (already token-clean, normal-case) — only swap the wrapper and heading. Use `<Button>`/`AlertDialogAction` only in the AlertDialog confirm recipe (uppercase there is the intended design-system look). `textContent` is unchanged by CSS uppercase, so role/text queries use the normal-case string (optionally `/i`).
- **Base UI `Dialog`/`AlertDialog`** are controlled via `open` + `onOpenChange`, portal to `document.body`, and need NO `Trigger` for controlled open (see `whitelist/cfg-dialog.tsx`). Portaled content is queryable via `screen.*`. `AlertDialogAction`/`AlertDialogCancel` are real `Button`s — `fireEvent.click` works. **Watch-item:** this wave is the first to exercise `ui/alert-dialog` in tests; it is the same `@base-ui/react` family as the proven `ui/dialog`. If controlled-open content does not render under happy-dom, report BLOCKED (do not silently swap to Dialog).
- **cmdk `Command` works under happy-dom** (proven by `timezone-combobox.test.tsx`). The terminal autocomplete uses `Command` with `shouldFilter={false}` and a SEPARATE terminal `<input>` (not `CommandInput`), so history arrow-keys stay on the terminal input and don't collide with cmdk. Selection is via `CommandItem onSelect` (fires on click — the timezone test clicks item text and `onSelect` fires).
- **happy-dom does not implement `Element.scrollTo`** — guard the optional call: `el?.scrollTo?.({ ... })`.
- **HARD RULE (2 violations in 2c):** NEVER remove or rename product UI to make a test query unambiguous. Fix the TEST — `getAllByText(...).length`, `getByRole`, more specific queries. Deleting a label/field/heading to dodge a duplicate-text match is forbidden.

---

## File Structure

**New composite files:**
- `packages/web/components/connection-status.tsx` — `ConnectionStatus` + `ServerScope` (shared by Monitor + Console).
- `packages/web/components/terminal-pane.tsx` — `TerminalPane` + `TerminalLine` (RCON console).
- `packages/web/components/access-denied-card.tsx` — `AccessDeniedCard` (styled permission-denied state).

**Modified composite files:**
- `packages/web/components/sparkline.tsx` — add `AreaSparkline` (single-series area, `fixedMax`, currentColor).
- `packages/web/components/empty-state.tsx` — add `variant="hint"` (one-line mono, no lion).

**Console (rewritten thin):**
- `packages/web/app/(protected)/live-server/console/components/rcon-console.tsx` — wraps `useRconSocket` → `TerminalPane` + `ConnectionStatus` + `ServerScope` + List Disconnected action.
- `packages/web/app/(protected)/live-server/console/page.tsx` — tabs above a gated `AccessDeniedCard`.

**Monitor (reskin-in-place):**
- `packages/web/app/(protected)/live-server/page.tsx` — composite adoption (Task 7), Modal→Dialog/AlertDialog (Task 8), palette→tokens (Task 9).
- `packages/web/app/(protected)/live-server/components/player-card.tsx` — overlay→Dialog (Task 8), team color→token (Task 9).
- DELETE `packages/web/app/(protected)/live-server/components/sparkline.tsx` (Task 7).

**Gallery + version:**
- `packages/web/app/design/gallery.tsx` — Live Server composites section (Task 10).
- `package.json` (repo root) — version `2.9.0` → `2.10.0` (Task 10).

**New test files:** `terminal-pane.test.tsx`, `connection-status.test.tsx`, `access-denied-card.test.tsx`, `empty-state.test.tsx`. **Extended:** `sparkline.test.tsx`.

---

## Task 1: AreaSparkline (composite)

**Files:**
- Modify: `packages/web/components/sparkline.tsx`
- Test: `packages/web/test/sparkline.test.tsx`

**Interfaces:**
- Consumes: existing `multiSparklineCoords(values, width, height, max)` from the same file.
- Produces: `AreaSparkline({ values: number[], width?: number, height?: number, fixedMax?: number, className?: string }): JSX.Element | null` — single-series filled area (polygon `fillOpacity=0.15` + polyline), color from `className` (a `text-*` utility → `currentColor`), returns `null` when `values.length < 2`. Consumed by the monitor InfoCells (Task 7).

- [ ] **Step 1: Write the failing test** — append to `packages/web/test/sparkline.test.tsx`:

```tsx
import { AreaSparkline } from "@/components/sparkline";

test("AreaSparkline returns null below two points", () => {
  const { container } = render(<AreaSparkline values={[5]} />);
  expect(container.querySelector("svg")).toBeNull();
});

test("AreaSparkline draws an area + line with the color class", () => {
  const { container } = render(
    <AreaSparkline values={[0, 10, 20]} fixedMax={20} className="text-warning" />,
  );
  const svg = container.querySelector("svg")!;
  expect(svg).not.toBeNull();
  expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
  expect(svg.className.baseVal).toContain("text-warning");
  expect(svg.className.baseVal).toContain("h-full");
  expect(container.querySelector("polygon")).not.toBeNull();
  expect(container.querySelector("polyline")).not.toBeNull();
});
```

(If `sparkline.test.tsx` does not already import `render`/`test`/`expect`, they are present — it is the existing composite test. Do not duplicate the top-of-file imports; add only the `AreaSparkline` import line and the two tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/sparkline.test.tsx`
Expected: FAIL — `AreaSparkline` is not exported.

- [ ] **Step 3: Implement** — append to `packages/web/components/sparkline.tsx`:

```tsx
/**
 * Single-series filled-area sparkline on a shared 0-based scale. Color comes
 * from `className` (a text-* utility) via currentColor. Used as a decorative
 * background behind the live-server InfoCell values (absorbs the deleted
 * page-local live-server/components/sparkline.tsx).
 */
export function AreaSparkline({
  values,
  width = 120,
  height = 48,
  fixedMax,
  className = "text-accent",
}: {
  values: number[];
  width?: number;
  height?: number;
  fixedMax?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = fixedMax ?? Math.max(...values, 1);
  const coords = multiSparklineCoords(values, width, height, max);
  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`h-full w-full ${className}`}
      aria-hidden="true"
    >
      <polygon fill="currentColor" fillOpacity="0.15" points={area} />
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={line} />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/sparkline.test.tsx`
Expected: PASS (all sparkline tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git add components/sparkline.tsx test/sparkline.test.tsx
git commit -m "feat(web): add AreaSparkline single-series area variant"
```

---

## Task 2: EmptyState hint variant

**Files:**
- Modify: `packages/web/components/empty-state.tsx`
- Test: `packages/web/test/empty-state.test.tsx` (new)

**Interfaces:**
- Produces: `EmptyState({ message, action?, className?, variant? })` gains `variant?: "default" | "hint"`. `"hint"` renders a single-line mono muted `<p>` with NO lion image and no large padding (empty terminal scrollback, per spec §2 EmptyState). `"default"` is unchanged. Consumed by `TerminalPane` (Task 5).

- [ ] **Step 1: Write the failing test** — create `packages/web/test/empty-state.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/empty-state";

test("default variant renders the lion mark and message", () => {
  const { container } = render(<EmptyState message="No results." />);
  expect(container.querySelector("img")).not.toBeNull();
  expect(screen.getByText("No results.")).toBeDefined();
});

test("hint variant is a one-line mono message with no image", () => {
  const { container } = render(
    <EmptyState variant="hint" message="Type a command and press Enter." />,
  );
  expect(container.querySelector("img")).toBeNull();
  const p = screen.getByText("Type a command and press Enter.");
  expect(p.className).toContain("font-mono");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/empty-state.test.tsx`
Expected: FAIL — hint variant still renders an image (`variant` prop ignored).

- [ ] **Step 3: Implement** — replace the whole body of `packages/web/components/empty-state.tsx`:

```tsx
import Image from "next/image";
import { cn } from "@/lib/utils";

export function EmptyState({
  message,
  action,
  className,
  variant = "default",
}: {
  message: string;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "hint";
}) {
  if (variant === "hint") {
    return (
      <p className={cn("font-mono text-xs text-text-muted", className)}>{message}</p>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-14 text-center",
        className,
      )}
    >
      <Image
        src="/img/rb_newlion2024_4_RS.png"
        alt=""
        width={48}
        height={48}
        className="opacity-25 grayscale"
      />
      <p className="text-sm text-text-muted">{message}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git add components/empty-state.tsx test/empty-state.test.tsx
git commit -m "feat(web): add EmptyState hint variant for terminal scrollback"
```

---

## Task 3: ConnectionStatus + ServerScope composites

**Files:**
- Create: `packages/web/components/connection-status.tsx`
- Test: `packages/web/test/connection-status.test.tsx` (new)

**Interfaces:**
- Produces:
  - `ConnectionStatus({ tone: "success" | "warning" | "danger", label: string, active?: boolean, className?: string })` — a status dot (`bg-<tone>`, `transition-all duration-150`, `scale-150 brightness-150` when `active`) + a muted label. Shared by Monitor header + Console header.
  - `ServerScope({ servers: string[], active: string, onSwitch: (key: string) => void, variant?: "select" | "tabs", className?: string })` — returns `null` when `servers.length <= 1`. `"select"` renders a compact `<select>` (Console); `"tabs"` renders an underline pill strip (Monitor). Shared by both.

- [ ] **Step 1: Write the failing test** — create `packages/web/test/connection-status.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectionStatus, ServerScope } from "@/components/connection-status";

test("ConnectionStatus shows the label and a toned dot", () => {
  const { container } = render(<ConnectionStatus tone="success" label="Connected" />);
  expect(screen.getByText("Connected")).toBeDefined();
  const dot = container.querySelector("span[data-slot='status-dot']")!;
  expect(dot.className).toContain("bg-success");
  expect(dot.className).not.toContain("scale-150");
});

test("ConnectionStatus flashes when active", () => {
  const { container } = render(
    <ConnectionStatus tone="warning" label="Reconnecting" active />,
  );
  const dot = container.querySelector("span[data-slot='status-dot']")!;
  expect(dot.className).toContain("bg-warning");
  expect(dot.className).toContain("scale-150");
});

test("ServerScope select renders options and switches", () => {
  const onSwitch = mock((_k: string) => {});
  render(
    <ServerScope servers={["main", "battle"]} active="main" onSwitch={onSwitch} variant="select" />,
  );
  const select = screen.getByRole("combobox", { name: "Active server" }) as HTMLSelectElement;
  expect(select.value).toBe("main");
  fireEvent.change(select, { target: { value: "battle" } });
  expect(onSwitch).toHaveBeenCalledWith("battle");
});

test("ServerScope tabs render pills, mark active, and switch on click", () => {
  const onSwitch = mock((_k: string) => {});
  render(
    <ServerScope servers={["main", "battle"]} active="main" onSwitch={onSwitch} variant="tabs" />,
  );
  const active = screen.getByRole("button", { name: "main" });
  expect(active.className).toContain("text-accent");
  fireEvent.click(screen.getByRole("button", { name: "battle" }));
  expect(onSwitch).toHaveBeenCalledWith("battle");
});

test("ServerScope hides itself with one or zero servers", () => {
  const { container: c1 } = render(
    <ServerScope servers={["main"]} active="main" onSwitch={() => {}} variant="select" />,
  );
  expect(c1.querySelector("select")).toBeNull();
  const { container: c2 } = render(
    <ServerScope servers={[]} active="" onSwitch={() => {}} variant="tabs" />,
  );
  expect(c2.querySelector("button")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/connection-status.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** — create `packages/web/components/connection-status.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

const TONE_DOT: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Pulsing connection dot + label, shared by Live Server Monitor and Console. */
export function ConnectionStatus({
  tone,
  label,
  active,
  className,
}: {
  tone: "success" | "warning" | "danger";
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        data-slot="status-dot"
        aria-hidden="true"
        className={cn(
          "h-2 w-2 rounded-full transition-all duration-150",
          TONE_DOT[tone],
          active && "scale-150 brightness-150",
        )}
      />
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

/** Active-server switcher, shared by Live Server Monitor (tabs) and Console (select). */
export function ServerScope({
  servers,
  active,
  onSwitch,
  variant = "select",
  className,
}: {
  servers: string[];
  active: string;
  onSwitch: (key: string) => void;
  variant?: "select" | "tabs";
  className?: string;
}) {
  if (servers.length <= 1) return null;

  if (variant === "tabs") {
    return (
      <div className={cn("flex gap-1 border-b border-border", className)}>
        {servers.map((key) => (
          <button
            key={key}
            onClick={() => onSwitch(key)}
            className={cn(
              "relative px-5 py-2.5 text-sm font-medium capitalize tracking-wide transition-colors",
              active === key ? "text-accent" : "text-text-muted hover:text-text-secondary",
            )}
          >
            {key}
            {active === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      aria-label="Active server"
      value={active}
      onChange={(e) => onSwitch(e.target.value)}
      className={cn(
        "rounded-sm border border-border bg-bg-primary px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent",
        className,
      )}
    >
      {servers.map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/connection-status.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git add components/connection-status.tsx test/connection-status.test.tsx
git commit -m "feat(web): add ConnectionStatus and ServerScope live-server composites"
```

---

## Task 4: AccessDeniedCard composite

**Files:**
- Create: `packages/web/components/access-denied-card.tsx`
- Test: `packages/web/test/access-denied-card.test.tsx` (new)

**Interfaces:**
- Produces: `AccessDeniedCard({ title?: string, message: string, cta?: { href: string; label: string } })` — a `facet-border` card (matches the monitor's existing denial card) with an optional accent CTA `Link`. `title` defaults to `"Insufficient Permissions"`. Consumed by the Console page (Task 6); the Monitor denial card also adopts it (Task 8).

- [ ] **Step 1: Write the failing test** — create `packages/web/test/access-denied-card.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AccessDeniedCard } from "@/components/access-denied-card";

test("renders default title, message, and an optional CTA link", () => {
  render(
    <AccessDeniedCard
      message="You do not have access to the RCON console."
      cta={{ href: "/live-server", label: "Open Live Server Monitor" }}
    />,
  );
  expect(screen.getByText("Insufficient Permissions")).toBeDefined();
  expect(screen.getByText("You do not have access to the RCON console.")).toBeDefined();
  const link = screen.getByRole("link", { name: "Open Live Server Monitor" });
  expect(link.getAttribute("href")).toBe("/live-server");
});

test("omits the CTA when none is given and honors a custom title", () => {
  render(<AccessDeniedCard title="No access" message="Nope." />);
  expect(screen.getByText("No access")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/access-denied-card.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** — create `packages/web/components/access-denied-card.tsx`:

```tsx
import Link from "next/link";

/** Styled permission-denied panel for gated pages (live-server monitor + console). */
export function AccessDeniedCard({
  title = "Insufficient Permissions",
  message,
  cta,
}: {
  title?: string;
  message: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="facet-border w-full max-w-md rounded-sm bg-bg-card p-8 text-center">
      <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-text-primary">
        {title}
      </h1>
      <p className="text-sm text-text-secondary">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/access-denied-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git add components/access-denied-card.tsx test/access-denied-card.test.tsx
git commit -m "feat(web): add AccessDeniedCard permission-denied composite"
```

---

## Task 5: TerminalPane composite

**Files:**
- Create: `packages/web/components/terminal-pane.tsx`
- Test: `packages/web/test/terminal-pane.test.tsx` (new)

**Interfaces:**
- Consumes: `EmptyState` variant="hint" (Task 2); `Command`/`CommandList`/`CommandGroup`/`CommandItem` from `@/components/ui/command`; `AlertDialog*` from `@/components/ui/alert-dialog`; `Button`; `SquadCommand` from `shared`.
- Produces:
  - `TerminalLine { id: number | string; command: string; output: string; success: boolean; error?: string }`
  - `TerminalPane({ lines, onSubmit, onClear, commands, isDestructive, status?, actions?, emptyHint?, placeholder?, className? })` — mono scrollback (command echo `text-accent`, `pre-wrap` output, `text-danger` failure lines, autoscroll), a prompt input with up/down history and first-token autocomplete (Command primitive, `shouldFilter={false}`), and a data-driven destructive confirm (`AlertDialog`, keyed off `isDestructive(command)`). `status` (left) and `actions` (right) fill the header bar; `onClear` drives a Clear button. Consumed by the Console (Task 6) and the gallery (Task 10).

**Behavior contract (verbatim from the current `rcon-console.tsx`, preserved):** Enter submits (destructive → confirm first); ArrowUp/ArrowDown walk history; Tab accepts the first suggestion (`name + " "`); a suggestion click fills `name + " "`; `onBlur` closes suggestions after 150ms; empty command is a no-op.

- [ ] **Step 1: Write the failing test** — create `packages/web/test/terminal-pane.test.tsx`:

```tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SQUAD_COMMANDS, isDestructiveCommand } from "shared";
import { TerminalPane, type TerminalLine } from "@/components/terminal-pane";

function base(over: Record<string, unknown> = {}) {
  return {
    lines: [] as TerminalLine[],
    onSubmit: mock((_c: string) => {}),
    onClear: mock(() => {}),
    commands: SQUAD_COMMANDS,
    isDestructive: isDestructiveCommand,
    emptyHint: "Type a command and press Enter.",
    placeholder: "AdminBroadcast Hello",
    ...over,
  };
}

test("shows the empty hint, then echoes lines with output/error tones", () => {
  const { rerender } = render(<TerminalPane {...(base() as any)} />);
  expect(screen.getByText("Type a command and press Enter.")).toBeDefined();

  const lines: TerminalLine[] = [
    { id: 1, command: "ListPlayers", output: "2 players", success: true },
    { id: 2, command: "AdminKick x", output: "", success: false, error: "not found" },
  ];
  rerender(<TerminalPane {...(base({ lines }) as any)} />);
  expect(screen.getByText("2 players").className).toContain("text-text-secondary");
  expect(screen.getByText("not found").className).toContain("text-danger");
});

test("submitting a non-destructive command calls onSubmit and clears", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ListPlayers" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect((props.onSubmit as any)).toHaveBeenCalledWith("ListPlayers");
  expect(input.value).toBe("");
});

test("a destructive command routes through the AlertDialog confirm", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "AdminKick Bob spam" } });
  fireEvent.keyDown(input, { key: "Enter" });
  // not sent yet — confirm first
  expect((props.onSubmit as any)).not.toHaveBeenCalled();
  expect(screen.getByText(/about to run/i)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /run command/i }));
  expect((props.onSubmit as any)).toHaveBeenCalledWith("AdminKick Bob spam");
});

test("cancelling the confirm does not submit", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "AdminBan Bob 0 cheat" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect((props.onSubmit as any)).not.toHaveBeenCalled();
});

test("autocomplete lists first-token matches; Tab and click accept", async () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ListP" } });
  await waitFor(() => expect(screen.getByText("ListPlayers")).toBeDefined());
  fireEvent.click(screen.getByText("ListPlayers"));
  expect(input.value).toBe("ListPlayers ");
});

test("history walks with ArrowUp/ArrowDown", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ListPlayers" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.change(input, { target: { value: "ListSquads" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.value).toBe("ListSquads");
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.value).toBe("ListPlayers");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input.value).toBe("ListSquads");
});

test("Clear calls onClear", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: /clear/i }));
  expect((props.onClear as any)).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/terminal-pane.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** — create `packages/web/components/terminal-pane.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SquadCommand } from "shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface TerminalLine {
  id: number | string;
  command: string;
  output: string;
  success: boolean;
  error?: string;
}

/**
 * RCON terminal: mono scrollback, prompt input with up/down history + first-token
 * autocomplete (Command primitive), and a data-driven destructive-confirm via
 * AlertDialog. Presentational — data and side effects arrive via props.
 */
export function TerminalPane({
  lines,
  onSubmit,
  onClear,
  commands,
  isDestructive,
  status,
  actions,
  emptyHint = "Type a command and press Enter.",
  placeholder,
  className,
}: {
  lines: TerminalLine[];
  onSubmit: (command: string) => void;
  onClear: () => void;
  commands: SquadCommand[];
  isDestructive: (input: string) => boolean;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  emptyHint?: string;
  placeholder?: string;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showSuggest, setShowSuggest] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // happy-dom does not implement scrollTo; guard the optional call.
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const suggestions: SquadCommand[] = useMemo(() => {
    const first = input.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!first || input.includes(" ")) return [];
    return commands.filter((c) => c.name.toLowerCase().startsWith(first)).slice(0, 8);
  }, [input, commands]);

  function run(command: string) {
    onSubmit(command);
    setHistory((h) => [...h, command]);
    setHistIdx(-1);
    setInput("");
    setShowSuggest(false);
  }

  function submit(raw: string) {
    const command = raw.trim();
    if (!command) return;
    if (isDestructive(command)) {
      setPending(command);
      return;
    }
    run(command);
  }

  function acceptSuggestion(c: SquadCommand) {
    setInput(c.name + " ");
    setShowSuggest(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(history[next]);
      }
    } else if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      acceptSuggestion(suggestions[0]);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-sm border border-border bg-bg-secondary",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">{status}</div>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <EmptyState variant="hint" message={emptyHint} />
        ) : (
          lines.map((l) => (
            <div key={l.id} className="mb-2">
              <div className="text-accent">&gt; {l.command}</div>
              {l.success ? (
                <pre className="whitespace-pre-wrap break-words text-text-secondary">
                  {l.output || "(no output)"}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-danger">
                  {l.error || "Command failed"}
                </pre>
              )}
            </div>
          ))
        )}
      </div>

      <div className="relative border-t border-border p-2">
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1">
            <Command
              shouldFilter={false}
              className="max-h-56 overflow-y-auto border border-border bg-bg-tertiary"
            >
              <CommandList>
                <CommandGroup>
                  {suggestions.map((c) => (
                    <CommandItem
                      key={c.name}
                      value={c.name}
                      onSelect={() => acceptSuggestion(c)}
                      className="flex items-start justify-between gap-2 text-[11px]"
                    >
                      <span className="font-mono text-text-primary">
                        {c.name}{" "}
                        {c.args && <span className="text-text-muted">{c.args}</span>}
                        {c.destructive && <span className="ml-1 text-danger">&#9679;</span>}
                      </span>
                      <span className="ml-auto text-text-muted">{c.description}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggest(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          placeholder={placeholder}
          className="w-full rounded-sm border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
          autoFocus
          spellCheck={false}
        />
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run destructive command?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to run{" "}
              <span className="font-mono text-text-primary">{pending}</span>. This affects
              the live server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pending) run(pending);
                setPending(null);
              }}
            >
              Run command
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/terminal-pane.test.tsx`
Expected: PASS (7 tests).

If the AlertDialog content does not appear under happy-dom (the confirm tests fail to find "about to run"), STOP and report BLOCKED with the exact failure — do NOT silently swap AlertDialog for Dialog or delete the assertion. (See Global Constraints watch-item.)

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git add components/terminal-pane.tsx test/terminal-pane.test.tsx
git commit -m "feat(web): add TerminalPane RCON console composite"
```

---

## Task 6: Console rework (rcon-console + page)

**Files:**
- Modify: `packages/web/app/(protected)/live-server/console/components/rcon-console.tsx`
- Modify: `packages/web/app/(protected)/live-server/console/page.tsx`

**Interfaces:**
- Consumes: `TerminalPane`/`TerminalLine` (Task 5), `ConnectionStatus`/`ServerScope` (Task 3), `AccessDeniedCard` (Task 4), existing `useRconSocket` (unchanged), existing `LiveServerTabs` (unchanged), `SQUAD_COMMANDS`/`isDestructiveCommand` from `shared`.
- Produces: no new exports. This is composition — verified by `tsc` + dev smoke (the behavior lives in the Task 5 composite tests, mirroring how the whitelist `page.tsx` shell carried no direct unit test). NO new unit test file.

**Note:** `RconLine` (from `use-rcon-socket.ts`) is structurally assignable to `TerminalLine` (it has `id/command/output/success/error?` plus an extra `time`), so `lines={lines}` needs no mapping. `bg-green-500` disappears here (replaced by `ConnectionStatus tone="success"`).

- [ ] **Step 1: Replace `console/components/rcon-console.tsx` in full:**

```tsx
"use client";

import { SQUAD_COMMANDS, isDestructiveCommand } from "shared";
import { Button } from "@/components/ui/button";
import { TerminalPane } from "@/components/terminal-pane";
import { ConnectionStatus, ServerScope } from "@/components/connection-status";
import { useRconSocket } from "../../lib/use-rcon-socket";

export function RconConsole({ apiToken }: { apiToken: string | null }) {
  const {
    connected,
    lines,
    serverKeys,
    activeServer,
    switchServer,
    send,
    runListDisconnected,
    clear,
  } = useRconSocket(apiToken);

  return (
    <TerminalPane
      lines={lines}
      onSubmit={send}
      onClear={clear}
      commands={SQUAD_COMMANDS}
      isDestructive={isDestructiveCommand}
      className="h-[70vh]"
      placeholder="AdminBroadcast Hello world"
      emptyHint="Type an RCON command and press Enter. Up/Down for history, Tab to autocomplete."
      status={
        <>
          <ConnectionStatus
            tone={connected ? "success" : "danger"}
            label={
              connected
                ? `Connected${activeServer ? ` · ${activeServer}` : ""}`
                : "Disconnected"
            }
          />
          <ServerScope
            servers={serverKeys}
            active={activeServer}
            onSwitch={switchServer}
            variant="select"
          />
        </>
      }
      actions={
        <Button variant="outline" size="sm" onClick={runListDisconnected}>
          List Disconnected
        </Button>
      }
    />
  );
}
```

- [ ] **Step 2: Replace `console/page.tsx` in full** (tabs render ABOVE the gate; styled denial with a Monitor CTA when the user can view it):

```tsx
"use client";

import { usePermissions } from "@/lib/permission-context";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { LiveServerTabs } from "../components/live-server-tabs";
import { RconConsole } from "./components/rcon-console";

export default function RconConsolePage() {
  const { apiToken, hasPermission } = usePermissions();
  const canConsole = hasPermission("manage:rcon-console");
  const canMonitor =
    hasPermission("view:live-server") || hasPermission("manage:live-server");

  return (
    <div className="space-y-3">
      <LiveServerTabs active="console" canConsole={canConsole} />
      {canConsole ? (
        <RconConsole apiToken={apiToken} />
      ) : (
        <AccessDeniedCard
          message="You do not have access to the RCON console."
          cta={canMonitor ? { href: "/live-server", label: "Open Live Server Monitor" } : undefined}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types + no stray palette + smoke-build the module**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
bunx tsc --noEmit
git grep -nE '(blue|red|green|purple|emerald|orange|yellow)-[0-9]' -- "app/(protected)/live-server/console"
```
Expected: `tsc` clean; the grep returns NOTHING (the old `bg-green-500` is gone).

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `bun test`
Expected: all green, zero warnings.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git add "app/(protected)/live-server/console"
git commit -m "refactor(web): rebuild RCON console on TerminalPane with styled denial"
```

---

## Task 7: Monitor — composite adoption (ConnectionStatus, ServerScope, AreaSparkline)

**Files:**
- Modify: `packages/web/app/(protected)/live-server/page.tsx`
- Delete: `packages/web/app/(protected)/live-server/components/sparkline.tsx`

**Interfaces:**
- Consumes: `ConnectionStatus`/`ServerScope` (Task 3), `AreaSparkline` (Task 1).
- Produces: no new exports. Composition — verified by `tsc` + dev smoke.

All edits are exact string replacements in `page.tsx`. Preserve every state value and handler.

- [ ] **Step 1: Swap the imports.**

Remove:
```tsx
import { Sparkline } from "./components/sparkline";
```
Add (next to the other `@/components` imports near the top):
```tsx
import { AreaSparkline } from "@/components/sparkline";
import { ConnectionStatus, ServerScope } from "@/components/connection-status";
```

- [ ] **Step 2: Replace the header connection dot + label** (the block currently at ~lines 903–924).

Old:
```tsx
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full transition-all duration-150 ${
                connected && squadjsConnected
                  ? "bg-success"
                  : connected
                    ? "bg-warning"
                    : "bg-danger"
              } ${activity ? "scale-150 brightness-150" : ""}`}
            />
            <span className="text-xs text-text-muted">
              {connected && squadjsConnected
                ? "Connected"
                : connected && !squadjsConfigured
                  ? "SquadJS not configured (SQUADJS_SERVERS env var missing)"
                  : connected
                    ? "API connected, SquadJS disconnected"
                    : "Disconnected"}
            </span>
          </div>
        </div>
```
New:
```tsx
        <div className="flex items-center gap-3">
          <ConnectionStatus
            tone={connected && squadjsConnected ? "success" : connected ? "warning" : "danger"}
            active={activity}
            label={
              connected && squadjsConnected
                ? "Connected"
                : connected && !squadjsConfigured
                  ? "SquadJS not configured (SQUADJS_SERVERS env var missing)"
                  : connected
                    ? "API connected, SquadJS disconnected"
                    : "Disconnected"
            }
          />
        </div>
```

- [ ] **Step 3: Replace the server tab strip** (the block currently at ~lines 927–947).

Old:
```tsx
      {/* Server tabs */}
      {serverKeys.length > 1 && (
        <div className="mb-6 flex gap-1 border-b border-border">
          {serverKeys.map((key) => (
            <button
              key={key}
              onClick={() => switchServer(key)}
              className={`relative px-5 py-2.5 text-sm font-medium tracking-wide capitalize transition-colors ${
                activeServer === key
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {key}
              {activeServer === key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>
      )}
```
New:
```tsx
      {/* Server tabs */}
      <ServerScope
        servers={serverKeys}
        active={activeServer}
        onSwitch={switchServer}
        variant="tabs"
        className="mb-6"
      />
```

- [ ] **Step 4: Swap the three InfoCell sparklines** (~lines 975–1001). Replace each `<Sparkline .../>`:

Old → New (three separate edits):
```tsx
<Sparkline data={metricHistory.map((s) => s.playerCount)} color="var(--color-accent)" fixedMax={serverInfo.maxPlayers || 100} />
```
→
```tsx
<AreaSparkline values={metricHistory.map((s) => s.playerCount)} className="text-accent" fixedMax={serverInfo.maxPlayers || 100} />
```

```tsx
<Sparkline data={metricHistory.map((s) => s.publicQueue + s.reserveQueue)} color="var(--color-warning)" fixedMax={25} />
```
→
```tsx
<AreaSparkline values={metricHistory.map((s) => s.publicQueue + s.reserveQueue)} className="text-warning" fixedMax={25} />
```

```tsx
<Sparkline data={metricHistory.map((s) => s.tickRate ?? 0)} color="var(--color-success)" />
```
→
```tsx
<AreaSparkline values={metricHistory.map((s) => s.tickRate ?? 0)} className="text-success" />
```

- [ ] **Step 5: Delete the page-local sparkline and verify.**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git rm "app/(protected)/live-server/components/sparkline.tsx"
bunx tsc --noEmit
git grep -n "components/sparkline" -- "app/(protected)/live-server/page.tsx"
```
Expected: `tsc` clean; the grep finds NO local `./components/sparkline` import (only the `@/components/sparkline` line, which is fine — confirm it is the `@/` one).

- [ ] **Step 6: Run the full suite + commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
bun test
git add "app/(protected)/live-server/page.tsx" "app/(protected)/live-server/components/sparkline.tsx"
git commit -m "refactor(web): adopt ConnectionStatus/ServerScope/AreaSparkline in live-server monitor"
```
Expected: suite green, zero warnings.

---

## Task 8: Monitor — Modal → Dialog / AlertDialog, PlayerCard → Dialog, native confirm/prompt → dialogs

**Files:**
- Modify: `packages/web/app/(protected)/live-server/page.tsx`
- Modify: `packages/web/app/(protected)/live-server/components/player-card.tsx`

**Interfaces:** no new exports. Composition — verified by `tsc` + dev smoke + review. Behavior (payloads, open/close state, disabled logic) is preserved exactly.

**Recipe A — form Modal → Dialog** (used for Clan move, Randomize, Expanded panel, Warn, Kick, Ban, Switch squad). KEEP the inner body and the custom footer `<button>`s verbatim; swap ONLY the wrapper and heading:

```tsx
<Modal open={OPEN} onClose={CLOSE} className="CLS bg-bg-secondary p-6">
  <h3 className="font-display mb-4 text-base font-semibold tracking-wide">TITLE</h3>
  ...BODY (unchanged)...
</Modal>
```
becomes
```tsx
<Dialog open={OPEN} onOpenChange={(o) => { if (!o) { CLOSE_BODY } }}>
  <DialogContent className="CLS p-6">
    <DialogHeader>
      <DialogTitle className="font-display text-base font-semibold tracking-wide">TITLE</DialogTitle>
    </DialogHeader>
    ...BODY (unchanged)...
  </DialogContent>
</Dialog>
```
Notes: drop the heading's `mb-4` (the Dialog grid gap handles spacing); `bg-bg-secondary` is the `popover` token DialogContent already uses, so omit it; keep the `max-w-*`/size classes in `CLS`. `CLOSE_BODY` is the statement(s) from the original `onClose` (e.g. `setWarnTarget(null);` or `setClanMoveModalOpen(false); setClanMoveSelectedKey(null);`).

**Recipe B — confirm Modal / `window.confirm` → AlertDialog** (End Match, Restart Match, Change Layer Now): controlled `open`, standard destructive recipe.

- [ ] **Step 1: Swap imports.** Remove `import { Modal } from "@/components/modal";`. Add:
```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

- [ ] **Step 2: End Match — Modal → AlertDialog.** Replace the whole `{/* End Match confirmation */}` `<Modal>...</Modal>` block (~lines 1151–1173) with:

```tsx
      {/* End Match confirmation */}
      <AlertDialog open={endMatchConfirm} onOpenChange={setEndMatchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide">End Match</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end the current match? This will immediately end the
              game for all players.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleEndMatch}>
              End Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```
(`handleEndMatch` already calls `setEndMatchConfirm(false)` — leave it.)

- [ ] **Step 3: Restart Match — Modal → AlertDialog.** Replace the `{/* Restart Match confirmation */}` block (~lines 1175–1197) with:

```tsx
      {/* Restart Match confirmation */}
      <AlertDialog open={restartConfirm} onOpenChange={setRestartConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide">Restart Match</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restart the current match? This will reload the current
              layer and restart the round for all players.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRestartMatch}>
              Restart Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 4: Change Layer Now — `window.confirm` → AlertDialog.** This one needs a small state machine because the confirm currently sits inside `handleChangeLayerNow`.

  4a. Add state next to the other server-management state (near `const [changeLayerInput, setChangeLayerInput] = useState("");`):
```tsx
  const [changeLayerConfirm, setChangeLayerConfirm] = useState(false);
```
  4b. Replace `handleChangeLayerNow` (~lines 509–514):

Old:
```tsx
  function handleChangeLayerNow() {
    if (!changeLayerInput.trim()) return;
    if (!window.confirm(`Change the CURRENT layer to "${changeLayerInput.trim()}" now? This restarts the round.`)) return;
    sendAction({ action: "changelayer", message: changeLayerInput.trim() });
    setChangeLayerInput("");
  }
```
New:
```tsx
  function handleChangeLayerNow() {
    if (!changeLayerInput.trim()) return;
    setChangeLayerConfirm(true);
  }

  function confirmChangeLayerNow() {
    sendAction({ action: "changelayer", message: changeLayerInput.trim() });
    setChangeLayerInput("");
    setChangeLayerConfirm(false);
  }
```
  4c. Add the AlertDialog alongside the End/Restart ones (right after the Restart Match block from Step 3):
```tsx
      {/* Change Layer Now confirmation */}
      <AlertDialog open={changeLayerConfirm} onOpenChange={setChangeLayerConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide">Change Layer Now</AlertDialogTitle>
            <AlertDialogDescription>
              Change the CURRENT layer to{" "}
              <span className="font-mono text-text-primary">{changeLayerInput.trim()}</span> now?
              This restarts the round.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmChangeLayerNow}>
              Change Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 5: Clan move Modal → Dialog** (Recipe A). Change the wrapper of the `{/* Clan move modal */}` block (~line 1200):

Old opening:
```tsx
      <Modal open={clanMoveModalOpen} onClose={() => { setClanMoveModalOpen(false); setClanMoveSelectedKey(null); }} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Move Clan
        </h3>
```
New opening:
```tsx
      <Dialog open={clanMoveModalOpen} onOpenChange={(o) => { if (!o) { setClanMoveModalOpen(false); setClanMoveSelectedKey(null); } }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Move Clan</DialogTitle>
          </DialogHeader>
```
And the matching closing `</Modal>` (~line 1312) → `</DialogContent></Dialog>`. Leave everything between untouched (Task 9 handles its palette).

- [ ] **Step 6: Randomize Modal → Dialog** (Recipe A). Opening (~line 1315):

Old:
```tsx
      <Modal open={randomizeModalOpen} onClose={() => setRandomizeModalOpen(false)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Randomize Teams
        </h3>
```
New:
```tsx
      <Dialog open={randomizeModalOpen} onOpenChange={(o) => { if (!o) setRandomizeModalOpen(false); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Randomize Teams</DialogTitle>
          </DialogHeader>
```
Closing `</Modal>` (~line 1375) → `</DialogContent></Dialog>`.

- [ ] **Step 7: Expanded chat/console Modal → Dialog.** Opening (~line 1510):

Old:
```tsx
      <Modal
        open={expandedPanel !== null}
        onClose={() => setExpandedPanel(null)}
        className="max-w-6xl w-[90vw] h-[85vh] bg-bg-secondary p-0 flex flex-col"
      >
```
New:
```tsx
      <Dialog open={expandedPanel !== null} onOpenChange={(o) => { if (!o) setExpandedPanel(null); }}>
        <DialogContent className="flex h-[85vh] w-[90vw] max-w-6xl flex-col p-0">
```
Closing `</Modal>` (~line 1525) → `</DialogContent></Dialog>`. (Base UI Dialog needs a title for a11y — add a visually-hidden one as the first child inside `DialogContent`:)
```tsx
          <DialogTitle className="sr-only">{expandedPanel === "chat" ? "Chat" : "Console"}</DialogTitle>
```

- [ ] **Step 8: Warn Modal → Dialog** (Recipe A). Opening (~line 1528):

Old:
```tsx
      <Modal open={!!warnTarget} onClose={() => setWarnTarget(null)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Warn {warnTarget?.name}
        </h3>
```
New:
```tsx
      <Dialog open={!!warnTarget} onOpenChange={(o) => { if (!o) setWarnTarget(null); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Warn {warnTarget?.name}</DialogTitle>
          </DialogHeader>
```
Closing `</Modal>` (~line 1573) → `</DialogContent></Dialog>`.

- [ ] **Step 9: Kick Modal → Dialog** (Recipe A). Opening (~line 1576):

Old:
```tsx
      <Modal open={!!kickTarget} onClose={() => setKickTarget(null)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Kick {kickTarget?.name}
        </h3>
```
New:
```tsx
      <Dialog open={!!kickTarget} onOpenChange={(o) => { if (!o) setKickTarget(null); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Kick {kickTarget?.name}</DialogTitle>
          </DialogHeader>
```
Closing `</Modal>` (~line 1602) → `</DialogContent></Dialog>`.

- [ ] **Step 10: Ban Modal → Dialog** (Recipe A). Opening (~line 1605):

Old:
```tsx
      <Modal open={!!banTarget} onClose={() => setBanTarget(null)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Ban {banTarget?.name}
        </h3>
```
New:
```tsx
      <Dialog open={!!banTarget} onOpenChange={(o) => { if (!o) setBanTarget(null); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Ban {banTarget?.name}</DialogTitle>
          </DialogHeader>
```
Closing `</Modal>` (~line 1651) → `</DialogContent></Dialog>`.

- [ ] **Step 11: Switch squad Modal → Dialog** (Recipe A). Opening (~line 1654):

Old:
```tsx
      <Modal open={!!switchSquadTarget} onClose={() => setSwitchSquadTarget(null)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Switch Squad: {switchSquadTarget?.squadName}
        </h3>
```
New:
```tsx
      <Dialog open={!!switchSquadTarget} onOpenChange={(o) => { if (!o) setSwitchSquadTarget(null); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Switch Squad: {switchSquadTarget?.squadName}</DialogTitle>
          </DialogHeader>
```
Closing `</Modal>` (~line 1683) → `</DialogContent></Dialog>`.

- [ ] **Step 12: Test Warn `prompt()` → Dialog.** Dev-only. Replace the native prompt with a small input Dialog.

  12a. Add state (near the other admin-action state):
```tsx
  const [testWarnOpen, setTestWarnOpen] = useState(false);
  const [testWarnEosId, setTestWarnEosId] = useState("");
```
  12b. Replace `handleTestWarn` (~lines 546–550):

Old:
```tsx
  function handleTestWarn() {
    const eosId = prompt("Enter EOS ID to warn:");
    if (!eosId?.trim()) return;
    sendAction({ action: "testwarn", eosId: eosId.trim() });
  }
```
New:
```tsx
  function handleTestWarn() {
    setTestWarnEosId("");
    setTestWarnOpen(true);
  }

  function confirmTestWarn() {
    if (!testWarnEosId.trim()) return;
    sendAction({ action: "testwarn", eosId: testWarnEosId.trim() });
    setTestWarnOpen(false);
  }
```
  12c. Add the Dialog next to the other admin dialogs (e.g. after the Switch squad Dialog):
```tsx
      {/* Test Warn (developer) */}
      <Dialog open={testWarnOpen} onOpenChange={(o) => { if (!o) setTestWarnOpen(false); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Test Warn</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={testWarnEosId}
            onChange={(e) => setTestWarnEosId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmTestWarn(); }}
            placeholder="EOS ID to warn"
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => setTestWarnOpen(false)}
              className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={confirmTestWarn}
              disabled={!testWarnEosId.trim()}
              className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-40"
            >
              Send Test Warn
            </button>
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 13: PlayerCard overlay → Dialog.** Rewrite `components/player-card.tsx` — swap the hand-rolled `fixed inset-0` overlay for a controlled `Dialog`, keep everything inside. (The team-color `text-blue-400`/`text-red-400` stays for now; Task 9 tokenizes it.)

Replace the `return (...)` block (from `return (` through the final `);`) with:
```tsx
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xs bg-bg-secondary p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-sm font-semibold text-text-primary">{player.name}</DialogTitle>
              {typeof player.role === "string" && player.role.includes("_Cmd_") ? (
                <svg className="h-3 w-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                  <title>Commander</title>
                  <path d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              ) : player.isLeader ? (
                <svg className="h-3 w-3 text-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ) : null}
            </div>
            {player.role && (
              <span className="text-[10px] text-text-muted">{formatRole(player.role)}</span>
            )}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">x</button>
        </div>

        <div className="mb-3 space-y-1.5 rounded-sm border border-border/50 bg-bg-tertiary/50 p-2">
          {player.steamID && <CopyableField label="Steam ID" value={player.steamID} />}
          {player.eosID && <CopyableField label="EOS ID" value={player.eosID} />}
          {pt && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Playtime</span>
              <span className="text-xs text-text-secondary">{pt}</span>
            </div>
          )}
          {allTimeStats && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Playtime (30/90d)</span>
                <span className="text-xs text-text-secondary">{allTimeStats.playtime30}h / {allTimeStats.playtime90}h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Seed Time (30/90d)</span>
                <span className="text-xs text-text-secondary">{allTimeStats.seed30}h / {allTimeStats.seed90}h</span>
              </div>
            </>
          )}
          {player.squad && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Squad</span>
              <span className="text-xs text-text-secondary">
                {player.squad.squadName}
                {player.squad.creatorName && (
                  <span className="text-text-muted"> (by {player.squad.creatorName})</span>
                )}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">Team</span>
            <span className={`text-xs font-medium ${String(player.teamID) === "1" ? "text-blue-400" : String(player.teamID) === "2" ? "text-red-400" : "text-text-muted"}`}>
              Team {player.teamID}
            </span>
          </div>
        </div>

        {showActions && (
          <div className="flex gap-2">
            <button
              onClick={() => { onSwitchTeam(player); onClose(); }}
              className="flex-1 rounded-sm border border-accent/20 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
            >
              Switch Team
            </button>
            <button
              onClick={() => { onWarn(player); onClose(); }}
              className="flex-1 rounded-sm border border-warning/20 py-1.5 text-xs text-warning transition-colors hover:bg-warning/10"
            >
              Warn
            </button>
            <button
              onClick={() => { onKick(player); onClose(); }}
              className="flex-1 rounded-sm border border-danger/20 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10"
            >
              Kick
            </button>
            <button
              onClick={() => { onBan(player); onClose(); }}
              className="flex-1 rounded-sm border border-danger/40 py-1.5 text-xs text-danger transition-colors hover:bg-danger/20"
            >
              Ban
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
```
Then update `player-card.tsx` imports — add at the top (after the existing imports):
```tsx
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
```
(The component is always rendered mounted-when-selected by the parent, so `open` is always true; `onOpenChange`→`onClose` handles Escape/backdrop/X. `showCloseButton` defaults on — the extra corner X plus the existing inline `x` button both close; that is acceptable, or pass `showCloseButton={false}` to keep only the inline `x`. Pass `showCloseButton={false}` on `DialogContent` to avoid two close affordances.)

Apply that: make the `DialogContent` opening `<DialogContent showCloseButton={false} className="max-w-xs bg-bg-secondary p-4">`.

- [ ] **Step 14: Verify Modal is fully gone + types compile.**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git grep -n "components/modal\|<Modal\|window.confirm\|window.prompt\|prompt(" -- "app/(protected)/live-server"
bunx tsc --noEmit
```
Expected: the grep returns NOTHING (no `Modal`, no `window.confirm`, no `prompt(`); `tsc` clean.

- [ ] **Step 15: Run the full suite + commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
bun test
git add "app/(protected)/live-server/page.tsx" "app/(protected)/live-server/components/player-card.tsx"
git commit -m "refactor(web): migrate live-server monitor dialogs off legacy Modal"
```
Expected: suite green, zero warnings.

---

## Task 9: Monitor — raw palette → tokens

**Files:**
- Modify: `packages/web/app/(protected)/live-server/page.tsx`
- Modify: `packages/web/app/(protected)/live-server/components/player-card.tsx`

**Interfaces:** no exports. Token sweep only — every raw palette class becomes a design token. **Color mapping (deliberate; the user does a visual both-themes pass):**
- Team blue → `team-one`, team red → `team-two` (exact design-token equivalents).
- Clan-move "already on team" green → `success`.
- Console event types: `kill` red → `danger`; `wound` orange → `warning`; `revive` emerald → `success`; `squad` blue → `team-one`; `admincam` purple → `accent`; `teamchange` blue → `team-one` (with the same `/70` opacity suffixes).
- Randomize purple → `accent` (no purple token exists; Randomize joins the gold management actions). Test Warn yellow → `warning`.

- [ ] **Step 1: `consoleTypeColor` — tokenize the six raw cases** (~lines 566–588). Replace these lines:

```tsx
      case "kill": return "text-red-400";
```
→ `case "kill": return "text-danger";`
```tsx
      case "wound": return "text-orange-400/70";
```
→ `case "wound": return "text-warning/70";`
```tsx
      case "revive": return "text-emerald-400";
```
→ `case "revive": return "text-success";`
```tsx
      case "squad": return "text-blue-400";
```
→ `case "squad": return "text-team-one";`
```tsx
      case "admincam": return "text-purple-400";
```
→ `case "admincam": return "text-accent";`
```tsx
      case "teamchange": return "text-blue-400/70";
```
→ `case "teamchange": return "text-team-one/70";`

- [ ] **Step 2: Chat sender team color** (~lines 726–730). Replace:
```tsx
              const teamColor = String(player?.teamID) === "1"
                ? "text-blue-400"
                : String(player?.teamID) === "2"
                  ? "text-red-400"
                  : "text-text-secondary";
```
→
```tsx
              const teamColor = String(player?.teamID) === "1"
                ? "text-team-one"
                : String(player?.teamID) === "2"
                  ? "text-team-two"
                  : "text-text-secondary";
```

- [ ] **Step 3: Demote dropdown T1/T2 badge** (~line 1090). Replace:
```tsx
                        <span className={`font-medium ${team === "1" ? "text-blue-400" : "text-red-400"}`}>T{team}</span>
```
→
```tsx
                        <span className={`font-medium ${team === "1" ? "text-team-one" : "text-team-two"}`}>T{team}</span>
```

- [ ] **Step 4: Randomize button + mode chips + Run button** — tokenize purple → accent. Replace each occurrence:

  4a. The trigger button (~lines 1130–1135):
```tsx
                <button
                  onClick={() => setRandomizeModalOpen(true)}
                  className="rounded-sm border border-purple-500/30 bg-purple-500/5 px-3 py-1.5 text-xs font-medium text-purple-400 transition-colors hover:bg-purple-500/15"
                >
                  Randomize
                </button>
```
→
```tsx
                <button
                  onClick={() => setRandomizeModalOpen(true)}
                  className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                >
                  Randomize
                </button>
```
  4b. Both mode buttons in the Randomize dialog (~lines 1323–1344): each has
```tsx
                  ? "border-purple-500/40 bg-purple-500/10 text-purple-400"
```
→ `? "border-accent/40 bg-accent/10 text-accent"` (apply to BOTH the "All Players" and "By Squads" buttons — same string, replace all).
  4c. The Run button (~lines 1367–1373):
```tsx
            className="rounded-sm bg-purple-500 px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-purple-500/80"
```
→ `className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"`

- [ ] **Step 5: Test Warn button yellow → warning** (~lines 1140–1145):
```tsx
              className="rounded-sm border border-yellow-500/30 bg-yellow-500/5 px-3 py-1.5 text-xs font-medium text-yellow-400 transition-colors hover:bg-yellow-500/15"
```
→ `className="rounded-sm border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/15"`

- [ ] **Step 6: Clan-move target-team buttons + member badges + "already on team" block** (inside the Clan move Dialog).

  6a. Target-team active classes (~line 1215):
```tsx
                      ? t === "1" ? "border-blue-500/40 bg-blue-500/10 text-blue-400" : "border-red-500/40 bg-red-500/10 text-red-400"
```
→
```tsx
                      ? t === "1" ? "border-team-one/40 bg-team-one/10 text-team-one" : "border-team-two/40 bg-team-two/10 text-team-two"
```
  6b. "Will be moved" member team badge (~line 1261):
```tsx
                          <span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-blue-400" : "text-red-400"}`}>T{m.teamID}</span>
```
→
```tsx
                          <span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-team-one" : "text-team-two"}`}>T{m.teamID}</span>
```
  6c. "Already on Team" header + row + badge (~lines 1269–1274):
```tsx
                    <p className="mb-1 text-xs font-medium tracking-wide text-green-400 uppercase">Already on Team {clanMoveTargetTeam} ({alreadyOn.length})</p>
```
→ `<p className="mb-1 text-xs font-medium tracking-wide text-success uppercase">Already on Team {clanMoveTargetTeam} ({alreadyOn.length})</p>`
```tsx
                        <div key={m.steamId} className="flex items-center justify-between rounded-sm border border-green-500/20 bg-green-500/5 px-2.5 py-1">
```
→ `<div key={m.steamId} className="flex items-center justify-between rounded-sm border border-success/20 bg-success/5 px-2.5 py-1">`
```tsx
                          <span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-blue-400" : "text-red-400"}`}>T{m.teamID}</span>
```
→ `<span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-team-one" : "text-team-two"}`}>T{m.teamID}</span>`

- [ ] **Step 7: PlayerCard team label** (`components/player-card.tsx`, the Team row). Replace:
```tsx
            <span className={`text-xs font-medium ${String(player.teamID) === "1" ? "text-blue-400" : String(player.teamID) === "2" ? "text-red-400" : "text-text-muted"}`}>
```
→
```tsx
            <span className={`text-xs font-medium ${String(player.teamID) === "1" ? "text-team-one" : String(player.teamID) === "2" ? "text-team-two" : "text-text-muted"}`}>
```

- [ ] **Step 8: Grep-gate — zero raw palette in scope.**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
git grep -nE '(blue|red|green|purple|emerald|orange|yellow|pink|indigo|teal|cyan|slate)-[0-9]' -- "app/(protected)/live-server" components/terminal-pane.tsx components/connection-status.tsx components/access-denied-card.tsx
bunx tsc --noEmit
```
Expected: the grep returns NOTHING; `tsc` clean.

- [ ] **Step 9: Run the full suite + commit**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
bun test
git add "app/(protected)/live-server/page.tsx" "app/(protected)/live-server/components/player-card.tsx"
git commit -m "style(web): sweep live-server raw palette to design tokens"
```
Expected: suite green, zero warnings.

---

## Task 10: Design gallery section + version bump

**Files:**
- Modify: `packages/web/app/design/gallery.tsx`
- Modify: `package.json` (repo root)

**Interfaces:** none. Showcases the wave's composites; bumps the deploy version.

- [ ] **Step 1: Add imports** to the top import block of `gallery.tsx`:
```tsx
import { ConnectionStatus, ServerScope } from "@/components/connection-status";
import { TerminalPane, type TerminalLine } from "@/components/terminal-pane";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { AreaSparkline } from "@/components/sparkline";
import { SQUAD_COMMANDS, isDestructiveCommand } from "shared";
```
(If `Sparkline`/`MultiSparkline` are already imported from `@/components/sparkline`, extend that line to include `AreaSparkline` rather than adding a duplicate import.)

- [ ] **Step 2: Add a gallery section** just before the closing `</div>` of the `DesignGallery` return (a demo terminal with two lines + a couple of servers):
```tsx
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-wide text-text-primary">
          Live Server composites
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <ConnectionStatus tone="success" label="Connected" />
          <ConnectionStatus tone="warning" label="SquadJS disconnected" active />
          <ConnectionStatus tone="danger" label="Disconnected" />
          <ServerScope servers={["main", "battle"]} active="main" onSwitch={() => {}} variant="select" />
        </div>
        <ServerScope servers={["main", "battle"]} active="main" onSwitch={() => {}} variant="tabs" />
        <div className="relative h-10 w-40 overflow-hidden rounded-sm border border-border">
          <AreaSparkline values={[3, 8, 5, 12, 9, 16, 22]} className="text-accent" fixedMax={30} />
        </div>
        <TerminalPane
          className="h-64"
          commands={SQUAD_COMMANDS}
          isDestructive={isDestructiveCommand}
          onSubmit={() => {}}
          onClear={() => {}}
          placeholder="AdminBroadcast Hello"
          emptyHint="Type an RCON command and press Enter."
          lines={
            [
              { id: 1, command: "ListPlayers", output: "2 players online", success: true },
              { id: 2, command: "AdminKick 77 afk", output: "", success: false, error: "player not found" },
            ] as TerminalLine[]
          }
          status={<ConnectionStatus tone="success" label="Connected · main" />}
        />
        <AccessDeniedCard
          message="You do not have access to the RCON console."
          cta={{ href: "/live-server", label: "Open Live Server Monitor" }}
        />
      </section>
```

- [ ] **Step 3: Verify the gallery compiles + smoke it.**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
bunx tsc --noEmit
```
Expected: clean. (Dev smoke of `/design` happens in the wave-close smoke.)

- [ ] **Step 4: Bump the version.** In the repo-root `package.json`, change `"version": "2.9.0"` → `"version": "2.10.0"`.

- [ ] **Step 5: Full suite + tsc + commit.**

```bash
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment\packages\web"
bun test
bunx tsc --noEmit
cd "C:\Users\OleEd\Azure\RoyalBattalionWebpage\.claude\worktrees\gilded-regiment"
git add "packages/web/app/design/gallery.tsx" package.json
git commit -m "chore(web): gallery live-server composites and bump to 2.10.0"
```
Expected: suite green (zero warnings), `tsc` clean.

---

## Self-Review (completed by plan author)

**Spec coverage (§5 Live Server, §2 composites, §8 Phase 2):**
- Two-route tabbed group, Monitor + Console together — Tasks 6–9. ✅
- TerminalPane (mono scrollback, accent echo, danger failures, autoscroll, Clear, history, Command autocomplete with name/args/description + destructive markers, AlertDialog destructive confirm) — Task 5. ✅
- ConnectionStatus / ServerScope shared by Monitor + Console — Task 3, adopted Tasks 6 (select) + 7 (tabs). ✅
- AlertDialog destructive confirms replacing `window.confirm` — Tasks 5 (console), 8 (monitor End/Restart/ChangeLayer). ✅
- Styled permission-denied (was a bare red div) + tabs above the gate — Tasks 4 + 6. ✅
- Monitor Ban / Change-layer-now / Restart-match actions kept; legacy Modal → Dialog — Task 8. ✅
- `manage:rcon-console` sidebar gating — ALREADY done in nav-config (Phase 2a); no-op here, documented in Global Constraints. ✅
- Sparkline composite absorbs the page-local live-server copy — Tasks 1 + 7 (delete). ✅
- EmptyState mono hint variant (empty terminal scrollback) — Task 2. ✅
- `bg-green-500` token sweep + full raw-palette elimination in scope — Tasks 6 + 9 (grep-gate). ✅
- Semver minor bump — Task 10 (2.9.0 → 2.10.0). ✅

**Placeholder scan:** none — every code step carries complete code or an exact old→new string.

**Type consistency:** `AreaSparkline({ values, className, fixedMax })`, `ConnectionStatus({ tone, label, active })`, `ServerScope({ servers, active, onSwitch, variant })`, `TerminalPane({ lines, onSubmit, onClear, commands, isDestructive, status, actions, emptyHint, placeholder, className })`, `TerminalLine`, `AccessDeniedCard({ title?, message, cta? })`, `EmptyState({ ..., variant })` are used identically at every call site (console wrapper, monitor, gallery). `RconLine` → `TerminalLine` is structural (no mapping). Button variant `destructive`/`outline` and size `sm` exist in `buttonVariants`.

**Task right-sizing:** each task ends with an independently testable deliverable (a tested composite, or a compile-clean + smoke-clean page swap gated by a grep). Monitor page passes are split by concern (composite adoption / dialog migration / palette) so a reviewer can reject one without the others.

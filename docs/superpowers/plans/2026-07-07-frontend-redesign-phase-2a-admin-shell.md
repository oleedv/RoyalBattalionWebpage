# Frontend Redesign Phase 2a (Admin Shell + Carry-items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat protected-layout sidebar with the spec §3 grouped/collapsible shadcn shell (presence widget, NavBadge, branded shell states, rcon gating fix) and clear the four Phase 1 final-review carry-items.

**Architecture:** The 591-line `(protected)/layout.tsx` keeps ALL auth/sync machinery but sheds its hand-rolled chrome: presence WS moves to a `usePresence` hook, the avatar stack / roster / badge become reusable composites (`AvatarStack`, `RosterDialog`, `NavBadge`), and the Phase 0 `AppSidebar` (reconciled nav-config) + `SidebarProvider`/`SidebarInset` render the frame. Behavior is preserved exactly — same permissions, same data, same reconnect semantics — except the two sanctioned changes: Live Server nav additionally accepts `manage:rcon-console` (spec §5 gating alignment) and the Lobby API nav entry is removed (dead service; the page itself dies in Phase 3).

**Tech Stack:** Next.js 15 / React 19 (client layout), shadcn-on-Base-UI Sidebar + Dialog primitives (Phase 0), Tailwind v4 tokens, bun test + happy-dom + RTL.

## Global Constraints

- Work on `integration/gilded-regiment` in the worktree `.claude/worktrees/gilded-regiment`. Do NOT push (pushing `production` deploys Railway staging+prod).
- ALL test/typecheck commands run from `packages/web` (`bun test`, `bunx tsc --noEmit`). Running from the repo root breaks the happy-dom preload. `next build` is CI-only (known local Windows EPERM).
- Tokens only — this wave also RETIRES two raw-palette usages the spec's sweep names: `bg-green-500` presence dots → `bg-success`, `text-white` on the candidate badge → `text-destructive-foreground`.
- Custom CSS classes in globals.css must live inside the existing `@layer components` block (Tailwind v4 cascade rule discovered in Phase 1).
- Behavior preservation: auth sync (initial + 2-min refresh + retry + `RefreshTokenError` → `signIn("discord")`), candidate-count fetch gating, presence WS semantics (connect-once via ref, 5s reconnect, page-push on route change), permission any-match with `developer` bypass, full-screen `ACCOUNT_DISABLED` / `NOT_IN_GUILD` / Sync Failed states, main content padding `p-4 sm:p-6 md:p-8`.
- No new `Loading...` text anywhere (the shell's auth-sync state becomes branded per spec §3).
- Sidebar collapse persistence uses the shadcn built-in cookie (`sidebar_state`) — accepted mechanism for the spec's "state persisted per user (localStorage)" parenthetical; the intent is persistence, not the storage API. Do not build a parallel localStorage layer.
- `middleware.ts` is NOT touched this wave (spec §3 documents the coverage gap as a per-wave decision; page-level gating stays authoritative).
- Commits: conventional one-liners, no AI attribution. Commit after every task.
- Existing signatures that must not change: `PermissionProvider({ permissions, apiToken, user })` from `@/lib/permission-context`; `syncAuth(accessToken)`; `getWhitelistCandidates(token)`.

## Per-task verification (every task)

`bun test` green + `bunx tsc --noEmit` clean from `packages/web` before the commit step. The layout task additionally gets the manual smoke checklist in Task 10.

---

### Task 1: Consolidate the match-result variant mapper (carry-item)

**Files:**
- Modify: `packages/web/components/status-badge.tsx` (append export)
- Modify: `packages/web/components/public/hero-telemetry.tsx`
- Modify: `packages/web/app/(public)/landing-sections.tsx`
- Modify: `packages/web/app/(public)/matches/match-card.tsx`
- Test: `packages/web/test/status-badge.test.tsx` (append)

**Interfaces:**
- Produces: `matchResultVariant(result: string): StatusVariant` exported from `@/components/status-badge` — maps case-insensitively: `win`→`"match-win"`, `loss`→`"match-loss"`, anything else→`"match-draw"`. The three file-local `matchVariant`/`resultVariant` copies are deleted and their call sites import this.

- [ ] **Step 1: Write the failing test** (append to `packages/web/test/status-badge.test.tsx`)

```tsx
test("matchResultVariant maps results case-insensitively", () => {
  expect(matchResultVariant("WIN")).toBe("match-win");
  expect(matchResultVariant("loss")).toBe("match-loss");
  expect(matchResultVariant("DRAW")).toBe("match-draw");
  expect(matchResultVariant("unknown")).toBe("match-draw");
});
```

Also extend the file's import line to `import { StatusBadge, matchResultVariant } from "@/components/status-badge";` (match the existing import path style in the file).

- [ ] **Step 2: Run to verify failure** — from `packages/web`: `bun test test/status-badge.test.tsx` — Expected: FAIL (`matchResultVariant` is not exported).

- [ ] **Step 3: Implement** — append to `packages/web/components/status-badge.tsx` (after the `StatusBadge` component):

```tsx
/** Map a match result string to its StatusBadge variant. */
export function matchResultVariant(result: string): StatusVariant {
  const r = result.toLowerCase();
  if (r === "win") return "match-win";
  if (r === "loss") return "match-loss";
  return "match-draw";
}
```

- [ ] **Step 4: Rewire the three call sites.** In each file below, delete the file-local mapper function and its `type StatusVariant` import if it becomes unused; import and call `matchResultVariant` instead:
  1. `components/public/hero-telemetry.tsx`: delete the local `matchVariant` function; change the import to `import { StatusBadge, matchResultVariant } from "@/components/status-badge";`; the Last-Match tile becomes `<StatusBadge variant={matchResultVariant(lastMatch.result)} />`.
  2. `app/(public)/landing-sections.tsx`: delete the local `resultVariant`; adjust the import the same way; call site `<StatusBadge variant={matchResultVariant(m.result)} />`.
  3. `app/(public)/matches/match-card.tsx`: delete the local `resultVariant`; adjust the import; ALL its call sites switch to `matchResultVariant(...)` (summary fallback chip + two team chips + two expanded-detail chips).

- [ ] **Step 5: Verify green** — `bun test && bunx tsc --noEmit`. Also `grep -rn "function resultVariant\|function matchVariant" packages/web` must return nothing.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(web): consolidate match result variant mapping into status-badge"
```

---

### Task 2: Test-infra hygiene (carry-item)

**Files:**
- Modify: `packages/web/test/setup.ts`
- Modify: `packages/web/test/mocks/next-image.tsx`
- Modify: `packages/web/bunfig.toml`
- Modify: `packages/web/test/chart-tokens.test.ts`

**Interfaces:** none (test-only).

- [ ] **Step 1: Remove the dead sentinel.** In `packages/web/test/setup.ts` delete these two lines (and any comment attached only to them):

```ts
// @ts-ignore
window._isTestEnv = true;
```

- [ ] **Step 2: Try removing the redundant location.href override.** In `setup.ts`, delete the `Object.defineProperty(window.location, "href", ...)` block, then run the FULL suite (`bun test`). Expected: all green (the next-image mock short-circuits the URL machinery that needed it). **Contingency:** if any test fails with "Invalid URL", RESTORE the block exactly and add above it: `// Base URL for happy-dom URL construction (needed by tests without the next/image mock path).` — then note which test needed it in your report.

- [ ] **Step 3: Type the image mock.** In `packages/web/test/mocks/next-image.tsx`, replace the `[key: string]: any` props typing with `React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; fill?: boolean }` (destructure and drop `priority`/`fill` before spreading onto `<img>` so React doesn't warn about unknown DOM attributes — if the current mock already drops them, keep that behavior).

- [ ] **Step 4: Drop the no-op bunfig line.** In `packages/web/bunfig.toml`, delete the `root = "."` line under `[test]` (it is Bun's default). Keep the `[test.alias]` and preload entries untouched.

- [ ] **Step 5: Fix the chart-tokens act() warning.** Run `bun test test/chart-tokens.test.ts 2>&1` and capture the warning. The likely source is the MutationObserver callback firing `setTokens` after the test body finishes. Fix by unmounting before the test ends — in the third test (`useChartTokens re-reads...`), destructure `unmount` from `renderHook` and call `unmount();` as the last statement after the final assertion. Re-run: output must be pristine (no act() warning, no other noise). If the warning persists, diagnose from its stack and fix at the source (never by suppressing console output); document what you found.

- [ ] **Step 6: Verify green + pristine** — `bun test 2>&1` full: all pass AND zero warnings in output; `bunx tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore(web): test-infra hygiene - drop dead sentinel, type image mock, silence act warning"
```

---

### Task 3: Dead CSS + theme-reactive ember color (carry-item)

**Files:**
- Modify: `packages/web/app/globals.css` (delete `.diamond`)
- Modify: `packages/web/components/public/ember-hero.tsx`

**Interfaces:** none changed — `EmberHero` props stay `{ motes?, size?, className? }`.

- [ ] **Step 1: Verify `.diamond` is dead** — `grep -rn "diamond" packages/web --include="*.tsx"` must return nothing. Then delete the `.diamond { ... }` block from `globals.css` (it sits OUTSIDE the `@layer components` block, before it).

- [ ] **Step 2: Make the ember color theme-reactive.** In `packages/web/components/public/ember-hero.tsx`:
  1. Change the chart-tokens import to `import { useChartTokens } from "@/lib/chart-tokens";`
  2. At the top of the component body add:

```tsx
  const tokens = useChartTokens();
  const goldRef = useRef(tokens.series[1]);
  goldRef.current = tokens.series[1];
```

  3. Inside the effect, DELETE the line `const gold = getChartTokens().series[1];` and in the draw loop replace `ctx.fillStyle = gold;` with `ctx.fillStyle = goldRef.current;` (the ref keeps the effect's `[motes]` dependency list unchanged while frames always read the current theme color).

- [ ] **Step 3: Verify green** — `bun test test/ember-hero.test.tsx` (degrade-path test unaffected), full `bun test`, `bunx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(web): drop dead diamond css and make ember color theme-reactive"
```

---

### Task 4: Reconcile nav-config to the revised spec

**Files:**
- Modify: `packages/web/components/shell/nav-config.ts` (full replacement below)
- Test: `packages/web/test/nav-config.test.ts` (full replacement below)

**Interfaces:**
- Produces (consumed by Task 8): `DASHBOARD_ITEM: NavItem`, `NAV_GROUPS: NavGroup[]`, `filterNavGroups(permissions: string[]): NavGroup[]` — same names/signatures as today; CONTENT changes: Operations = Whitelist / Live Server (perms now include `"manage:rcon-console"`) / Tickets / Seeding (`/seeding`, perms `["view:seeding-tracker", "manage:discord-bot"]`) / Match Manager (label changed, same `/match-manager` href); System gains API Docs (`/api-docs`, `["developer"]`) and LOSES Lobby API. Community unchanged.

- [ ] **Step 1: Replace the test file** — `packages/web/test/nav-config.test.ts`:

```ts
import { test, expect } from "bun:test";
import { NAV_GROUPS, filterNavGroups } from "@/components/shell/nav-config";

const allItems = () => NAV_GROUPS.flatMap((g) => g.items);

test("nav groups cover the three sections", () => {
  expect(NAV_GROUPS.map((g) => g.label)).toEqual([
    "Operations",
    "Community",
    "System",
  ]);
});

test("spec reconciliation: seeding, match manager, api docs in; lobby out", () => {
  const byHref = Object.fromEntries(allItems().map((i) => [i.href, i]));
  expect(byHref["/seeding"].label).toBe("Seeding");
  expect(byHref["/seeding-tracker"]).toBeUndefined();
  expect(byHref["/match-manager"].label).toBe("Match Manager");
  expect(byHref["/api-docs"].requiredPermissions).toEqual(["developer"]);
  expect(byHref["/lobby-monitor"]).toBeUndefined();
});

test("standalone manage:rcon-console reaches Live Server", () => {
  const groups = filterNavGroups(["manage:rcon-console"]);
  const hrefs = groups.flatMap((g) => g.items).map((i) => i.href);
  expect(hrefs).toContain("/live-server");
});

test("seeding visible to view:seeding-tracker and to manage:discord-bot", () => {
  for (const perm of ["view:seeding-tracker", "manage:discord-bot"]) {
    const hrefs = filterNavGroups([perm])
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(hrefs).toContain("/seeding");
  }
});

test("a single matching permission reveals its item via any-match", () => {
  const groups = filterNavGroups(["view:whitelist"]);
  const hrefs = groups.flatMap((g) => g.items).map((i) => i.href);
  expect(hrefs).toContain("/whitelist");
  expect(hrefs).not.toContain("/roles");
});

test("developer sees every item", () => {
  const groups = filterNavGroups(["developer"]);
  expect(groups.flatMap((g) => g.items).length).toBe(allItems().length);
});

test("no permissions hides all gated groups", () => {
  expect(filterNavGroups([])).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/nav-config.test.ts` — Expected: the reconciliation tests FAIL against the stale config (`/seeding-tracker` present, no `/seeding`, no `/api-docs`, Lobby present, rcon perm missing).

- [ ] **Step 3: Replace nav-config.ts** with:

```ts
import {
  LayoutDashboard,
  ShieldCheck,
  Radio,
  Ticket,
  Sprout,
  Swords,
  Users,
  MessageSquare,
  Bot,
  Cog,
  KeyRound,
  ScrollText,
  FileCode2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Any-match grants access; "developer" bypasses all. Undefined = all authed users. */
  requiredPermissions?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const DASHBOARD_ITEM: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: LayoutDashboard,
};

// Reconciled against the 2026-07-05 spec §3 and app/(protected)/layout.tsx perms.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      {
        label: "Whitelist",
        href: "/whitelist",
        icon: ShieldCheck,
        requiredPermissions: ["view:whitelist", "manage:whitelist"],
      },
      {
        label: "Live Server",
        href: "/live-server",
        icon: Radio,
        // manage:rcon-console is standalone-sufficient (spec §5 gating alignment):
        // the API admits such users to the console WS, so they need a nav path.
        requiredPermissions: [
          "view:live-server",
          "manage:live-server",
          "manage:rcon-console",
        ],
      },
      {
        label: "Tickets",
        href: "/tickets",
        icon: Ticket,
        requiredPermissions: [
          "view:tickets",
          "manage:tickets",
          "view:tickets:normal",
          "view:tickets:community_officer",
          "view:tickets:admin_officer",
          "view:tickets:comp_team",
          "view:tickets:whitelist",
        ],
      },
      {
        label: "Seeding",
        href: "/seeding",
        icon: Sprout,
        requiredPermissions: ["view:seeding-tracker", "manage:discord-bot"],
      },
      {
        label: "Match Manager",
        href: "/match-manager",
        icon: Swords,
        requiredPermissions: ["manage:matches"],
      },
    ],
  },
  {
    label: "Community",
    items: [
      {
        label: "Members",
        href: "/members",
        icon: Users,
        requiredPermissions: ["view:members", "manage:members"],
      },
      {
        label: "Discord Users",
        href: "/discord-users",
        icon: MessageSquare,
        requiredPermissions: ["view:members", "manage:members"],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Discord Bot",
        href: "/discord-bot",
        icon: Bot,
        requiredPermissions: ["view:discord-bot", "manage:discord-bot"],
      },
      {
        label: "SquadJS Config",
        href: "/squadjs-config",
        icon: Cog,
        requiredPermissions: ["view:squadjs", "manage:squadjs"],
      },
      {
        label: "Roles",
        href: "/roles",
        icon: KeyRound,
        requiredPermissions: ["manage:roles"],
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: ScrollText,
        requiredPermissions: ["view:audit-logs"],
      },
      {
        label: "API Docs",
        href: "/api-docs",
        icon: FileCode2,
        requiredPermissions: ["developer"],
      },
    ],
  },
];

export function filterNavGroups(permissions: string[]): NavGroup[] {
  const isDev = permissions.includes("developer");
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        !item.requiredPermissions ||
        isDev ||
        item.requiredPermissions.some((p) => permissions.includes(p)),
    ),
  })).filter((group) => group.items.length > 0);
}
```

- [ ] **Step 4: Verify green** — `bun test test/nav-config.test.ts` then full `bun test && bunx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): reconcile nav-config to revised spec with rcon gating fix"
```

---

### Task 5: NavBadge composite

**Files:**
- Create: `packages/web/components/nav-badge.tsx`
- Test: `packages/web/test/nav-badge.test.tsx`

**Interfaces:**
- Produces: `NavBadge({ count }: { count: number })` — renders `null` when `count <= 0`; otherwise a danger count pill (mono digits, `99+` cap) that hides on the collapsed icon rail, plus an `aria-hidden` danger dot that only shows on the collapsed rail (`group-data-[collapsible=icon]` variants — the shadcn Sidebar sets that group attribute). Rendered INSIDE a `SidebarMenuButton`'s link child; the surrounding `SidebarMenuItem` is `relative`, anchoring the dot.

- [ ] **Step 1: Write the failing test** — `packages/web/test/nav-badge.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { NavBadge } from "@/components/nav-badge";

test("renders nothing for zero", () => {
  const { container } = render(<NavBadge count={0} />);
  expect(container.innerHTML).toBe("");
});

test("renders danger pill with mono count and rail dot", () => {
  const { container } = render(<NavBadge count={7} />);
  const pill = container.querySelector('[data-slot="nav-badge-count"]')!;
  expect(pill.textContent).toBe("7");
  expect(pill.className).toContain("bg-danger");
  expect(pill.className).toContain("font-mono");
  const dot = container.querySelector('[data-slot="nav-badge-dot"]')!;
  expect(dot.getAttribute("aria-hidden")).toBe("true");
});

test("caps display at 99+", () => {
  const { container } = render(<NavBadge count={130} />);
  expect(
    container.querySelector('[data-slot="nav-badge-count"]')!.textContent,
  ).toBe("99+");
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/nav-badge.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/components/nav-badge.tsx`:

```tsx
/** Count pill for a sidebar nav item (danger tone). On the collapsed icon
 * rail the pill hides and a small dot on the item shows instead. */
export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      <span
        data-slot="nav-badge-count"
        className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold leading-none text-destructive-foreground group-data-[collapsible=icon]:hidden"
      >
        {count > 99 ? "99+" : count}
      </span>
      <span
        data-slot="nav-badge-dot"
        aria-hidden="true"
        className="absolute right-1 top-1 hidden size-1.5 rounded-full bg-danger group-data-[collapsible=icon]:block"
      />
    </>
  );
}
```

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add NavBadge composite with collapsed-rail dot"
```

---

### Task 6: AvatarStack composite

**Files:**
- Create: `packages/web/components/avatar-stack.tsx`
- Test: `packages/web/test/avatar-stack.test.tsx`

**Interfaces:**
- Produces:

```ts
export type AvatarStackUser = {
  id: string;
  name: string;           // display-name-first (caller resolves)
  secondary?: string;     // e.g. @username
  meta?: string;          // e.g. current page
  avatarUrl?: string | null;
};
export function AvatarStack(props: {
  users: AvatarStackUser[];
  cap?: number;           // default 15
  onClick?: () => void;
  label?: string;         // aria-label for the button
}): JSX.Element;
```

Overlapping 24px avatars (−6px margin, descending z-index), initial-letter fallback on `bg-accent/20 text-accent`, `bg-success` presence dot (tokens — replaces the old raw `bg-green-500`), `+N` overflow chip past `cap`, rich hover tooltip per avatar (name / secondary / meta) using the CSS `group` pattern (shipped behavior, not the ui Tooltip — 15 portal tooltips would be heavy).

- [ ] **Step 1: Write the failing test** — `packages/web/test/avatar-stack.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvatarStack, type AvatarStackUser } from "@/components/avatar-stack";

const mkUsers = (n: number): AvatarStackUser[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `u${i}`,
    name: `User ${i}`,
    secondary: `@user${i}`,
    meta: "Dashboard",
    avatarUrl: null,
  }));

test("caps avatars and shows overflow chip", () => {
  const { container } = render(<AvatarStack users={mkUsers(18)} cap={15} />);
  expect(
    container.querySelectorAll('[data-slot="avatar-stack-item"]'),
  ).toHaveLength(15);
  expect(screen.getByText("+3")).toBeDefined();
});

test("initial fallback and tokenized presence dot", () => {
  const { container } = render(
    <AvatarStack users={[{ id: "a", name: "brick", avatarUrl: null }]} />,
  );
  expect(screen.getByText("B")).toBeDefined();
  const dot = container.querySelector('[data-slot="presence-dot"]')!;
  expect(dot.className).toContain("bg-success");
  expect(container.innerHTML).not.toContain("green-500");
});

test("click fires and button carries the label", () => {
  let clicks = 0;
  render(
    <AvatarStack
      users={mkUsers(2)}
      onClick={() => clicks++}
      label="View 2 online users"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "View 2 online users" }));
  expect(clicks).toBe(1);
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/avatar-stack.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/components/avatar-stack.tsx`:

```tsx
"use client";

export type AvatarStackUser = {
  id: string;
  name: string;
  secondary?: string;
  meta?: string;
  avatarUrl?: string | null;
};

/** Overlapping presence avatars with cap + "+N" overflow chip and a rich
 * hover tooltip per avatar. Decorative dots are tokenized (bg-success). */
export function AvatarStack({
  users,
  cap = 15,
  onClick,
  label,
}: {
  users: AvatarStackUser[];
  cap?: number;
  onClick?: () => void;
  label?: string;
}) {
  const shown = users.slice(0, cap);
  const overflow = users.length - shown.length;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? `View ${users.length} online users`}
      className="flex items-center"
    >
      {shown.map((u, i) => (
        <div
          key={u.id}
          data-slot="avatar-stack-item"
          className="group relative"
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: shown.length - i }}
        >
          {u.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={u.avatarUrl}
              alt={u.name}
              className="h-6 w-6 rounded-full object-cover ring-2 ring-bg-secondary"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent ring-2 ring-bg-secondary">
              {u.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span
            data-slot="presence-dot"
            aria-hidden="true"
            className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-success ring-1 ring-bg-secondary"
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-bg-primary px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
            <div className="font-medium text-text-primary">{u.name}</div>
            {u.secondary && (
              <div className="text-text-muted">{u.secondary}</div>
            )}
            {u.meta && <div className="text-text-muted">{u.meta}</div>}
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-tertiary font-mono text-[9px] font-bold text-text-muted ring-2 ring-bg-secondary"
          style={{ marginLeft: -6, zIndex: 0 }}
        >
          +{overflow}
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add AvatarStack composite with tokenized presence dots"
```

---

### Task 7: RosterDialog composite

**Files:**
- Create: `packages/web/components/roster-dialog.tsx`
- Test: `packages/web/test/roster-dialog.test.tsx`

**Interfaces:**
- Produces:

```ts
export type RosterRow = {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
  avatarUrl?: string | null;
};
export function RosterDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;          // e.g. "Online"
  rows: RosterRow[];
}): JSX.Element;
```

Dialog (Phase 0 ui/dialog, portals to body — replaces the layout's `Modal` usage) with header `"{title} ({rows.length})"`, scrollable divided row list: avatar-or-initial + `bg-success` dot, primary/secondary stacked, right-aligned mono meta.

- [ ] **Step 1: Write the failing test** — `packages/web/test/roster-dialog.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { RosterDialog } from "@/components/roster-dialog";

const rows = [
  { id: "1", primary: "Brick", secondary: "@brick", meta: "Dashboard", avatarUrl: null },
  { id: "2", primary: "Aldo", meta: "Whitelist", avatarUrl: null },
];

test("renders count header and rows when open", () => {
  render(
    <RosterDialog open onOpenChange={() => {}} title="Online" rows={rows} />,
  );
  expect(screen.getByText("Online (2)")).toBeDefined();
  expect(screen.getByText("Brick")).toBeDefined();
  expect(screen.getByText("@brick")).toBeDefined();
  expect(screen.getByText("Whitelist")).toBeDefined();
  expect(screen.getByText("A")).toBeDefined(); // Aldo initial fallback
});

test("renders nothing when closed", () => {
  render(
    <RosterDialog
      open={false}
      onOpenChange={() => {}}
      title="Online"
      rows={rows}
    />,
  );
  expect(screen.queryByText("Online (2)")).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/roster-dialog.test.tsx` — Expected: FAIL (module missing). (If instead the Base UI Dialog portal errors in happy-dom once implemented, report DONE_WITH_CONCERNS with the exact error rather than stubbing the Dialog.)

- [ ] **Step 3: Implement** — `packages/web/components/roster-dialog.tsx`:

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RosterRow = {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
  avatarUrl?: string | null;
};

/** Scrollable people list in a Dialog with a count header (who's-online). */
export function RosterDialog({
  open,
  onOpenChange,
  title,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: RosterRow[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-sm font-semibold tracking-wide">
            {title} ({rows.length})
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y divide-border/40 overflow-y-auto">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="relative shrink-0">
                {row.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={row.avatarUrl}
                    alt={row.primary}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                    {row.primary.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success ring-2 ring-bg-card"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">
                  {row.primary}
                </div>
                {row.secondary && (
                  <div className="truncate text-xs text-text-muted">
                    {row.secondary}
                  </div>
                )}
              </div>
              {row.meta && (
                <div className="shrink-0 font-mono text-xs text-text-muted">
                  {row.meta}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

If `DialogHeader`/`DialogTitle` export names differ in `components/ui/dialog.tsx`, read that file and use its actual exports (Base UI scaffold) — keep the rendered text `"{title} ({rows.length})"` exactly.

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add RosterDialog composite on the design-system dialog"
```

---

### Task 8: usePresence hook extraction

**Files:**
- Create: `packages/web/hooks/use-presence.ts`
- Test: `packages/web/test/use-presence.test.ts` (formatPageName only)

**Interfaces:**
- Produces:

```ts
export type PresenceUser = {
  userId: string;
  userName: string;
  displayName: string | null;
  avatarUrl: string | null;
  currentPage: string;
};
export function usePresence(apiToken: string | null, pathname: string): PresenceUser[];
export function formatPageName(path: string): string;
```

This is a VERBATIM MOVE of the presence logic currently in `app/(protected)/layout.tsx`: the `onlineUsers` state, the connect-once WS effect (token read via ref on reconnect, `auth-${token}` subprotocol, `?page=` query, 5s reconnect, cancel/cleanup), the page-push effect, and the `formatPageName` helper. No behavior edits — the WS URL derivation (`NEXT_PUBLIC_API_URL` → `ws`), the `hasConnectedPresence` ref semantics, and the eslint-disable comment move as-is. Internal refs (`apiTokenRef`) come along since the hook now owns them.

- [ ] **Step 1: Write the failing test** — `packages/web/test/use-presence.test.ts`:

```ts
import { test, expect } from "bun:test";
import { formatPageName } from "@/hooks/use-presence";

test("formats route paths into page names", () => {
  expect(formatPageName("/discord-users")).toBe("Discord Users");
  expect(formatPageName("/live-server/console")).toBe("Live Server Console");
  expect(formatPageName("/")).toBe("Dashboard");
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/use-presence.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/hooks/use-presence.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";

export type PresenceUser = {
  userId: string;
  userName: string;
  displayName: string | null;
  avatarUrl: string | null;
  currentPage: string;
};

export function formatPageName(path: string): string {
  const name = path.replace(/^\//, "") || "dashboard";
  return name
    .split(/[-/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Presence roster over the /presence/ws WebSocket. Connects once when the
 * first token arrives (token re-read from a ref on reconnect), reconnects
 * after 5s on close, and pushes the current page on route changes. */
export function usePresence(
  apiToken: string | null,
  pathname: string,
): PresenceUser[] {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const presenceWsRef = useRef<WebSocket | null>(null);
  const apiTokenRef = useRef(apiToken);
  apiTokenRef.current = apiToken;
  const hasConnectedPresence = useRef(false);

  useEffect(() => {
    if (!apiToken || hasConnectedPresence.current) return;
    hasConnectedPresence.current = true;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;
      const token = apiTokenRef.current;
      if (!token) return;
      const wsBase = (
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      ).replace(/^http/, "ws");
      const ws = new WebSocket(
        `${wsBase}/presence/ws?page=${encodeURIComponent(pathname)}`,
        [`auth-${token}`],
      );
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "presence") {
            setOnlineUsers(msg.users);
          }
        } catch {}
      };
      ws.onclose = () => {
        presenceWsRef.current = null;
        if (!cancelled) reconnectTimer = setTimeout(connect, 5000);
      };
      presenceWsRef.current = ws;
    }

    connect();
    return () => {
      cancelled = true;
      hasConnectedPresence.current = false;
      clearTimeout(reconnectTimer);
      const ws = presenceWsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
        presenceWsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiToken]);

  useEffect(() => {
    const ws = presenceWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ page: pathname }));
    }
  }, [pathname]);

  return onlineUsers;
}
```

Do NOT rewire the layout yet — that happens in Task 10. This task only adds the hook (the temporary duplication lives for two tasks).

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): extract usePresence hook from the protected layout"
```

---

### Task 9: AppSidebar v2 — badges, presence, user footer

**Files:**
- Modify: `packages/web/components/shell/app-sidebar.tsx` (full replacement below)

**Interfaces:**
- Consumes: `filterNavGroups`/`DASHBOARD_ITEM` (Task 4), `NavBadge` (Task 5), `AvatarStack` (Task 6), `RosterDialog` (Task 7), `PresenceUser`/`formatPageName` (Task 8), ui sidebar primitives.
- Produces (consumed by Task 10):

```ts
export function AppSidebar(props: {
  permissions: string[];
  badges?: Record<string, number>;   // href -> count, e.g. { "/whitelist": 3 }
  onlineUsers?: PresenceUser[];
  userName: string;
}): JSX.Element;
```

Anatomy per spec §3: header lion+wordmark; Dashboard pinned above groups; grouped nav with icons + NavBadge per `badges[href]`; presence block above the user footer (hidden when nobody online; expanded → "ONLINE (N)" label + AvatarStack; collapsed rail → users-icon count button with tooltip "N online"; both open one RosterDialog); footer user area = display name + Settings + Sign out (icon buttons with tooltips so the rail stays usable); `[` shortcut kept; mobile Sheet auto-closes on route change.

- [ ] **Step 1: Replace `packages/web/components/shell/app-sidebar.tsx`** with:

```tsx
"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { DASHBOARD_ITEM, filterNavGroups } from "@/components/shell/nav-config";
import { NavBadge } from "@/components/nav-badge";
import { AvatarStack } from "@/components/avatar-stack";
import { RosterDialog } from "@/components/roster-dialog";
import { formatPageName, type PresenceUser } from "@/hooks/use-presence";

const ACTIVE_CLASS =
  "data-active:bg-accent/10 data-active:text-accent-bright data-active:shadow-[inset_2px_0_0_var(--color-accent)]";

/** Adds `[` as a sidebar-collapse shortcut, alongside the built-in Cmd/Ctrl+B. */
function BracketShortcut() {
  const { toggleSidebar } = useSidebar();
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]"))
        return;
      e.preventDefault();
      toggleSidebar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  return null;
}

/** Closes the mobile sheet whenever the route changes (parity with the old
 * drawer's close-on-navigation effect). */
function MobileAutoClose() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  React.useEffect(() => {
    if (isMobile) setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PresenceBlock({ onlineUsers }: { onlineUsers: PresenceUser[] }) {
  const [open, setOpen] = React.useState(false);
  if (onlineUsers.length === 0) return null;

  const stackUsers = onlineUsers.map((u) => ({
    id: u.userId,
    name: u.displayName || u.userName,
    secondary: u.displayName ? `@${u.userName}` : undefined,
    meta: formatPageName(u.currentPage),
    avatarUrl: u.avatarUrl,
  }));

  return (
    <div className="border-t border-sidebar-border px-2 py-2">
      {/* Expanded: label + avatar stack */}
      <div className="group-data-[collapsible=icon]:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-1.5 block px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          Online ({onlineUsers.length})
        </button>
        <div className="px-2">
          <AvatarStack
            users={stackUsers}
            onClick={() => setOpen(true)}
            label={`View ${onlineUsers.length} online ${onlineUsers.length === 1 ? "user" : "users"}`}
          />
        </div>
      </div>
      {/* Collapsed rail: compact count button */}
      <div className="hidden group-data-[collapsible=icon]:block">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`${onlineUsers.length} online`}
              onClick={() => setOpen(true)}
            >
              <Users />
              <span>{onlineUsers.length} online</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
      <RosterDialog
        open={open}
        onOpenChange={setOpen}
        title="Online"
        rows={stackUsers.map((u) => ({
          id: u.id,
          primary: u.name,
          secondary: u.secondary,
          meta: u.meta,
          avatarUrl: u.avatarUrl,
        }))}
      />
    </div>
  );
}

export function AppSidebar({
  permissions,
  badges = {},
  onlineUsers = [],
  userName,
}: {
  permissions: string[];
  badges?: Record<string, number>;
  onlineUsers?: PresenceUser[];
  userName: string;
}) {
  const pathname = usePathname();
  const groups = filterNavGroups(permissions);

  return (
    <Sidebar collapsible="icon">
      <BracketShortcut />
      <MobileAutoClose />
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 px-1 py-1">
          <Image
            src="/img/rb_newlion2024_4_RS.png"
            alt="Royal Battalion"
            width={24}
            height={24}
            className="shrink-0"
          />
          <span className="truncate font-display text-[11px] font-bold tracking-[0.16em] text-accent group-data-[collapsible=icon]:hidden">
            ROYAL BATTALION
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isActiveHref(pathname, DASHBOARD_ITEM.href)}
                  tooltip={DASHBOARD_ITEM.label}
                  className={ACTIVE_CLASS}
                  render={
                    <Link href={DASHBOARD_ITEM.href}>
                      <DASHBOARD_ITEM.icon />
                      <span>{DASHBOARD_ITEM.label}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[9px] tracking-[0.26em]">
              {group.label.toUpperCase()}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActiveHref(pathname, item.href)}
                      tooltip={item.label}
                      className={ACTIVE_CLASS}
                      render={
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                          <NavBadge count={badges[item.href] ?? 0} />
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-0">
        <PresenceBlock onlineUsers={onlineUsers} />
        <div className="px-2 pb-2 pt-1">
          <div className="truncate px-2 pb-1 text-sm text-text-secondary group-data-[collapsible=icon]:hidden">
            {userName}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings"
                render={
                  <Link href="/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sign out"
                className="hover:text-danger"
                render={
                  <Link href="/signout">
                    <LogOut />
                    <span>Sign out</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
```

- [ ] **Step 2: Verify green** — `bun test && bunx tsc --noEmit`. (No new unit test: this file is pure composition of the tested pieces; the /design gallery + Task 10 smoke cover integration. If tsc flags `SidebarMenuButton` prop mismatches — e.g. `onClick` or `render` typing — adapt to the actual `ui/sidebar.tsx` signatures and note it.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(web): AppSidebar v2 with nav badges, presence widget and user footer"
```

---

### Task 10: Protected layout swap

**Files:**
- Modify: `packages/web/app/(protected)/layout.tsx` (full replacement below)

**Interfaces:**
- Consumes: `AppSidebar` (Task 9), `usePresence` (Task 8), `SidebarProvider`/`SidebarInset`/`SidebarTrigger` from ui/sidebar, `Skeleton` from `@/components/skeleton`.
- Preserves byte-for-byte semantics: syncAuth flow, 2-min token refresh, retry/candidate/permission logic, `PermissionProvider` contract, ACCOUNT_DISABLED / NOT_IN_GUILD / Sync Failed copy.
- The layout's `Modal` usage disappears (presence roster now lives inside AppSidebar); `components/modal.tsx` STAYS (4 page consumers migrate in later waves).

- [ ] **Step 1: Replace `packages/web/app/(protected)/layout.tsx`** with:

```tsx
"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Permission, UserWithRoles } from "shared";
import { syncAuth, getWhitelistCandidates } from "@/lib/api-client";
import { PermissionProvider } from "@/lib/permission-context";
import { usePresence } from "@/hooks/use-presence";
import { AppSidebar } from "@/components/shell/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/skeleton";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserWithRoles | null>(null);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [candidateCount, setCandidateCount] = useState(0);
  const onlineUsers = usePresence(apiToken, pathname);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
    // If the Discord refresh token has expired, force a fresh login
    if (session?.error === "RefreshTokenError") {
      signIn("discord");
    }
  }, [status, session?.error, router]);

  useEffect(() => {
    async function init() {
      if (!session?.accessToken || session?.error) return;
      try {
        const res = await syncAuth(session.accessToken);
        if (res.success && res.data) {
          setApiToken(res.data.token);
          setPermissions(res.data.permissions);
          setUser(res.data.user);
          // Fetch whitelist candidate count for nav badge
          const perms = res.data.permissions;
          if (perms.includes("developer") || perms.includes("manage:whitelist")) {
            // Count candidates across all servers (no server filter)
            getWhitelistCandidates(res.data.token).then((r) => {
              if (r.success && r.data) setCandidateCount(r.data.length);
            }).catch(() => {});
          }
        } else if (!res.success) {
          if (res.error === "ACCOUNT_DISABLED" || res.error === "NOT_IN_GUILD") {
            setSyncError(res.error);
          } else {
            setSyncError(res.error || "Failed to sync");
          }
        }
      } catch {
        setSyncError("Failed to sync");
      } finally {
        setSynced(true);
      }
    }
    init();
  }, [session, retryCount]);

  // Periodically re-sync to keep the API token fresh (expires after 4h)
  useEffect(() => {
    if (!apiToken || !session?.accessToken || session?.error) return;
    const interval = setInterval(async () => {
      try {
        const res = await syncAuth(session.accessToken!);
        if (res.success && res.data) {
          setApiToken(res.data.token);
          setPermissions(res.data.permissions);
          setUser(res.data.user);
        } else if (!res.success && res.error === "ACCOUNT_DISABLED") {
          setSyncError("ACCOUNT_DISABLED");
        }
      } catch {
        // Silently fail - the next navigation or tab focus will retry
      }
    }, 2 * 60 * 1000); // every 2 minutes
    return () => clearInterval(interval);
  }, [apiToken, session?.accessToken, session?.error]);

  if (status === "loading" || !synced) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg-primary"
        role="status"
        aria-label="Syncing session"
      >
        <Image
          src="/img/rb_newlion2024_4_RS.png"
          alt=""
          width={56}
          height={56}
          className="ember-lion-glow opacity-80"
        />
        <div className="w-56 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (syncError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <div className="facet-border w-full max-w-md rounded-sm bg-bg-card p-8 text-center">
          {syncError === "ACCOUNT_DISABLED" ? (
            <>
              <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-danger">
                Account Disabled
              </h1>
              <p className="mb-6 text-sm text-text-secondary">
                Your account has been disabled by an administrator. If you believe this is an error, please contact a developer.
              </p>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-sm border border-border px-6 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                Sign Out
              </button>
            </>
          ) : syncError === "NOT_IN_GUILD" ? (
            <>
              <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-text-primary">
                Not a Member
              </h1>
              <p className="mb-6 text-sm text-text-secondary">
                You need to join the Royal Battalion Discord server to access this page.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="https://discord.gg/royalbattalion"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
                >
                  Join Discord Server
                </a>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-sm border border-border px-6 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-text-primary">
                Sync Failed
              </h1>
              <p className="mb-6 text-sm text-text-secondary">
                {syncError}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setSyncError(null);
                    setSynced(false);
                    setRetryCount((c) => c + 1);
                  }}
                  className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
                >
                  Retry
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-sm border border-border px-6 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <PermissionProvider permissions={permissions} apiToken={apiToken} user={user}>
      <SidebarProvider>
        <AppSidebar
          permissions={permissions}
          badges={{ "/whitelist": candidateCount }}
          onlineUsers={onlineUsers}
          userName={session.user?.name || "User"}
        />
        <SidebarInset>
          {/* Mobile header: 56px bar with hamburger trigger */}
          <header className="flex h-14 items-center gap-3 border-b border-border bg-bg-secondary px-4 md:hidden">
            <SidebarTrigger aria-label="Toggle menu" />
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/img/rb_newlion2024_4_RS.png"
                alt="Royal Battalion"
                width={24}
                height={24}
                className="rounded-sm"
              />
              <span className="font-display text-sm font-semibold tracking-[0.12em] text-accent">
                ROYAL BATTALION
              </span>
            </Link>
          </header>
          <div className="p-4 sm:p-6 md:p-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  );
}
```

Notes for the implementer: the old file's `NAV_ITEMS`, `canSeeNavItem`, `formatPageName`, `navContent`, mobile drawer/overlay, desktop aside, presence WS effects, and the presence `Modal` are ALL deleted — their responsibilities now live in nav-config/AppSidebar/usePresence. `Modal` import goes away. Everything in the auth-sync section is copied verbatim from the old file (do not retype it — copy it), with two sanctioned styling touches: the two `hover:bg-accent-muted` buttons become `hover:bg-accent-bright` (accent-muted is DARKER than accent in the dark theme — a pre-existing inverted hover), and the state cards gain `facet-border`.

- [ ] **Step 2: Verify gates** — full `bun test && bunx tsc --noEmit`. Also `grep -n "Modal" "packages/web/app/(protected)/layout.tsx"` returns nothing, and `grep -c "usePresence" "packages/web/app/(protected)/layout.tsx"` returns 2 (import + call).

- [ ] **Step 3: Dev-smoke (controller/user level).** `PORT=3106 bun run dev` then: `/dashboard` unauthenticated → redirects to `/login` (302/200 on login HTML); `/design` still renders (gallery uses the sidebar primitives). Full authenticated shell verification (grouped nav, badge, collapse rail, `[` shortcut, presence stack, roster dialog, mobile sheet) requires a logged-in browser session — list it in the report as the user's checklist, do not fake it.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): adopt grouped collapsible admin shell with presence and nav badges"
```

---

### Task 11: Wave close — gates, version, ledger

**Files:**
- Modify: `package.json` (root — version bump)

- [ ] **Step 1: Full gates** — from `packages/web`: `bun test` (expect ~78+ tests green incl. the new suites) and `bunx tsc --noEmit`.

- [ ] **Step 2: Grep gates** — all must hold:
  - `grep -rn "bg-green-500" packages/web --include="*.tsx"` → nothing (presence dots tokenized)
  - `grep -rn "lobby-monitor" packages/web/components/shell` → nothing
  - `grep -rn "text-white" packages/web/components/nav-badge.tsx` → nothing

- [ ] **Step 3: Version bump** — root `package.json`: `"version": "2.6.0"` → `"version": "2.7.0"`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(web): phase 2a shell wave, bump to 2.7.0"
```

- [ ] **Step 5: Report** — user's manual checklist: authenticated shell in both themes (grouped nav, whitelist badge incl. collapsed-rail dot, collapse via `[` and Cmd/Ctrl+B, persistence across reload, presence stack + roster dialog, mobile sheet, all four shell states). Do NOT push.

---

## Self-review notes (already applied)

- Spec §3 coverage: grouped sidebar ✓ (T4/T9), Dashboard pinned ✓, footer user area with Settings/Sign out ✓ (T9), Lobby removed ✓ (T4), API Docs added ✓ (T4), rcon gating ✓ (T4), collapse rail + `[` + persistence ✓ (Phase 0 base + T9; cookie persistence documented in Global Constraints), gold active indicator ✓ (ACTIVE_CLASS), presence widget expanded/collapsed + RosterDialog + hidden-when-empty ✓ (T9), NavBadge rail survival ✓ (T5), mobile Sheet + 56px header ✓ (T10), branded loading (no `Loading...` text) + preserved error states ✓ (T10), middleware documented-not-touched ✓, version line in footer = spec-optional, skipped (YAGNI).
- Carry-items: mapper ✓ (T1), test hygiene ✓ (T2), .diamond + ember color ✓ (T3), nav-config ✓ (T4).
- Type consistency: `PresenceUser` (T8) consumed by T9/T10; `AvatarStackUser`/`RosterRow` mapping done inside `PresenceBlock`; `badges: Record<string, number>` flows T9→T10; `matchResultVariant` name consistent across T1's four files.
- Placeholder scan: clean — every code step carries code; the two verbatim-copy instructions (auth-sync block, presence move) name their exact source and the complete target code is printed anyway.

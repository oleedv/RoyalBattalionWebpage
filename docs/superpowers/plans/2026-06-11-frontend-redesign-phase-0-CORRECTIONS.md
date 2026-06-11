# Phase 0 Corrections & Execution Decisions

> Companion to `2026-06-11-frontend-redesign-phase-0-foundation.md`. The original plan was written
> assuming the **Radix-based** shadcn/ui. A pre-execution verification pass (6 parallel investigators
> + adversarial toolchain check) found that `shadcn@latest` is now **4.11.0, built on Base UI**
> (`@base-ui/react`), and that several plan assumptions about nav permissions, the build, and the dev
> route were wrong. This document is the source of truth where it conflicts with the original plan.

## 1. Component library reality: shadcn 4.11.0 / `base-nova` / Base UI

- shadcn no longer scaffolds Radix. Components import from `@base-ui/react/*` (e.g.
  `@base-ui/react/button`, `@base-ui/react/menu`, `@base-ui/react/checkbox`).
- The `new-york` style **does not exist**. Valid presets: nova, vega, maia, lyra, mira, luma, sera,
  rhea. `components.json` `style` is `base-nova`.
- The CLI's dependency install step is **flaky on this Windows + Bun box**: every `bun add` ends with
  "Failed to install 1 package" (a single unrelated optional/native package, pre-existing) and exits
  non-zero, which aborts `shadcn add` *before it writes component files* when new deps are required.
  - Workaround used: install components whose deps were already present (everything except the three
    that pull new deps). The 18 core components landed this way.
  - `sonner`, `command`, `calendar` were the three that failed (they pull next-themes / cmdk /
    react-day-picker+date-fns). **Decision:** hand-write `sonner.tsx` (deps already installed);
    **defer `command` and `calendar`** to the phases whose pages use them (command palette / expiry
    pickers). Their deps (cmdk, react-day-picker, date-fns) are already in package.json.

### API differences that invalidate original-plan code snippets

| Concern | Radix (plan assumed) | Base UI (reality) |
|---|---|---|
| Polymorphism | `asChild` + nested child | `render={<Link .../>}` prop |
| Checkbox indeterminate | `checked={x && "indeterminate"}` | separate `indeterminate` prop + `checked` |
| Checkbox change | `onCheckedChange` | `onCheckedChange` (same) |
| Sidebar button | `<SidebarMenuButton asChild>` | `<SidebarMenuButton render={...}>` |
| Active state attr | `data-[active=true]:` | `data-active:` (presence) |
| Sidebar toggle key | (custom) | built-in **Cmd/Ctrl+B**; add our own `[` handler |
| Button base radius | sharp | `rounded-lg` — control via `--radius*` tokens |

All component-touching snippets in Tasks 5, 6, 10, 13 of the original plan are rewritten during
inline execution against the actual installed source.

### The `bg-accent` collision (confirmed real)

Base UI components use `bg-accent` / `text-accent-foreground` for focus/hover (dropdown, select,
command, etc.). In Tailwind v4, `bg-accent` resolves to `--color-accent`, which in this codebase is
**gold** and is used across 27 existing pages (`text-accent`, `border-border-accent`). Leaving it
makes every menu-hover solid gold. **Decision:** keep `--color-accent` = gold (don't touch old
pages); rename the shadcn usage in `components/ui/*` from `accent` → `accent-ui` via an ordered,
safe `sed` (replace `accent-foreground`→`accent-ui-foreground` first, then `bg-accent`→`bg-accent-ui`),
and define `--color-accent-ui` (subtle hover) + `--color-accent-ui-foreground` in the bridge.

## 2. Admin nav — corrected data (replaces Task 13 `nav-config.ts`)

Current layout uses a **flat** `NAV_ITEMS` array with `requiredPermissions: string[]` where **any**
match grants access and `"developer"` bypasses everything. Grouping is a new (approved) enhancement.
Real items (label / href / requiredPermissions), verified against
`app/(protected)/layout.tsx`:

- Dashboard `/dashboard` — (none); standalone, above groups
- **Operations**
  - Whitelist `/whitelist` — `["view:whitelist","manage:whitelist"]`
  - Live Server `/live-server` — `["view:live-server","manage:live-server"]`
  - Tickets `/tickets` — `["view:tickets","manage:tickets","view:tickets:normal","view:tickets:community_officer","view:tickets:admin_officer","view:tickets:comp_team","view:tickets:whitelist"]`
  - Seeding Tracker `/seeding-tracker` — `["view:seeding-tracker"]`
  - Matches `/match-manager` — `["manage:matches"]`  *(label is "Matches"; there is NO `/matches-admin`)*
- **Community**
  - Members `/members` — `["view:members","manage:members"]`
  - Discord Users `/discord-users` — `["view:members","manage:members"]`  *(uses members perms)*
- **System**
  - Discord Bot `/discord-bot` — `["view:discord-bot","manage:discord-bot"]`
  - SquadJS Config `/squadjs-config` — `["view:squadjs","manage:squadjs"]`
  - Roles `/roles` — `["manage:roles"]`
  - Audit Logs `/audit-logs` — `["view:audit-logs"]`
  - Lobby API `/lobby-monitor` — `["developer"]`  *(label is "Lobby API")*
- **Settings** `/settings` — NOT in main nav; it is a profile/footer link, no permission gate.

`NavItem` carries `requiredPermissions?: string[]` (not a single `permission`). `filterNavGroups`
signature: `(permissions: string[]) => NavGroup[]`, matching with `.some()` + `developer` bypass —
mirroring the existing `canSeeNavItem`.

## 3. `/design` route — must be a Server Component gate

`notFound()` is server-only and cannot run in a `"use client"` component, and `process.env.NODE_ENV`
is build-time-inlined. **Decision:** `app/design/page.tsx` is a **Server Component** that does
`if (process.env.NODE_ENV === "production") notFound();` and renders a separate
`app/design/gallery.tsx` marked `"use client"` (the interactive gallery).

## 4. Build/verification on Windows

`bun run build` (`next build` with `output: "standalone"`) **fails on this Windows box** with EPERM
symlink errors during trace collection — a Windows-only issue; Docker/CI builds fine. **Decision:**
local verification gates are `bunx tsc --noEmit` + `bun test` + a `bun run dev` smoke of `/design`
and existing pages. The production build is verified in Docker/CI, not locally.

## 5. Tokens / foreground colors

Keep the original plan's bridge approach but define per-theme foregrounds cleanly in `:root` and
`html.light` (not hardcoded only in `:root`). Confirmed safe: existing pages use `--color-*` doubled
utilities (`bg-bg-tertiary`, `text-text-secondary`, `border-border-accent`, `text-success`,
`text-danger`) — these remain valid; the new components add the shadcn single-name tokens
(`bg-primary`, `text-foreground`, `bg-muted`, `bg-popover`, …) via the bridge.

## 6. Tree state at start of execution

The verification agents left the tree dirty; reconciled rather than reverted (deps are ones we want):
- Installed (kept): `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`,
  `tailwind-merge`, `tw-animate-css`, `@tanstack/react-table`, `sonner`, `next-themes`,
  `react-day-picker`, `date-fns`, `cmdk`; dev: `@happy-dom/global-registrator`,
  `@testing-library/react`; `shadcn` CLI moved to devDependencies.
- Created: `components.json` (base-nova), `components/ui/*` (18), `hooks/use-mobile.ts`,
  `lib/utils.ts`. Removed the agents' `globals.css.backup`.
- Untouched: the user's pre-existing uncommitted `settings/page.tsx` and `next.config.ts` changes.

## Execution order (logical commits)

1. shadcn Base UI scaffold + utils + deps (baseline)
2. globals.css: parchment tokens + shadcn bridge + `@theme inline` + radius + accent-ui
3. accent→accent-ui rename in `components/ui/*`; restyle button + badge to gilded signature
4. self-hosted fonts (next/font)
5. theme hook + ThemeToggle (Base UI render) + hand-written sonner.tsx
6. composites: StatusBadge, EmptyState, SearchInput, FilterBar, DataTable (Base UI checkbox),
   PageHeader, StatCard, Sparkline (+ tests for pure logic & debounce)
7. nav-config (corrected) + AppSidebar (render) + PublicHeader
8. `/design` server+client gallery, verification, version bump

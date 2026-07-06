# Frontend Redesign: Gilded Regiment

Date: 2026-06-11
Status: Approved design, pending implementation plan
Scope: Design system + all 27 pages of `packages/web`

## Context

The Royal Battalion webpage (Next.js 15, React 19, Tailwind v4, no UI library) has a
solid gold-on-charcoal identity but inconsistent execution: 9 shared components, most
styling inline per page, divergent search/filter/table patterns across admin pages, and
a 2,446-line whitelist page. This redesign elevates the existing identity ("Gilded
Regiment" - a refined evolution, not a reinvention) and rebuilds every page on a single
consistent design system.

## Decisions (interview summary)

| Branch | Decision |
|---|---|
| Scope | Design system + all 27 pages |
| Direction | Gilded Regiment: refined evolution of gold-on-charcoal + Cinzel |
| Components | shadcn/ui, aggressively restyled; consistency is a hard requirement |
| Typography | Cinzel (display) + Outfit (UI/body) + JetBrains Mono (data) |
| Themes | Dark (default) + Parchment light, both fully designed |
| Admin shell | Grouped sidebar, collapsible to icon rail |
| Imagery | In-game screenshots with gold-toned grading treatment |
| Landing | Cinematic hero + live telemetry strip |
| Wow factor | Lion emblem with ember field and depth parallax in the hero |
| Motion | Choreographed restraint, CSS-first |
| Density | Compact data, calm chrome |
| Rollout | Foundation first, then waves |
| Logo | Keep `rb_newlion2024_4_RS.png` (2024 lion) |

## 1. Design language

### Color

Dark theme (default) keeps the existing scale, formalized as tokens:

- Backgrounds: `#08080a` -> `#101014` -> `#16161b` (card) -> `#1e1e24` (card hover)
- Accent gold: `#c8a84e` (primary), `#e0c060` (bright), `#a08a3e` (muted)
- Text: `#eeeee8` / `#9a9a98` / `#555558`
- Borders: `#222228`, accent tint `#c8a84e33`
- Status: success `#22c55e`, warning `#f59e0b`, danger `#dc2626`

Light theme is Parchment, a designed theme rather than an inversion:

- Backgrounds: ivory `#f3efe5` -> `#faf7ef` (card)
- Text: ink `#1c1a14` / `#5c574a` / `#a39d8a`
- Accent: bronze `#8a7430` (gold darkened for WCAG AA contrast on light ground)
- Borders: `#e2dbc8` / `#d8d1bd`
- Status colors tuned for light ground

All colors live as CSS custom properties on `:root` (dark) and `html.light`, consumed
through the Tailwind v4 `@theme` block. No raw hex values in components. Existing
`rb-theme` localStorage mechanism and FOUC-prevention inline script are kept.

Texture: subtle film grain/noise overlay on public hero surfaces; hairline gold rules
(1px gradient lines) as the signature separator; gold reserved as the only saturated
voice in the UI.

### Typography

Three voices with strict roles:

- **Cinzel** (400/700/900): page titles, masthead, section headings only. Never body,
  never controls.
- **Outfit** (300-600): all UI text, body copy, buttons, labels.
- **JetBrains Mono** (400/600, `font-variant-numeric: tabular-nums`): Steam IDs,
  timestamps, scores, map names, coordinates, console/log output, telemetry values.

All three self-hosted via `next/font` (replaces Google Fonts requests; eliminates
third-party calls and layout shift).

### Iconography

lucide-react replaces all hand-pasted inline SVGs. Faction flags continue to come from
the SquadMaps CDN. The 2024 lion (`rb_newlion2024_4_RS.png`) is the only brand mark,
used at every size (favicon, sidebar, hero).

## 2. Component system

shadcn/ui components, restyled to the theme at the token + component level:

- Base set: Button, Card, Dialog, AlertDialog, DropdownMenu, Tabs, Table, Input,
  Select, Checkbox, Badge, Tooltip, Command, Sidebar, Sheet, Skeleton, Sonner,
  Popover, Calendar (for expiry pickers).
- Restyle signature: sharp 2px radii, gold focus rings, uppercase tracked button/label
  text, hairline borders, no default shadcn shadows (flat panels with border emphasis).

Composite components (the consistency layer - every page must use these, no ad-hoc
variants):

- **SearchInput**: single canonical search field (icon, clear button, debounce).
- **FilterBar**: standard filter row (selects, toggles, active-filter chips).
- **DataTable**: TanStack Table under shadcn Table styling - sorting, column config,
  row selection, bulk-action floating bar, pagination. Whitelist, members,
  discord-users, audit-logs, tickets all sit on this one component.
- **PageHeader**: breadcrumb (mono, tracked) + Cinzel title + action slot.
- **StatCard / Sparkline**: dashboard and live-server metrics.
- **StatusBadge**: server/match/entry status (online, win/loss/draw, expired...).
- **EmptyState**: dimmed lion mark + one-line message + optional action.

Density rule ("compact data, calm chrome"): data surfaces (tables, lists, logs) run
32px rows / 13px text / mono data columns; chrome (page headers, cards, forms,
dialogs) keeps generous spacing. Two densities applied by surface type, never per-page
choice.

Loading states are skeletons (shaped like the content they replace), not spinners.
Toasts via Sonner replace any inline alert patterns.

## 3. Shells

### Public shell

Fixed top header with blur backdrop: lion + "ROYAL BATTALION" wordmark (Cinzel,
tracked), nav (Servers, Matches), login/avatar button. Footer: brand line, legal
links, Discord link. **Tech-stack links are removed from the footer** (public copy
must not advertise implementation details).

### Admin shell

Grouped sidebar, three sections:

- OPERATIONS: Whitelist, Live Server, Tickets, Seeding Tracker, Match Manager
- COMMUNITY: Members, Discord Users, Matches
- SYSTEM: Discord Bot, SquadJS Config, Roles, Audit Logs, Settings, Lobby Monitor

Behavior:

- Collapsible to a 56px icon rail (tooltip labels). State persisted per user
  (localStorage). Keyboard shortcut `[` toggles. Built on the shadcn Sidebar primitive.
- Gold active indicator (inset left bar + tinted background).
- Online-users widget stays at the sidebar base (avatar stack, presence WebSocket).
- Mobile: sidebar becomes a Sheet drawer; 56px hamburger header.
- Every admin page uses PageHeader (breadcrumb + Cinzel title + actions).

## 4. Public pages

### Landing (`/`)

Cinematic hero, full viewport:

- Full-bleed in-game screenshot with the standard grade (dark vignette, gold-toned
  color wash, grain overlay) so any decent capture sits on-brand behind text.
  Screenshots supplied by RB from their servers; until provided, the current abstract
  gradient background is the fallback.
- Copy bottom-left: kicker, ROYAL BATTALION in Cinzel 900, existing body copy, CTAs
  (Connect to Server, Join Discord). Existing copy is retained.
- **Wow factor, center-right: the lion emblem in an ember field with depth parallax.**
  Canvas-based: ~70 glowing gold motes drifting upward at varying depths with flicker
  and sway; the lion and ember layers shift on mouse with per-depth parallax; lion has
  a slow breathing scale and gold glow. Degrades to the static logo when
  `prefers-reduced-motion` is set, on touch/mobile devices, and while the canvas is
  offscreen. Implementation is vanilla canvas in a client component (no animation
  library), `requestAnimationFrame` paused when the hero leaves the viewport.
- Live telemetry strip pinned to the hero base: Main server (players/map), Battle
  server (players/map), Admins on duty, Last match result - mono values, pulsing
  status dots, 30s refresh (existing LiveSnapshot data source).

Sections below the hero, each a one-time scroll reveal: Servers (two connection cards
with live status) -> Recent Matches (last 3, graded map thumbnails) -> How Whitelist
Works (3 steps) -> Discord CTA.

### Other public pages

`/server`, `/matches`, `/ticket/[uuid]`, `/ticket/legacy/[uuid]`, `/prospect/[uuid]`,
`/login`, `/signout`, `/privacy`, `/terms` rebuilt on the design system with the same
information architecture as today. Match cards and map thumbnails get the graded-image
treatment. Login page gets the lion + ember treatment at reduced intensity.

## 5. Admin pages

All 18 protected pages migrate onto the design system in waves (section 8). Migration
is a reskin plus structural cleanup - data fetching, permissions, and behavior are
unchanged.

Targeted refactor: `whitelist/page.tsx` (2,446 lines) is decomposed during its
migration into focused components (toolbar, entries table, entry profile modal,
candidates queue, admin groups, clans, activity log), all on DataTable/FilterBar.
Identical behavior, verified against the current page feature-by-feature.

## 6. Motion

Choreographed restraint:

- Landing: one-time scroll-triggered reveals (fade/rise, staggered ~80ms), ember hero,
  count-up on telemetry numbers, pulsing live dots.
- Admin: micro-transitions only (hover, focus, dialog open, sidebar collapse), all
  150-200ms ease-out.
- CSS-first; the only JS animation is the hero ember canvas. No animation library.
- `prefers-reduced-motion`: all non-essential motion disabled, ember canvas replaced
  by static logo.

## 7. Theming and accessibility

- Both themes ship for every component and page; theme toggle stays in the current
  location (settings/profile area + public footer).
- Contrast: all text/background pairs meet WCAG AA in both themes (bronze `#8a7430`
  exists because gold `#c8a84e` fails on ivory).
- Focus: visible gold focus rings everywhere; all interactive widgets are the
  Radix-based shadcn primitives (keyboard nav, focus traps, ARIA solved at the base).
- Touch targets minimum 40px on mobile surfaces despite compact desktop density.

## 8. Rollout

Foundation first, then waves. Each wave ships to production from main with a semver
minor bump (project convention).

- **Phase 0 - Foundation**: design tokens, next/font setup, shadcn install + restyle,
  composite components (DataTable, FilterBar, SearchInput, PageHeader, StatCard,
  StatusBadge, EmptyState), both shells, theme infrastructure. No page migrations;
  existing pages still render with old styles.
- **Phase 1 - Public**: landing (hero, embers, telemetry strip, sections), server,
  matches, ticket/prospect views, login/signout, privacy/terms, public footer cleanup.
  The public face flips to the new design in one release.
- **Phase 2 - Admin workhorses**: dashboard, whitelist (including decomposition),
  live-server, tickets.
- **Phase 3 - Remaining admin**: members, discord-users, users/[id], match-manager,
  seeding-tracker, discord-bot, squadjs-config, audit-logs, roles, settings,
  lobby-monitor, and removal of all dead legacy CSS/components.

Mixed old/new styling is acceptable on admin pages only, between phases 1 and 3.

### Verification per page

Each migrated page is checked against the current production page: same data
displayed, same actions available, same permission gating, both themes, mobile + desktop,
loading/empty/error states. No functional regressions - this is a visual and
structural upgrade only.

## Non-goals

- No changes to the API (`packages/api`), data model, auth, or permissions.
- No new features beyond the landing hero treatment; no copy rewrites beyond the
  footer tech-link removal.
- No SSR/data-fetching rearchitecture (client-side fetching patterns stay).
- No virtualized tables in this pass (noted as a future improvement for whitelist at
  scale).
- The Squad-screenshot capture itself (RB supplies images; the design ships with the
  grading treatment and abstract fallback).

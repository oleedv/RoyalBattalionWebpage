# Frontend Redesign: Gilded Regiment (Revision 2)

Date: 2026-06-11, revised 2026-07-05
Status: Approved design; Phase 0 implemented on the stranded local `production` branch, pending reconciliation onto current mainline
Scope: Design system + all pages of `packages/web`
Supersedes: `2026-06-11-frontend-redesign-design.md` (exists only on the stranded branch)

## Revision note (why this revision exists)

The original spec froze the codebase as of 2026-06-11 (v1.1.2 era). Since then, mainline
(`origin/production`, now 2.3.0 live + birthday branch at 2.4.0) gained 63 commits (71
non-merge including the birthday branch) that change the redesign's baseline:

- **REST v1 breaking refactor** (v2.0.0, 2026-07-02): every endpoint under `/v1`, strict
  string-error envelope, PATCH partials, 204 deletes, 202 async enqueues, enriched
  `Paginated {items,total,page,limit,hasNext}`. The web api-client (~87 exported
  functions) was rewritten.
- **New surfaces**: RCON console (`/live-server/console`), consolidated `/seeding` page,
  dashboard personal Squad stats (recharts) + profile-card fields + birthday controls,
  presence who's-online roster, member-disable whitelist deactivation, tickets made
  read-only, app-wide skeleton loading system.
- **Convergent components**: mainline independently grew `data-table.tsx`,
  `search-input.tsx`, `skeleton.tsx` — names the spec's Phase 0 also planned. Phase 0 (built
  2026-06-11 on the stranded branch) dodged this with `-v2` filenames; this revision defines
  the reconciliation.
- **Phase 0 execution facts** (from
  `docs/superpowers/plans/2026-06-11-frontend-redesign-phase-0-CORRECTIONS.md`, on the
  stranded branch):
  shadcn CLI 4.11 now scaffolds **Base UI** (`@base-ui/react`), not Radix; style preset is
  `base-nova`; `accent` was renamed `accent-ui` in `components/ui/*` to protect the gold
  token; `command`/`calendar` were deferred (deps installed); `sonner.tsx` is hand-written;
  light `--color-text-muted` was darkened to `#6a6353` for AA; the global radius-scale
  override was reverted (sharpness lives on explicit `rounded-sm` per component).
- **Infra reality**: the lobby-service backing `/lobby-monitor` was decommissioned
  2026-06-30 — that page becomes a removal, not a migration.

## Context

The Royal Battalion webpage (Next.js 15, React 19, Tailwind v4, no UI library on mainline)
has a solid gold-on-charcoal identity but inconsistent execution. Current inventory
(working tree, 2026-07-05): 29 `page.tsx` files (2 auth + 19 protected + 8 public), of
which 28 are live pages (`/seeding-tracker` is a 9-line redirect stub) and 1 is slated for
removal (`/lobby-monitor`) — 27 designable pages. 10 shared components exist under
`packages/web/components/`, most page styling is inline per page, search/filter/table
patterns diverge across admin pages, and the whitelist page is 2,663 lines. Data access
goes through the REST v1 api-client plus `use-async-data` / `use-auto-refresh` /
`use-crud-state` hooks. This redesign elevates the existing identity ("Gilded Regiment" —
a refined evolution, not a reinvention) and rebuilds every page on a single consistent
design system.

## Decisions (interview summary + revision deltas)

| Branch | Decision |
|---|---|
| Scope | Design system + all pages (27 designable) |
| Direction | Gilded Regiment: refined evolution of gold-on-charcoal + Cinzel |
| Components | shadcn/ui 4.11 on **Base UI** (`base-nova`), aggressively restyled; consistency is a hard requirement |
| Typography | Cinzel (display) + Outfit (UI/body) + JetBrains Mono (data) |
| Themes | Dark (default) + Parchment light, both fully designed |
| Admin shell | Grouped sidebar, collapsible to icon rail |
| Charts | **recharts** (already on mainline) blessed for axis-grade charts, token-themed, animations off; Sparkline composite for inline metrics |
| Skeletons | **Mainline `components/skeleton.tsx` system is canonical** (shipped 1dea4c7); Phase 0's `ui/skeleton.tsx` is deleted |
| Imagery | In-game screenshots with gold-toned grading treatment |
| Landing | Cinematic hero + live telemetry strip |
| Wow factor | Lion emblem with ember field and depth parallax in the hero |
| Motion | Choreographed restraint, CSS-first |
| Density | Compact data, calm chrome |
| Rollout | Foundation (done, stranded) -> reconciliation -> waves |
| Logo | Keep `rb_newlion2024_4_RS.png` (2024 lion) |

## 1. Design language

### Color

Dark theme (default) keeps the existing scale, formalized as tokens:

- Backgrounds: `#08080a` -> `#111114` -> `#16161b` (card) -> `#1e1e24` (card hover)
- Accent gold: `#c8a84e` (primary), `#e0c060` (bright), `#a08a3e` (muted)
- Text: `#eeeee8` / `#9a9a98` / `#555558`
- Borders: `#222228`, accent tint `#c8a84e33`
- Status: success `#22c55e`, warning `#f59e0b`, danger `#dc2626`

Light theme is Parchment, a designed theme rather than an inversion (mainline's current
`html.light` is a grey/white inversion keeping gold `#c8a84e`, which fails AA on light
ground — Parchment replaces it):

- Backgrounds: ivory `#f3efe5` -> `#faf7ef` (card)
- Text: ink `#1c1a14` / `#5c574a` / **`#6a6353` muted** (corrected from `#a39d8a`, which
  failed AA at ~2.4:1; `#6a6353` is ~5.2:1 on bg-primary)
- Accent: bronze `#8a7430` (gold darkened for WCAG AA contrast on light ground)
- Borders: `#e2dbc8` / `#d8d1bd` (Phase 0 shipped only `#e2dbc8` as `--color-border`;
  `#d8d1bd` is the secondary/emphasis tone, a design value still to be added)
- Status colors tuned for light ground

All colors live as CSS custom properties on `:root` (dark) and `html.light`, consumed
through the Tailwind v4 `@theme` block plus the shadcn variable bridge (Phase 0). The
bridge stays keyed to the existing 10 semantic token names (`bg-bg-*`, `accent*`,
`text-text-*`, `border*`, status) since every mainline component consumes them; shadcn's
`accent` is renamed `accent-ui` throughout `components/ui/*` because `--color-accent` is
gold and page-visible. No raw hex values in components. Existing `rb-theme` localStorage
mechanism and FOUC-prevention inline script are kept.

**Chart-token bridge (new)**: recharts and Sparkline take colors as JS props; today they
hard-code `#c8a84e` / `#ef4444` / `#f59e0b` and dark-only rgba tooltip styles. The design
system must expose series/grid/axis/tooltip colors in a JS-consumable form (runtime
`getComputedStyle` on the custom properties, or an exported tokens module) so charts follow
theme switches. This lands before the dashboard wave.

**Known raw-palette violations to sweep during migration** (token cleanup checklist):
`bg-green-500` (rcon connected dot, presence dots), `bg-emerald-500` (members presence),
`text-blue-400`/`text-emerald-400`/`bg-blue-500/15` (tickets tier/legacy badges),
`bg-red-600` (confirm-dialog — file is deleted anyway), `bg-black/50` overlays,
`text-white` (candidate badge), chart hex constants, `#5865f2` Discord-blurple fallback
(ProspectForumEmbed).

Texture: subtle film grain/noise overlay on public hero surfaces; hairline gold rules
(1px gradient lines) as the signature separator; gold reserved as the only saturated
voice in the UI. The existing `.facet-border` gold gradient-border utility (used across
10+ files: dashboard, seeding, six discord-bot tabs, discord-users, live-server) is
absorbed into this vocabulary as the "accent panel border" treatment — kept, formalized
as a token-driven recipe.

### Typography

Three voices with strict roles:

- **Cinzel** (400/700/900): page titles, masthead, section headings only. Never body,
  never controls.
- **Outfit** (300-600): all UI text, body copy, buttons, labels.
- **JetBrains Mono** (400/600, `font-variant-numeric: tabular-nums`): Steam IDs, EOS IDs,
  Discord snowflakes, timestamps, scores, map names, coordinates, console/log output,
  telemetry values, version strings.

All three self-hosted via `next/font` (Phase 0 built this; mainline still uses the Google
Fonts `@import` and has no mono font at all — `<code>` renders browser-default mono).

### Iconography

lucide-react replaces all hand-pasted inline SVGs. Faction flags continue to come from
the SquadMaps CDN. The 2024 lion (`rb_newlion2024_4_RS.png`) is the only brand mark,
used at every size (favicon, sidebar, hero).

## 2. Component system

shadcn/ui components (CLI 4.11, **Base UI** — `@base-ui/react`, preset `base-nova`),
restyled to the theme at the token + component level:

- Base set (installed in Phase 0): Button, Card, Dialog, AlertDialog, DropdownMenu, Tabs,
  Table, Input, Select, Checkbox, Badge, Tooltip, Sidebar, Sheet, Popover, Separator,
  Label, Skeleton-atom (superseded — see below), Sonner (hand-written wrapper).
  That is 18 primitives; the Sonner wrapper is hand-written, not a scaffolded primitive.
  **Deferred to first consumer**: Command (command palette / autocomplete / comboboxes),
  Calendar (expiry pickers AND the date-range filters on audit-logs / discord-bot
  LogsTab) — their deps (cmdk, react-day-picker, date-fns) are installed.
  **Add to base set**: Switch (boolean settings), ToggleGroup (segmented ranges).
- Base UI API notes (differ from Radix): polymorphism via `render={...}` not `asChild`;
  checkbox `indeterminate` is a separate prop; active state is `data-active` presence;
  sidebar has built-in Cmd/Ctrl+B toggle (our `[` shortcut is added on top).
- Restyle signature: sharp 2px radii via explicit `rounded-sm` on buttons/badges/composites
  (the global radius-scale override was tried and reverted — it altered legacy pages),
  gold focus rings, uppercase tracked button/label text, hairline borders, no default
  shadows (flat panels with border emphasis).

### Component reconciliation (new — resolves the name collisions)

Mainline and Phase 0 built overlapping components. Canonical outcomes:

| Component | Mainline today | Phase 0 (stranded) | Decision |
|---|---|---|---|
| Skeleton system | `components/skeleton.tsx`: atom + Region/Text/Card/StatCard/StatGrid/List/TableRows, a11y-labelled, adopted across ~20 files | plain `ui/skeleton.tsx` atom | **Keep mainline system** as canonical loading layer; restyle when tokens land; delete Phase 0's `ui/skeleton.tsx`. Forbid new spinner/`Loading...` text |
| DataTable | `data-table.tsx`: render-prop columns, loading/skeletonRows, no sorting/selection/pagination (2 consumer pages) | `data-table-v2.tsx`: TanStack — sorting, selection, bulk bar, pagination, mono ColumnMeta | **v2 wins** (Phase 2/3 pages need sorting/selection/bulk). Before first page migrates: port `loading`/`skeletonRows` (SkeletonTableRows + aria-busy) and add expandable detail rows. v2 keeps its name until Phase 3, when the legacy file's consumers are migrated, the old file is deleted, and v2 is renamed to `data-table.tsx` |
| SearchInput | `search-input.tsx`: controlled value/onChange, no debounce/icon (whitelist EntriesTab + audit-logs) | `search-input-v2.tsx`: debounced uncontrolled `onSearch`, lucide icons | **v2 wins** (debounce is a requirement) but gains optional controlled-value support so whitelist/audit-logs client-side filtering keeps owned state. Same Phase 3 rename dance |
| Modal | `modal.tsx`: hand-rolled, 18 render sites across 5 files, load-bearing portal-to-body fix (a8c2fab) for the sidebar stacking-context bug, no focus trap/ARIA | shadcn Dialog | **Dialog replaces Modal per page wave** (Dialog portals natively, killing the stacking bug class — verify per surface). Modal stays until its last consumer migrates |
| ConfirmDialog | `confirm-dialog.tsx`: **dead code, zero imports**, hardcoded red-600 | AlertDialog | **Delete `confirm-dialog.tsx` immediately.** AlertDialog-based confirm recipes are greenfield (see composites) |
| Footer | ships TECH_STACK "Built With" links | — | **Keep and restyle** in Phase 1; remove tech links (overdue — violates the standing no-tech-specs-in-public-copy policy) |
| LiveSnapshot | 3-tile public strip, 30s polling | — | **Replaced** by the hero telemetry strip (Phase 1) on StatCard primitives; reuse its `getServerStatus`/`getAdminTeamCount` polling; delete after |
| UserProfileContent | rich entity profile (avatar+presence header, InfoField grid, status badges, moderation actions, Loading/Error variants); serves `/users/[id]` AND `/users/by-steamid/[steamId]`; displays DOB since 2026-05-03 (11ea1ca). The birthday privacy toggles live on the dashboard, NOT here | — | **Keep and restyle** in Phase 3; migrate internals onto StatusBadge/InfoField composites; IDs move to JetBrains Mono |
| Sparkline (page-local) | `live-server/components/sparkline.tsx` + a hand-rolled multi-series SVG in dashboard | Sparkline composite | Composite absorbs both (multi-series + legend + fixedMax from dashboard version); page-local copies deleted in their waves |

### Composite components (the consistency layer — every page must use these)

Originals, unchanged in intent: **SearchInput**, **FilterBar**, **DataTable**,
**PageHeader**, **StatCard / Sparkline**, **StatusBadge**, **EmptyState**.
FilterBar's field vocabulary grows date-range inputs (audit-logs and discord-bot LogsTab
filter on from/to dates — today native `type="date"`; Calendar-based range picker when
Calendar lands).

Extended requirements discovered since:

- **DataTable**: expandable/disclosure rows with full-width detail cell + per-row lazy-load
  skeleton (whitelist ActivityTab, tickets detail); rank-number column + whole-row
  drill-in affordance + in-row pulse dot (seeding leaderboard); loading/skeletonRows;
  **inline row-edit mode** (match-manager: cells swap to date/text inputs and a
  WIN/LOSS/DRAW select while a row is edited, plus per-row hide toggle and a per-row
  async action — Resync — with transient feedback that migrates to Sonner).
- **StatCard**: sub-line, accent variant, info-tooltip slot, grouped stat sections with
  uppercase group labels (dashboard StatTile pattern).
- **StatusBadge**: variant map extended to the states pages actually render — member
  Disabled/Discord-only/Logged-in; whitelist Expired/Expiring/Permanent; ticket
  Open/Closing/Closed/Accepted/Denied/Legacy + tier labels (Normal, Community Officer,
  Admin Officer, Comp Team, Whitelist); seeding session active/completed/reset/expired,
  LIVE, Whitelisted(role)/No Whitelist; server online/offline; match win/loss/draw.
  Deliberate: whitelist "deactivated" entries get NO badge — they are hidden entirely
  (2026-06-17 member-disable design).
- **EmptyState**: plus a "nudge" variant carrying actionable prose + CTA (dashboard
  "link your Steam" / "no recorded activity yet"), and a lightweight one-line mono hint
  variant (empty terminal scrollback, no lion mark).

New composites this revision adds:

- **TerminalPane** (RCON console): mono scrollback (command echo in accent, pre-wrap
  output, danger failure lines, autoscroll, Clear), prompt input with up/down history +
  inline autocomplete (Command primitive anchored to the input; suggestions show
  name/args/description with destructive markers), data-driven destructive-confirm via
  AlertDialog ("you are about to run `<command>`", keyed off `isDestructiveCommand`).
- **ConnectionStatus / ServerScope**: pulsing connected/disconnected dot + active server
  label + server-switcher select, shared by Live Server Monitor and Console.
- **LiveStatusCard**: four-state card (live / stale >120s / socket-disconnected /
  unconfigured) with pulsing dot + "Updated hh:mm:ss" mono timestamp (seeding; recurs for
  any bot-written live row).
- **AvatarStack**: overlapping avatars, cap + "+N" overflow chip, presence dot,
  initial-letter fallback, rich multi-line hover tooltip (display name / @username /
  current page).
- **RosterDialog**: scrollable row list (avatar + primary/secondary text + right meta)
  inside a Dialog with sticky header count (who's-online; reusable).
- **NavBadge**: count pill on a sidebar nav item (whitelist candidate count, danger tone),
  with a defined collapsed-rail behavior.
- **ConfirmDialog recipes** on AlertDialog: plain destructive; **with required reason
  input** (member disable single + bulk — confirm disabled until reason present; the
  whitelist-removal warning line renders in both); broadcast-action confirm (seeding
  "Send Seeding Call Now" / "Send Rapport"). Native `window.confirm()` is a banned pattern.
- **SettingsForm / FormSection kit**: labeled responsive grid form, dirty-state detection,
  Save/Reset action bar, auto-refresh-pause-while-dirty contract; field set includes
  Switch, number input, TimeInput (HH:MM), **TimezoneCombobox** (Command-based, validated
  IANA list — replaces the birthday card's free-text field), Discord channel-ID / role-ID
  mono inputs (validated picker is a future upgrade), server-select, tag/chip list editor
  (roleIds).
- **InfoTip / FieldTip**: two-tier tooltip system — icon "i" explainer with hover + focus +
  tap-to-open (Popover fallback for touch) + Escape/outside dismiss + aria-describedby
  (player stats), and the read-only-field tooltip ("If this is incorrect, create a
  community ticket." — dashboard identity fields).
- **CopyableId**: JetBrains Mono ID with hover Copy/Copied affordance (Steam/EOS/Discord
  IDs across members/whitelist/profiles).
- **DescriptionList / InfoField**: uppercase micro-label + value grid used in every detail
  modal/panel, with inline edit-mode variants (input/select/date swapped in place).
- **AuditDetail renderer**: key-value grid + from->to change-diff rows + collapsible
  "Show raw" JSON block (whitelist activity panel, 1794ee6; also fits audit-logs).
- **BarChart / DistributionChart**: hourly 24-bar and weekday 7-bar variants with axis
  labels (seeding), token-themed.
- **CapacityBar**: server player-fill bar with transition (dashboard server cards).
- **ImportPreview**: paste-parse table with per-row classification (new / already-exists /
  duplicate-in-batch / error) + summary counts (whitelist import modal).
- **DownloadButton**: .txt artifact export (tickets, discord-bot ProspectsTab; per the
  standing staff-reports-as-txt convention).
- **JsonEditorField**: textarea JSON editor with live `JSON.parse` validation and inline
  "Invalid JSON" error (squadjs-config PluginField).
- **ConfigDiffDialog**: "Review Changes" dialog showing per-item before/after
  pretty-printed JSON blocks with confirm-save (squadjs-config — today a hand-rolled
  fixed overlay that is NOT `modal.tsx`, so it sits outside the Modal->Dialog census;
  it migrates to Dialog like the rest).
- **DiscordEmbed**: themed renderer for Discord-style embeds (public prospect page's
  ProspectForumEmbed: color-stripe card, author row with icon, title/url, fields grid,
  images). Keep the Discord-authentic look as a deliberate exemption from the panel
  recipe, but route the stripe fallback (`#5865f2`) and surfaces through tokens.
- **Tone-variant ghost action buttons**: small bordered warning/danger/neutral inline
  actions used inside data panels (Warn / Kick / Switch team).
- **Route-linked Tabs variant**: tabs that are Next routes, with permission-conditional
  tab rendering (Live Server Monitor <-> Console); plus count-badge-on-tab (whitelist
  Requests tab); plus segmented server switcher pills paired with a status+action toggle
  (SFTP Sync On/Off).
- **ConfigCard**: permission-gated feature-config card hosted on a content page (birthday
  admin card on /dashboard — a locked decision from the 2026-07-05 birthday spec; seeding
  manager sections set the same precedent).

### Charts (new section)

recharts `^2.15.0` is already on mainline (sole importer: dashboard
`player-stats-section.tsx`) and is **blessed** as the sanctioned library for
axis/tooltip-grade charts — wrapped in a themed component that routes all
series/grid/axis/tooltip colors through the chart-token bridge, supports both themes, and
disables mount animations (`isAnimationActive={false}`) or gates them behind
`prefers-reduced-motion`. The seeding HourlyChart/WeekdayChart are hand-rolled
`<svg>`/`<rect>` bar charts, NOT recharts — they are absorbed by the BarChart composite
(which may itself stay hand-rolled SVG; axis-grade recharts is not required for them).
The Sparkline composite covers inline mini-charts. The "no animation library" motion rule
reads: no library whose purpose is animation; recharts' incidental animations are turned
off.

### Data freshness (new section)

`hooks/use-auto-refresh.ts` is the canonical polling primitive: default 20s,
visibility-aware (skip while hidden, refetch on return), with the enabled-gate convention
that forms pause refresh while dirty/saving. `use-async-data`'s `initialLoading` gates
skeletons: **skeletons on initial load only; background refresh retains stale data on
screen**. Count-up motion on telemetry numbers must not re-trigger on background refresh.
Live WS-backed surfaces (console, live-server, presence) show connection state via status
dot / inline "Disconnected, reconnecting" notice — not skeletons.

### Toasts (new contract)

Mainline has NO toast system (feedback is inline `text-danger` divs, transient
`setTimeout`-cleared "Saved." spans, silent catch blocks). Sonner replaces all of it.
Contract: the api-client guarantees `error` is always a displayable string (client
coercion cf83a92 + server `validate()` wrapper d25a016), so error toasts render
`res.error` directly. Stable machine codes `ACCOUNT_DISABLED` and `NOT_IN_GUILD` bypass
toasts and keep driving the protected layout's dedicated full-screen states.

### Density

Density rule ("compact data, calm chrome"): data surfaces (tables, lists, logs) run
32px rows / 13px text / mono data columns; chrome (page headers, cards, forms,
dialogs) keeps generous spacing. Two densities applied by surface type, never per-page
choice.

## 3. Shells

### Public shell

Fixed top header with blur backdrop: lion + "ROYAL BATTALION" wordmark (Cinzel, tracked),
nav (Servers, Matches), login/avatar button. PublicHeader absorbs `nav-auth-button.tsx`
(session-aware: Dashboard when authenticated, Login otherwise) — currently repeated
across 8 public pages that each hand-roll their own header; those are deleted in Phase 1.
Footer: brand line, legal links, Discord link. **Tech-stack links are removed from the
footer.** The cookie-consent banner (fixed-bottom, accept + privacy link, rendered from
the root layout) gets a designed variant in both themes.

### Admin shell

Migration starting point (corrected): today's protected shell is already a fixed left
sidebar (224px, flat ungrouped nav with any-of `requiredPermissions` filtering +
`developer` bypass, no collapse, no desktop top bar) with a mobile top header + slide-in
drawer, a whitelist candidate-count danger badge, the presence widget at the sidebar base,
and a footer user area (display name, Settings link, Sign out). The migration is
flat-sidebar -> grouped/collapsible shadcn Sidebar with the same anatomy.

Grouped sidebar (corrected against live routes):

- **Dashboard** — ungrouped, pinned above the groups (default admin landing)
- OPERATIONS: Whitelist (NavBadge: candidate count), Live Server (Monitor/Console
  route-tabs), Tickets, Seeding (`/seeding`), Match Manager (`/match-manager`; label
  changes from today's "Matches" to "Match Manager" to avoid colliding with the public
  Matches page; there is no separate admin matches route, so the spec's old COMMUNITY
  "Matches" item is dropped)
- COMMUNITY: Members, Discord Users
- SYSTEM: Discord Bot, SquadJS Config, Roles, Audit Logs, API Docs (developer-gated)
- **Footer user area** (not a group): display name, Settings, Sign out. Settings stays
  here — not in SYSTEM — matching reality and avoiding duplication.
- **Removed**: Lobby Monitor ("Lobby API") — backing service decommissioned 2026-06-30.

Non-sidebar routes reached via in-app links: `/users/[id]`, `/users/by-steamid/[steamId]`,
`/live-server/console` (tab), `/seeding-tracker` (redirect stub). The `/design` gallery
stays a Server-Component-gated dev-only route (`notFound()` in production).

Behavior:

- Collapsible to a 56px icon rail (tooltip labels). State persisted per user
  (localStorage). Keyboard shortcut `[` toggles (Base UI Sidebar also ships Cmd/Ctrl+B).
  Built on the shadcn Sidebar primitive.
- Gold active indicator (inset left bar + tinted background).
- **Presence widget at the sidebar base** (expanded from the original one-liner to match
  shipped behavior): trigger = "ONLINE (N)" uppercase label + overlapping AvatarStack
  (24px, cap 15 with +N chip, presence dot, rich hover tooltip: display name, @username,
  current page); hidden when nobody is online; click opens the who's-online RosterDialog
  (every online user: avatar, display-name-first with @username fallback, current page).
  Data source stays the existing `/presence/ws` WebSocket (auth subprotocol, page pushed
  on route change, 5s reconnect, server dedupes by userId) — no API changes. NEW for the
  collapsed rail: the stack can't fit, so show a compact count badge (users icon + N,
  tooltip "N online") opening the same dialog.
- Sidebar nav badges (NavBadge) must survive the collapsed rail (dot or mini-count on the
  icon).
- Mobile: sidebar becomes a Sheet drawer; 56px hamburger header.
- Every admin page uses PageHeader (breadcrumb + Cinzel title + actions).
- App-version display: the Settings About card keeps "Version {NEXT_PUBLIC_APP_VERSION}"
  (mono, sourced from the next.config.ts env injection); optionally mirror a small mono
  version line in the sidebar footer (additive, not required).
- Full-screen shell states (protected layout): the auth-sync `Loading...` text state
  becomes a branded loading state (skeleton or lion mark — the no-`Loading...`-text rule
  applies to the shell too); the generic "Sync Failed" full-screen (Retry + Sign out) and
  the `ACCOUNT_DISABLED` / `NOT_IN_GUILD` full-screens are preserved and restyled.
- Middleware note: `middleware.ts` does not gate several newer routes (`/seeding`,
  `/discord-users`, `/users/*`, `/seeding-tracker`) — a pre-existing inconsistency;
  page-level permission gating is authoritative today. Decide per wave whether to align
  middleware coverage (defense-in-depth) — documenting it here so "same permission
  gating" verification doesn't mistake it for a regression.

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
  offscreen. Implementation is vanilla canvas in a client component,
  `requestAnimationFrame` paused when the hero leaves the viewport.
- Live telemetry strip pinned to the hero base: Main server (players/map), Battle
  server (players/map), Admins on duty, Last match result — mono values, pulsing
  status dots, 30s refresh. Replaces `components/live-snapshot.tsx` (same
  `getServerStatus`/`getAdminTeamCount` data source; tile set goes from 3 aggregate
  tiles to these 4; delete live-snapshot after Phase 1).

Sections below the hero, each a one-time scroll reveal: Servers (two connection cards
with live status) -> Recent Matches (last 3, graded map thumbnails) -> How Whitelist
Works (3 steps) -> Discord CTA.

### Other public pages

`/server`, `/matches`, `/ticket/[uuid]`, `/ticket/legacy/[uuid]`, `/prospect/[uuid]`,
`/login`, `/signout`, `/privacy`, `/terms` rebuilt on the design system with the same
information architecture as today. Match cards and map thumbnails get the graded-image
treatment. Login page gets the lion + ember treatment at reduced intensity.

**Blocker to resolve before Phase 1 rebuilds `/server`**: its Connect flow calls
`createLobby()` -> API `POST /lobby` -> the decommissioned lobby-service. Decide whether
the flow is removed or gets a new backend; "same IA as today" cannot include a dead
button. (This is the public-side twin of the lobby-monitor removal.) **Default if
undecided when Phase 1 starts**: remove the lobby-backed Connect flow — the service is
already dead, so today's button is broken and removal is the no-regression baseline;
the wave ships in one release either way.

**Global error/404 pages** (`app/error.tsx`, `app/not-found.tsx`): render OUTSIDE both
shells directly under the root layout; today they hand-roll legacy utilities
(noise-overlay, geo-line, glow-button) and hover glow shadows the restyle signature
forbids. Rebuilt on the design system in Phase 1, in both themes. `error.tsx`'s
client-error auto-logging via `lib/log-actions` must be preserved.

Theme toggle: today it exists ONLY on `/settings` (the original spec's claim of a public
footer toggle was wrong). Decision: keep the settings toggle as the primary; adding a
public-footer toggle is optional new Phase 1 work, not a migration.

## 5. Admin pages

All protected pages migrate onto the design system in waves (section 8). Migration is a
reskin plus structural cleanup — data fetching, permissions, and behavior are unchanged.

Page-specific notes (updated to the 2026-07-05 baseline):

- **Dashboard** (Phase 2) — no longer a simple reskin; it is now the densest
  member-facing page (~1,300 lines across page + player-stats-section): profile header
  card (identity cluster Discord/Steam/EOS/Country/DOB with read-only FieldTips, roles,
  inline Steam-link form, birthday privacy toggles opt-out/show-age), admin
  **BirthdayAdminCard** (enable/channel/postTime/timezone behind `manage:discord-bot` —
  locked decision: it lives on /dashboard, not /settings or /discord-bot; first consumer
  of ConfigCard + TimezoneCombobox + Switch), personal Squad stats section (recharts
  area/line charts, grouped StatTiles, 7D/30D/90D/All ToggleGroup, InfoTips, two designed
  nudge empty states), server cards (multi-series sparkline + CapacityBar + queue badge),
  quick stats, recent matches. Note: the 2026-06-17 profile-card spec's Activity/Seed-time
  row was never implemented (no `/playtime/me`) — do not assume it exists. Inline
  "Saved."/error spans -> Sonner; native accent-checkboxes -> Switch.
- **Whitelist** (Phase 2) — 2,663 lines (was 2,446 at the fork point); decomposed during
  migration into
  focused components (toolbar, entries table, entry profile modal, candidates queue,
  admin groups, clans, activity log) on DataTable/FilterBar, plus the sub-features that
  landed since: activity readable-diff detail (AuditDetail renderer: WL_DETAIL_LABELS,
  id->name resolution, from->to rows, show-raw toggle), resolved `addedByName` for
  bot/system actors (never a raw snowflake — "Royal Secretary Bot", "Seed Tracker",
  "SL Reward"), Requests-tab pending-count badge, import modal with dupe-classification
  preview (ImportPreview), SFTP-sync status toggle, server tab switcher. Identical
  behavior, verified feature-by-feature. Deactivated entries stay invisible (API-filtered).
- **Live Server** (Phase 2) — now a two-route tabbed group: Monitor + **Console**
  (`/live-server/console`, RCON terminal shipped v1.3.0). Console: TerminalPane +
  ConnectionStatus/ServerScope + Command-based autocomplete over the shared ~40-command
  Squad dataset + AlertDialog destructive confirms (replacing `window.confirm`) + a
  styled permission-denied state (today a bare red div). Monitor keeps its Ban /
  Change-layer-now / Restart-match actions (legacy Modal -> Dialog). Permission nuance:
  `manage:rcon-console` is standalone-sufficient (API admits such users to the WS), so
  the sidebar Live Server item must ALSO accept `manage:rcon-console` or standalone
  console users have no navigation path — a gating alignment fix within the
  same-permissions rule. Both routes ship together.
- **Tickets** (Phase 2) — **rescoped to read-only**: list + filters + expandable detail
  (timeline, transcript) + .txt export (DownloadButton). All close/escalate/reopen/
  force-close actions AND their API route were deleted (1794ee6); ticket lifecycle is
  bot-only. Do not verify against or re-add action buttons; no bulk-action bar needed.
- **Seeding** (`/seeding`, Phase 3) — consolidated page replacing the old tracker route +
  discord-bot Seeding tab: staff view (LiveStatusCard, leaderboard with rank/pulse/drill-in,
  search, player detail) + manager sections (18-field seeding_config form — every non-id
  `SeedingConfig` field incl. the roleIds chip editor and the 2026-06-17 additions
  `appreciationChannelId` and `minProgressionDays` — Announcer/Tracker server dropdowns,
  Send-now/rapport broadcast confirms, session history, HourlyChart/WeekdayChart). Budget as a LARGE Phase 3 item (form kit + drill-in
  pattern are the real work). The `/seeding-tracker` redirect stub is deleted (or moved to
  a next.config redirect) during this wave. The discord-bot page's seeding scope is only
  the compact overview card.
- **Members** (Phase 3) — behavior-preservation requirements: disable/enable confirm with
  REQUIRED reason input, the whitelist-removal warning line ("This will also remove their
  in-game whitelist (restored if re-enabled).") in BOTH single and bulk confirms,
  developer-only gating on disable/enable, "Account Disabled" info panel (since + reason +
  Enable) in detail view, disabled-row de-emphasis (pill + opacity), EOS IDs as mono
  copyable values (auto-populated by the daily backfill job; no admin UI exists or is
  planned), presence dot on avatars.
- **Users** (Phase 3) — `/users/[id]` AND `/users/by-steamid/[steamId]` migrate together
  (shared UserProfileContent; near-zero extra cost).
- **API Docs** (Phase 3, new inventory item) — **third-party-embed exemption policy**:
  swagger-ui-react ships its own global CSS and is out of scope for full theming.
  Redesign only the page chrome (PageHeader + token surface replacing the hardcoded
  `bg-white`), optionally add a minimal dark-legibility CSS override; developer-only.
- **Lobby Monitor** — **REMOVED, not migrated** (Phase 3 cleanup): page, NAV_ITEMS
  "Lobby API" entry, BOTH middleware references (the matcher AND the `PROTECTED_PATHS`
  array), api-client lobby functions. The public `POST /lobby` endpoint's fate is decided
  with the `/server` Connect flow (see section 4) — one of the two sanctioned API
  carve-outs listed in Non-goals, or it is deferred to a companion change.
- **Match Manager** (Phase 3) — one of the two legacy `data-table.tsx` consumers; its
  inline row editing (date/text inputs + WIN/LOSS/DRAW select swapped into cells),
  per-row hide toggle, and Resync action define the DataTable inline-edit requirement
  (section 2). Nav label becomes "Match Manager".
- **SquadJS Config** (Phase 3) — first consumer of JsonEditorField (per-plugin JSON
  textarea with live validation) and ConfigDiffDialog (Review Changes before/after
  confirm-save).
- Remaining Phase 3 pages (discord-users, discord-bot, roles, audit-logs, settings):
  reskin + structural cleanup as originally specified. Settings must preserve the
  Version display. Audit-logs adopts the AuditDetail renderer and the date-range
  FilterBar fields.

## 6. Motion

Choreographed restraint:

- Landing: one-time scroll-triggered reveals (fade/rise, staggered ~80ms), ember hero,
  count-up on telemetry numbers (initial load only — never on background refresh),
  pulsing live dots.
- Admin: micro-transitions only (hover, focus, dialog open, sidebar collapse), all
  150-200ms ease-out (the current shell already matches this ethos).
- CSS-first; the only JS animations are the hero ember canvas and recharts' (disabled)
  built-ins. No dedicated animation library.
- `prefers-reduced-motion`: all non-essential motion disabled, ember canvas replaced
  by static logo, chart animations stay off.

## 7. Theming and accessibility

- Both themes ship for every component and page; the theme toggle lives on /settings
  (public-footer toggle optional, additive).
- Contrast: all text/background pairs meet WCAG AA in both themes (bronze `#8a7430`
  exists because gold `#c8a84e` fails on ivory; light muted is `#6a6353` after the
  Phase 0 contrast audit).
- Focus: visible gold focus rings everywhere; all interactive widgets are the
  **Base UI**-based shadcn primitives (keyboard nav, focus traps, ARIA solved at the
  base). Native `window.confirm`/`alert` are banned.
- a11y specifics carried from the Phase 0 review: Sparkline aria-label conveys trend;
  StatusBadge pulse dot is `aria-hidden`; PageHeader breadcrumb wrapped in
  `<nav aria-label="Breadcrumb">`; FilterBar chips use `role="list"`; skeleton regions
  use `role="status"` + sr-only labels (already the mainline skeleton convention).
- Touch targets minimum 40px on mobile surfaces despite compact desktop density.

## 8. Rollout

Foundation first, then waves. Each wave ships with a semver minor bump (project
convention) via the repo's actual deploy flow: Railway auto-deploys from the
`origin/production` branch (which feeds both staging and prod); `origin/main` is stale —
do not target it.

### Phase 0 — Foundation: DONE (stranded) + reconciliation required

Phase 0 was fully implemented 2026-06-11 (10 commits on the stranded local `production`
branch, tip `887b5cc`): tokens + parchment + shadcn bridge, Base UI component set (18
primitives + the hand-written Sonner wrapper), composites with tests, both shells, theme
hook/toggle, self-hosted fonts, bun test infra, `/design` gallery. It must be reconciled
onto current mainline:

- **Branch hygiene first — the name collision is a footgun**: the stranded local branch
  is named `production`, the same name as the Railway deploy branch. Pin the stranded
  work by SHA immediately (`git branch phase0-foundation 887b5cc`) and use that ref in
  every command below; then the local `production` ref can be reset to `origin/production`
  without losing anything. Do all reconciliation on a dedicated integration branch off
  current mainline — do NOT push to `origin/production` until the result is meant to
  deploy (pushing it auto-deploys staging AND prod on Railway).
- **Merge the birthday branch into the integration branch first** so the dashboard wave
  has one target, then reapply Phase 0 in ONE pass (`git merge phase0-foundation` or
  squash-apply `git diff b5a5b56..887b5cc`) — NOT a commit-by-commit rebase (4 of the 10
  commits touch package metadata and would re-conflict repeatedly). A `git merge-tree`
  dry run confirms only 4 conflicting files, all metadata: `.gitignore` (union), root
  `package.json` (version only — discard the stale 1.2.0, bump minor over current
  mainline), `packages/web/package.json` (union: keep mainline's recharts AND mainline's
  version field, add the 16 Phase 0 deps + the `test` script), `bun.lock` (regenerate via
  `bun install`, never hand-merge). All design-system files auto-merge cleanly.
- Post-merge: `bun test` in packages/web (8 test files must pass: data-table, filter-bar,
  nav-config, search-input, smoke, sparkline, status-badge, use-theme), `bunx tsc
  --noEmit`, dev-smoke `/design` and legacy pages in both themes. Local `next build`
  fails on this Windows box (EPERM symlink, known) — production builds are verified in
  Docker/CI.
- Post-merge deltas from this revision: delete `ui/skeleton.tsx` (mainline skeleton
  system is canonical) and `confirm-dialog.tsx` (dead code); port loading/skeletonRows +
  expandable rows into data-table-v2; add controlled-value support to search-input-v2;
  add Switch + ToggleGroup primitives; build the chart-token bridge.
- Anything on the stranded branch that touches data access predates REST v1 — all data
  access now goes through the current api-client (v1 paths, PATCH, envelopes); audit for
  stale calls during reconciliation (Phase 0 is UI-only, so exposure is minimal).

### Phase 1 — Public

Landing (hero, embers, telemetry strip replacing LiveSnapshot — LiveSnapshot deleted in
this wave), server (Connect/lobby decision applied — default is removal, see section 4),
matches, ticket/prospect views (incl. the DiscordEmbed treatment), login/signout,
privacy/terms, global error/404 pages, PublicHeader rollout (deletes 8 hand-rolled page
headers), footer cleanup (tech links removed), cookie-consent restyle. The public face
flips in one release.

### Phase 2 — Admin workhorses

Dashboard (see section 5 scope — includes birthday cards, personal stats, chart theming),
whitelist (decomposition incl. AuditDetail/ImportPreview), live-server (Monitor +
Console together, incl. the `manage:rcon-console` sidebar gating fix), tickets
(read-only + export).

### Phase 3 — Remaining admin + cleanup

Members (disable-flow preservation), discord-users, users/[id] + users/by-steamid,
match-manager, seeding (large — see section 5), discord-bot, squadjs-config, roles,
audit-logs, settings (version display preserved), api-docs (chrome-only), **lobby-monitor
removal**, `/seeding-tracker` stub deletion, dead-code removal: legacy `data-table.tsx` /
`search-input.tsx` / `modal.tsx` / page-local sparklines (+ the `-v2` renames to
canonical), and all dead legacy CSS (`live-snapshot.tsx` was already deleted in Phase 1).

Mixed old/new styling is acceptable on admin pages only, between phases 1 and 3.

### Verification per page

Each migrated page is checked against the current production page: same data displayed,
same actions available, same permission gating, both themes, mobile + desktop,
loading/empty/error states. No functional regressions — visual and structural only.

Additional contract checks (post-REST-v1 baseline):

- Deletes resolve via 204 (no body); edits use PATCH partials; async bot actions
  (seeding send-now/rapport) surface 202-accepted feedback; paginated surfaces consume
  `{items,total,page,limit,hasNext}`; whitelist/tickets lists remain bare arrays (a
  documented judgment call — upgrading whitelist's endpoint to the Paginated envelope
  during decomposition is a coordinated API+web decision, not a default); dates render
  from ISO-or-null.
- Error surfacing: Sonner renders the envelope's guaranteed string; `ACCOUNT_DISABLED` /
  `NOT_IN_GUILD` full-screen states preserved exactly.
- Skeletons: initial-load-only gating verified per page; background refresh keeps stale
  data on screen.
- Permission edge cases: standalone `manage:rcon-console` reaches the console;
  `view:seeding-tracker` reads seeding live-status; disabled members never appear as
  whitelist candidates.
- Per-page field checklists for form-heavy migrations (seeding: all 18 config fields
  incl. roleIds, appreciationChannelId, minProgressionDays; members: warning copy
  verbatim; dashboard: birthday toggle optimistic-revert flows).
- Global states: error/404 pages render in both themes; error.tsx auto-logging preserved;
  shell auth-sync states (branded loading, Sync Failed, ACCOUNT_DISABLED, NOT_IN_GUILD)
  intact.

## Non-goals

- No FURTHER API changes: REST v1 (`docs/rest-v1-migration-spec.md`, shipped v2.0.0) is
  the frozen baseline the redesign builds on. Sole sanctioned carve-outs: lobby route
  removal (with the /server Connect decision) and the optional whitelist pagination
  upgrade — both explicit decisions, not defaults.
- No changes to the data model, auth, or permissions (the console sidebar-gating
  alignment is a UI fix, not a permission change).
- No new features introduced BY the migration itself; features that landed between
  2026-06-11 and this revision (console, seeding page, personal stats, birthday,
  presence roster, member-disable) are in scope as migration targets, not additions.
- No SSR/data-fetching rearchitecture: the current pattern — REST v1 api-client +
  use-async-data/use-auto-refresh/use-crud-state client-side fetching — stays.
- No virtualized tables in this pass (noted as a future improvement for whitelist at
  scale).
- The Squad-screenshot capture itself (RB supplies images; the design ships with the
  grading treatment and abstract fallback).

## Appendix: route inventory (2026-07-05 baseline)

| Route | Group | Wave | Notes |
|---|---|---|---|
| `/` | public | 1 | hero/embers/telemetry |
| `/server` | public | 1 | blocked on Connect/lobby decision |
| `/matches` | public | 1 | |
| `/ticket/[uuid]`, `/ticket/legacy/[uuid]` | public | 1 | |
| `/prospect/[uuid]` | public | 1 | |
| `/privacy`, `/terms` | public | 1 | |
| `error.tsx`, `not-found.tsx` | global | 1 | outside shells; keep error auto-logging |
| `/login`, `/signout` | auth | 1 | reduced-intensity ember |
| `/dashboard` | protected | 2 | densest page; birthday cards |
| `/whitelist` | protected | 2 | 2,663 lines; decomposition |
| `/live-server` + `/live-server/console` | protected | 2 | ship together |
| `/tickets` | protected | 2 | read-only + export |
| `/members` | protected | 3 | disable-flow preservation |
| `/discord-users` | protected | 3 | |
| `/users/[id]` + `/users/by-steamid/[steamId]` | protected | 3 | shared UserProfileContent |
| `/seeding` | protected | 3 | large item |
| `/seeding-tracker` | protected | 3 | redirect stub — delete |
| `/match-manager` | protected | 3 | label becomes "Match Manager"; inline row-edit pattern |
| `/discord-bot` | protected | 3 | seeding tab already gone |
| `/squadjs-config` | protected | 3 | JsonEditorField + ConfigDiffDialog |
| `/roles` | protected | 3 | |
| `/audit-logs` | protected | 3 | adopts AuditDetail |
| `/settings` | protected | 3 | keep Version display |
| `/api-docs` | protected | 3 | chrome-only; embed exemption |
| `/lobby-monitor` | protected | 3 | REMOVE |
| `/design` | dev-only | 0 | server-gated gallery (exists on stranded branch) |

# Team Balancer — Attribution, Broadcasts & Audit

**Date:** 2026-07-10
**Status:** Approved — ready for implementation plan
**Repos touched:** `SquadJS-Royal-battalion` (plugin + configs), `RoyalBattalionWebpage` (API + web)

## Goal

Make a queued team balance **attributable**: the triggering admin's Discord **display name** is broadcast in-game, shown on every admin's website pill, and recorded in the audit log — for queue, cancel, and execution.

## Background — what already exists (do not rebuild)

The Team Balancer is live on prod. Reading the deployed code:

- **SquadJS** `squad-server/plugins/team-balancer.js` already has `_apiMethods`: `getBalancePlan`, `queueBalance(requestedBy)`, `cancelBalance()`, `getBalanceStatus()`. `queueBalance` already broadcasts `this.options.msgQueued` and emits `BALANCE_QUEUE_EVENT {action:'queued', requestedBy, timestamp}`. `cancelBalance` broadcasts `msgCancelled` and emits `{action:'cancelled', requestedBy}`. `onRoundEnded` applies the balance and emits `{action:'executed', requestedBy, team1Count, team2Count, playersMoved}` or `{action:'failed', error}`.
- **Webpage API** (`packages/api/src/ws/live-server.ts`) already handles `previewbalance`, `queuebalance`, `cancelbalance` (all gated on `manage:balance-teams`), calls the SquadJS methods, and already writes audit rows `rcon.queuebalance` / `rcon.cancelbalance` (with empty `{}` detail, actor = username). `packages/api/src/lib/squadjs-socket.ts` relays `BALANCE_QUEUE_EVENT`, maintains `state.balanceStatus`, and pushes it to all web clients (same fan-out as the randomizer).
- **Webpage web** (`packages/web/app/(protected)/live-server/page.tsx`) already renders a real-time pending pill (`Balance queued` + Cancel) that appears for every admin with the permission, plus a preview modal. `handle-game-event.ts` and `lib/types.ts` already carry `BalanceStatus`/`BalancePlan`.

So real-time cross-client sync, role-gated cancel-by-anyone, the broadcasts, and basic audit **already work**. The gaps are purely **attribution + wording + audit richness**.

## Decisions (locked)

1. **In-game broadcasts name the admin publicly** (all players see it), in addition to website + audit.
2. **Queue broadcast wording:** `A team balance triggered by {name} will take effect next round`.
3. **Cancel broadcast wording:** `The queued team balance was cancelled by {name}` — `{name}` is the **canceller** (who may differ from the queuer).
4. **Audit detail = attribution only:** queue → `{ displayName }`; cancel → `{ displayName, originalRequester }`.
5. **Audit execution + failure too** (new rows), actor = a synthetic `SquadJS` system actor.
6. **Website pill:** `Balance queued by {name} · {age}` (e.g. "3m ago"), refreshed while pending.
7. **Attribution value** everywhere = Discord **display name**, falling back to username when the user has no display name set.
8. **Skill explainer:** staff/internal version (precise). Included at the end of this spec.

## Component design

### 1. SquadJS plugin — `squad-server/plugins/team-balancer.js`

**Option defaults (`optionsSpecification`):**
- `msgQueued` default → `'A team balance triggered by {requestedBy} will take effect next round'`
- `msgCancelled` default → `'The queued team balance was cancelled by {cancelledBy}'`
- (`msgStart`, `msgComplete`, `msgError` unchanged.)

**`queueBalance(requestedBy = 'an admin')`:** interpolate the name into the broadcast:
```js
await this.server.rcon.broadcast(applyTemplate(this.options.msgQueued, { requestedBy })).catch(() => {})
```
(Event payload and return unchanged — already carries `requestedBy`.)

**`cancelBalance(cancelledBy = 'an admin')`:** gains the canceller param; broadcasts with it; **returns the original requester** so the API can audit it:
```js
async cancelBalance(cancelledBy = 'an admin') {
  if (!this.pendingBalance) return { success: false, error: 'No balance is queued' }
  const cancelled = { ...this.pendingBalance }
  this.pendingBalance = null
  await this.server.rcon.broadcast(applyTemplate(this.options.msgCancelled, { cancelledBy })).catch(() => {})
  this.server.emit('BALANCE_QUEUE_EVENT', {
    action: 'cancelled',
    requestedBy: cancelled.requestedBy,   // original queuer (unchanged)
    cancelledBy,                           // new
    timestamp: new Date().toISOString()
  })
  return { success: true, originalRequester: cancelled.requestedBy }
}
```

**`_apiMethods.cancelBalance`** registration passes the arg through:
```js
this.server._apiMethods.cancelBalance = async (cancelledBy) => this.cancelBalance(cancelledBy)
```

**`onRoundEnded` failure emit** gains `requestedBy` so failures are attributable:
```js
this.server.emit('BALANCE_QUEUE_EVENT', {
  action: 'failed',
  requestedBy: pending.requestedBy,   // new
  error: error.message,
  timestamp: new Date().toISOString()
})
```
(The `executed` emit already includes `requestedBy`, `team1Count`, `team2Count`, `playersMoved` — no change.)

**Name safety:** interpolation must be `$`-safe (display names can contain `$`) and single-line. Use the helper below.

### 2. SquadJS pure helper — `squad-server/utils/apply-template.js` (+ test)

```js
// Replace {key} tokens with vars[key]. Function-replacement => values are literal
// (a `$` in a display name is NOT treated as a regex replacement token).
export function applyTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
  )
}
```
Unit-tested (`apply-template.test.js`) using the same test framework as `squad-server/utils/balancer-core.test.js`. Cases: basic substitution; unknown token left intact; value containing `$&`/`$1` stays literal; non-string value coerced.

### 3. SquadJS configs

`config.squadjs-production.json` and `config.squadjs-staging.json`: if the `TeamBalancer` block sets explicit `msgQueued`/`msgCancelled`, update them to the placeholder strings above (a frozen literal without `{requestedBy}`/`{cancelledBy}` would suppress the name). If absent, the new defaults apply. Regenerate `config.json` via the normal `build-all` (pre-commit hook) — never hand-edit generated output.

### 4. Webpage API — `packages/api/src/ws/live-server.ts`

Resolve the attribution once per handler: `const actor = ws.data.displayName ?? ws.data.userName`.

- **`queuebalance`:** call `queueBalance` with `actor` (not `ws.data.userName`); audit `rcon.queuebalance` with detail `{ displayName: actor }`.
- **`cancelbalance`:** call `cancelBalance` with `actor`; use the returned `originalRequester`; audit `rcon.cancelbalance` with detail `{ displayName: actor, originalRequester: cbResult.originalRequester }`.

Confirm `WSData` includes `displayName` (the WS auth in `packages/api/src/index.ts` already returns it); add it to the type if missing.

### 5. Webpage API — `packages/api/src/lib/squadjs-socket.ts` (execution/failure audit)

In the `BALANCE_QUEUE_EVENT` case, after updating `state.balanceStatus`, write audit rows for the terminal actions (import `auditDirect` from `./audit`):
- `executed` → `auditDirect('system', 'SquadJS', 'rcon.balanceexecuted', 'LiveServer', key, { originalRequester: bqe.requestedBy, team1Count: bqe.team1Count, team2Count: bqe.team2Count, playersMoved: bqe.playersMoved })`
- `failed` → `auditDirect('system', 'SquadJS', 'rcon.balancefailed', 'LiveServer', key, { originalRequester: bqe.requestedBy, error: bqe.error })`

`queued`/`cancelled` are **not** audited here (already audited web-side — avoid double-logging). Wrap the audit calls so a DB error can't break event relay (`auditDirect` is fire-and-forget; confirm it swallows/logs its own errors, else wrap in try/catch). Confirm `AuditLog.userId` is a plain string column (no FK), so `'system'` is valid.

### 6. Webpage web — `packages/web/app/(protected)/live-server/page.tsx`

Pending pill: replace the static `Balance queued` text with `Balance queued by {balanceStatus.requestedBy} · {age}` where `age` is a relative label derived from `balanceStatus.requestedAt`. `requestedBy` now carries the display name end-to-end. Add:
- A pure `formatRelativeAge(fromIso, nowMs)` helper (unit-tested): `<1m` → "just now", `<60m` → "Nm ago", else "Hh Mm ago".
- A 30s `setInterval` (in a `useEffect`) that bumps a `nowMs` state **only while `balanceStatus?.pending`**, cleared otherwise, so the age ticks without a permanent timer.

Fall back gracefully if `requestedBy` is missing (`Balance queued`).

## End-to-end data flow

```
Admin clicks Queue (web)
  page.tsx sendAction{queuebalance}
    API live-server.ts: actor = displayName ?? userName
      squadjsSocket.callMethod("queueBalance", actor)
        plugin: pendingBalance={requestedBy:actor}; broadcast "…triggered by <actor>…"; emit BALANCE_QUEUE_EVENT{queued, requestedBy:actor}
      API audit rcon.queuebalance {displayName:actor}
    plugin event → API squadjs-socket: balanceStatus={pending, requestedBy:actor, requestedAt}
      broadcast to ALL web clients → every pill shows "Balance queued by <actor> · age"

Any admin clicks Cancel → same path via cancelBalance(actor); broadcast "…cancelled by <actor>"; audit {displayName:actor, originalRequester}

Round end (SquadJS) → plugin applies moves; emit executed/failed(requestedBy)
  API squadjs-socket: balanceStatus=null (pill clears everywhere) + auditDirect rcon.balanceexecuted/…failed
```

## Error handling
- All broadcasts keep `.catch(() => {})`.
- `displayName` null → username fallback; both null → the plugin's default `'an admin'`.
- Audit writes never block or throw into the action/event path.

## Testing
- **Pure, unit-tested:** `applyTemplate` (SquadJS), `formatRelativeAge` (web).
- **Manual/observational:** first real queue → confirm in-game broadcast names the admin, all open admin pills show "by X · age", audit rows for queue/cancel/execute carry the display name; a second admin can cancel and the broadcast names *them*.

## Versioning & deployment
- **Webpage:** branch `feat/balance-attribution` off `origin/production` (has the live balance commit). Bump `package.json` `2.25.0 → 2.26.0`. Push `production` → Railway auto-deploy (feeds staging + prod). Verify via commit statuses + a prod probe.
- **SquadJS:** make changes on `master`; deploy `git push origin master:main` (staging), then merge `master` → `production` (prod). Bump SquadJS `package.json` patch. No new slash commands; no schema change.
- No new permission (reuses `manage:balance-teams`).

## Out of scope (YAGNI)
- No cancel-confirmation dialog (re-queue is trivial).
- No logging the preview plan in audit (preview differs from the round-end recompute).
- No new config/permission surface beyond the two message strings.

---

## Staff explainer (internal — how skill is computed)

> **How the Team Balancer picks "skill"**
> Each player gets a skill rating from their **last 30 days** of combat on our server: **kills + 0.5×revives − 0.5×deaths − 2×teamkills**, divided by minutes played. It's a *per-minute efficiency*, so grinding hours doesn't inflate you — teamkills hurt the most.
> That rate is compared against everyone currently active and turned into a rating centered on **1.0** (an average player), spreading about ±0.5 per standard deviation and capped to the **0.4–1.6** range — a strong player sits near 1.6, a weaker one near 0.4. Anyone with under ~30 minutes in the window is treated as neutral (1.0), since there isn't enough data.
> To build teams, **recognized clans are kept together as one block** (everyone else is a free agent), then the balancer searches for the split that makes the two teams' **total skill as equal as possible** while never exceeding the 50-player cap and moving as few people as possible. It runs at **round end during map voting**, applying the switches gradually so it can't overload the server.

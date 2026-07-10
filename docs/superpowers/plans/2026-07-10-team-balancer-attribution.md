# Team Balancer Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute a queued team balance to the triggering admin's Discord display name across the in-game broadcast, every admin's website pill, and the audit log (queue, cancel, execute).

**Architecture:** The feature already works end-to-end; this adds an attribution layer. SquadJS interpolates the admin name into the queue/cancel broadcasts and passes the canceller through; the webpage sends the Discord **display name** (not username) as `requestedBy`, enriches the queue/cancel audit rows, and writes new execute/fail audit rows; the web pill shows "by {name} · {age}". One value (`requestedBy` = display name) drives all surfaces.

**Tech Stack:** SquadJS (Node ESM, `node:test`), RoyalBattalionWebpage (Bun monorepo, Hono API, Next.js 15 / React 19, Prisma, `bun test`).

## Global Constraints

- Commits: Conventional Commits, one-liner, **no AI/Co-Authored-By attribution**, no emojis.
- Never use `--no-verify`; let the SquadJS husky pre-commit hook run (it reformats via prettier and regenerates `config.json`/`README.md` — include whatever it stages).
- SquadJS code style: **semicolons**, single quotes, 100-char width, no trailing commas, ES modules (match `squad-server/utils/balancer-core.js`).
- Attribution value everywhere = `ws.data.displayName ?? ws.data.userName`. Audit **top-level actor stays the real user** (`ws.data.userName`); the display name goes in `detail`.
- Bump webpage root `package.json` `2.25.0 → 2.26.0` before deploy. **Do NOT bump SquadJS `package.json`** (it tracks the upstream `4.1.1` fork version).
- In-game broadcast copy carries no server specs, numbers, or plugin names.

## Repos & branches

- **SquadJS:** `C:\Users\OleEd\Azure\SquadJS-Royal-battalion`, work on `master` (its working branch). Verify a clean tree before starting.
- **Webpage:** worktree `C:\Users\OleEd\Azure\RB-balance-attribution`, branch `feat/balance-attribution` (already created off `origin/production`). Fresh worktree — needs a one-time `bun install`.

## File Structure

| File | Repo | Responsibility |
|---|---|---|
| `squad-server/utils/apply-template.js` | SquadJS | **New.** Pure `{token}` substitution, `$`-safe. |
| `squad-server/utils/apply-template.test.js` | SquadJS | **New.** Unit tests for the above. |
| `squad-server/plugins/team-balancer.js` | SquadJS | Modify: name in queue/cancel broadcasts; `cancelBalance(cancelledBy)`; `failed` event carries `requestedBy`. |
| `packages/web/lib/format-relative-age.ts` | Webpage | **New.** Pure "3m ago" formatter. |
| `packages/web/lib/format-relative-age.test.ts` | Webpage | **New.** Unit tests for the above. |
| `packages/api/src/ws/live-server.ts` | Webpage | Modify: pass display name; enrich queue/cancel audit detail. |
| `packages/api/src/lib/squadjs-socket.ts` | Webpage | Modify: audit `executed`/`failed`. |
| `packages/web/app/(protected)/live-server/page.tsx` | Webpage | Modify: pill shows "by {name} · {age}". |
| `package.json` (root) | Webpage | Version bump. |

---

## Task 1: SquadJS — `applyTemplate` util (TDD)

**Files:**
- Create: `C:\Users\OleEd\Azure\SquadJS-Royal-battalion\squad-server\utils\apply-template.js`
- Test: `C:\Users\OleEd\Azure\SquadJS-Royal-battalion\squad-server\utils\apply-template.test.js`

**Interfaces:**
- Produces: `applyTemplate(template: string, vars: Record<string, unknown>): string` — replaces each `{key}` with `String(vars[key])` (unknown keys left intact; `$` in values inserted literally).

Working dir: `C:\Users\OleEd\Azure\SquadJS-Royal-battalion`

- [ ] **Step 1: Write the failing test**

Create `squad-server/utils/apply-template.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplate } from './apply-template.js';

test('substitutes a known token', () => {
  assert.equal(applyTemplate('hi {name}!', { name: 'Bob' }), 'hi Bob!');
});

test('leaves unknown tokens intact', () => {
  assert.equal(applyTemplate('{a} {b}', { a: 'x' }), 'x {b}');
});

test('inserts values containing $ literally', () => {
  assert.equal(applyTemplate('{n}', { n: '$1 & $&' }), '$1 & $&');
});

test('coerces non-string values', () => {
  assert.equal(applyTemplate('{c}', { c: 42 }), '42');
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --test squad-server/utils/apply-template.test.js`
Expected: FAIL — cannot find module `./apply-template.js` (or `applyTemplate is not a function`).

- [ ] **Step 3: Implement**

Create `squad-server/utils/apply-template.js`:
```js
// Replace {key} tokens in a template with values from `vars`. Uses a function
// replacement so a `$` in a value (e.g. a Discord display name) is inserted
// literally rather than interpreted as a regex replacement token ($&, $1, ...).
export function applyTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --test squad-server/utils/apply-template.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add squad-server/utils/apply-template.js squad-server/utils/apply-template.test.js
git commit -m "feat(team-balancer): add applyTemplate util for message substitution"
```
Note: the husky hook regenerates `config.json`/`README.md` and may reformat — if it stages those, include them (re-run `git commit` if the hook amends the staging set). Do not use `--no-verify`.

---

## Task 2: SquadJS — attribute the broadcasts in the plugin

**Files:**
- Modify: `C:\Users\OleEd\Azure\SquadJS-Royal-battalion\squad-server\plugins\team-balancer.js`

**Interfaces:**
- Consumes: `applyTemplate` from Task 1.
- Produces: `cancelBalance(cancelledBy)` now returns `{ success: true, originalRequester }` (or `{ success: false, error }`); `_apiMethods.cancelBalance` accepts one arg; `BALANCE_QUEUE_EVENT` `cancelled` payload gains `cancelledBy`, `failed` payload gains `requestedBy`.

Working dir: `C:\Users\OleEd\Azure\SquadJS-Royal-battalion`

This task is integration wiring (the plugin has DB/RCON deps, no unit test); verification is the existing test suite + a syntax check.

- [ ] **Step 1: Add the import**

At the top of `team-balancer.js`, next to the existing `import { computeBalance, normalizeRatings } from '../utils/balancer-core.js';`, add:
```js
import { applyTemplate } from '../utils/apply-template.js';
```

- [ ] **Step 2: Update the two message defaults**

In `optionsSpecification`, change the `msgQueued` and `msgCancelled` defaults:
```js
      msgQueued: {
        required: false,
        description: 'Broadcast when a balance is queued for round end. Use {requestedBy}.',
        default: 'A team balance triggered by {requestedBy} will take effect next round'
      },
      msgCancelled: {
        required: false,
        description: 'Broadcast when a queued balance is cancelled. Use {cancelledBy}.',
        default: 'The queued team balance was cancelled by {cancelledBy}'
      },
```

- [ ] **Step 3: Interpolate the requester into the queue broadcast**

In `queueBalance`, replace the broadcast line:
```js
    await this.server.rcon.broadcast(this.options.msgQueued).catch(() => {});
```
with:
```js
    await this.server.rcon
      .broadcast(applyTemplate(this.options.msgQueued, { requestedBy }))
      .catch(() => {});
```

- [ ] **Step 4: Give `cancelBalance` a canceller and a return value**

Replace the whole `cancelBalance` method with:
```js
  async cancelBalance(cancelledBy = 'an admin') {
    if (!this.pendingBalance) return { success: false, error: 'No balance is queued' };

    const cancelled = { ...this.pendingBalance };
    this.pendingBalance = null;

    await this.server.rcon
      .broadcast(applyTemplate(this.options.msgCancelled, { cancelledBy }))
      .catch(() => {});

    this.server.emit('BALANCE_QUEUE_EVENT', {
      action: 'cancelled',
      requestedBy: cancelled.requestedBy,
      cancelledBy,
      timestamp: new Date().toISOString()
    });

    return { success: true, originalRequester: cancelled.requestedBy };
  }
```

- [ ] **Step 5: Pass the canceller through the API method registration**

In `mount()`, replace:
```js
    this.server._apiMethods.cancelBalance = async () => this.cancelBalance();
```
with:
```js
    this.server._apiMethods.cancelBalance = async (cancelledBy) => this.cancelBalance(cancelledBy);
```

- [ ] **Step 6: Attribute the failure event**

In `onRoundEnded`, in the `catch` block, replace the failed emit:
```js
      this.server.emit('BALANCE_QUEUE_EVENT', {
        action: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
```
with:
```js
      this.server.emit('BALANCE_QUEUE_EVENT', {
        action: 'failed',
        requestedBy: pending.requestedBy,
        error: error.message,
        timestamp: new Date().toISOString()
      });
```

- [ ] **Step 7: Verify syntax + tests still pass**

Run: `node --check squad-server/plugins/team-balancer.js`
Expected: no output (valid).
Run: `node --test squad-server/utils/apply-template.test.js squad-server/utils/balancer-core.test.js`
Expected: PASS — all tests (4 + 10), 0 failures.

- [ ] **Step 8: Commit**

```bash
git add squad-server/plugins/team-balancer.js
git commit -m "feat(team-balancer): name the triggering/cancelling admin in broadcasts"
```
(Let the hook run; include any regenerated `config.json`/`README.md`.)

---

## Task 3: Webpage — worktree setup + `formatRelativeAge` helper (TDD)

**Files:**
- Create: `C:\Users\OleEd\Azure\RB-balance-attribution\packages\web\lib\format-relative-age.ts`
- Test: `C:\Users\OleEd\Azure\RB-balance-attribution\packages\web\lib\format-relative-age.test.ts`

**Interfaces:**
- Produces: `formatRelativeAge(fromIso: string, nowMs: number): string` — `""` for invalid input, `"just now"` (<60s), `"Nm ago"` (<60m), `"Hh Mm ago"` / `"Hh ago"` otherwise.

Working dir: `C:\Users\OleEd\Azure\RB-balance-attribution`

- [ ] **Step 1: One-time worktree install** (needed for later typechecks; the pure test below doesn't require it)

Run: `bun install`
Expected: completes; a `node_modules` now exists in the worktree.

- [ ] **Step 2: Write the failing test**

Create `packages/web/lib/format-relative-age.test.ts`:
```ts
import { test, expect } from "bun:test";
import { formatRelativeAge } from "./format-relative-age";

const base = Date.parse("2026-07-10T12:00:00.000Z");

test("under a minute => just now", () => {
  expect(formatRelativeAge("2026-07-10T11:59:30.000Z", base)).toBe("just now");
});

test("minutes", () => {
  expect(formatRelativeAge("2026-07-10T11:57:00.000Z", base)).toBe("3m ago");
});

test("hours and minutes", () => {
  expect(formatRelativeAge("2026-07-10T10:23:00.000Z", base)).toBe("1h 37m ago");
});

test("exact hour omits minutes", () => {
  expect(formatRelativeAge("2026-07-10T10:00:00.000Z", base)).toBe("2h ago");
});

test("invalid input => empty string", () => {
  expect(formatRelativeAge("not-a-date", base)).toBe("");
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `bun test packages/web/lib/format-relative-age.test.ts`
Expected: FAIL — cannot resolve `./format-relative-age`.

- [ ] **Step 4: Implement**

Create `packages/web/lib/format-relative-age.ts`:
```ts
// Human "time ago" label for a past ISO timestamp given the current epoch ms.
// Pure (nowMs injected) so it is unit-testable and deterministic.
export function formatRelativeAge(fromIso: string, nowMs: number): string {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `bun test packages/web/lib/format-relative-age.test.ts`
Expected: PASS — 5 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/format-relative-age.ts packages/web/lib/format-relative-age.test.ts
git commit -m "feat(live-server): add formatRelativeAge helper"
```

---

## Task 4: Webpage API — display-name attribution + audit detail

**Files:**
- Modify: `C:\Users\OleEd\Azure\RB-balance-attribution\packages\api\src\ws\live-server.ts` (the `queuebalance` and `cancelbalance` cases in `handleAdminAction`)

**Interfaces:**
- Consumes: `ws.data.displayName` (`WSData.displayName: string | null`, already defined in `packages/api/src/ws/types.ts`); the plugin's `cancelBalance` return `{ originalRequester }` from Task 2; existing `auditDirect(userId, userName, action, resource, resourceId?, detail?)` from `packages/api/src/lib/audit.ts`.

Working dir: `C:\Users\OleEd\Azure\RB-balance-attribution`

- [ ] **Step 1: Update `queuebalance`**

Replace the `case "queuebalance": { ... }` block with:
```ts
      case "queuebalance": {
        if (!hasPermission(ws, "manage:balance-teams")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:balance-teams permission required" }));
          return;
        }
        const actor = ws.data.displayName ?? ws.data.userName;
        const qbResult = await squadjsSocket.callMethod(serverKey, "queueBalance", actor) as { success?: boolean; error?: string };
        if (qbResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: qbResult.error || "Queue failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.queuebalance", "LiveServer", serverKey, { displayName: actor });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "queuebalance", data: qbResult }));
        break;
      }
```

- [ ] **Step 2: Update `cancelbalance`**

Replace the `case "cancelbalance": { ... }` block with:
```ts
      case "cancelbalance": {
        if (!hasPermission(ws, "manage:balance-teams")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:balance-teams permission required" }));
          return;
        }
        const actor = ws.data.displayName ?? ws.data.userName;
        const cbResult = await squadjsSocket.callMethod(serverKey, "cancelBalance", actor) as { success?: boolean; error?: string; originalRequester?: string };
        if (cbResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: cbResult.error || "Cancel failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.cancelbalance", "LiveServer", serverKey, { displayName: actor, originalRequester: cbResult.originalRequester ?? null });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "cancelbalance", data: cbResult }));
        break;
      }
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/ws/live-server.ts
git commit -m "feat(live-server): attribute balance queue/cancel to Discord display name"
```

---

## Task 5: Webpage API — audit execution and failure

**Files:**
- Modify: `C:\Users\OleEd\Azure\RB-balance-attribution\packages\api\src\lib\squadjs-socket.ts` (the `case "BALANCE_QUEUE_EVENT"` block + imports)

**Interfaces:**
- Consumes: `BALANCE_QUEUE_EVENT` payloads from Task 2 (`executed` carries `requestedBy, team1Count, team2Count, playersMoved`; `failed` carries `requestedBy, error`); `auditDirect`. The server-key variable in scope here is `key`.

Working dir: `C:\Users\OleEd\Azure\RB-balance-attribution`

- [ ] **Step 1: Import `auditDirect`**

At the top of `packages/api/src/lib/squadjs-socket.ts` (it currently imports only `socket.io-client`, `./env`, `./logger`), add:
```ts
import { auditDirect } from "./audit";
```

- [ ] **Step 2: Add execute/fail audit to the event handler**

Replace the `case "BALANCE_QUEUE_EVENT": { ... }` block with:
```ts
      case "BALANCE_QUEUE_EVENT": {
        const bqe = data as { action: string; requestedBy?: string; cancelledBy?: string; team1Count?: number; team2Count?: number; playersMoved?: number; error?: string; [key: string]: unknown };
        if (bqe.action === "queued") {
          state.balanceStatus = { pending: true, requestedBy: bqe.requestedBy, requestedAt: new Date().toISOString() };
        } else if (bqe.action === "cancelled" || bqe.action === "executed" || bqe.action === "failed") {
          state.balanceStatus = null;
        }
        if (bqe.action === "executed") {
          auditDirect("system", "SquadJS", "rcon.balanceexecuted", "LiveServer", key, {
            originalRequester: bqe.requestedBy ?? null,
            team1Count: bqe.team1Count ?? null,
            team2Count: bqe.team2Count ?? null,
            playersMoved: bqe.playersMoved ?? null,
          });
        } else if (bqe.action === "failed") {
          auditDirect("system", "SquadJS", "rcon.balancefailed", "LiveServer", key, {
            originalRequester: bqe.requestedBy ?? null,
            error: bqe.error ?? null,
          });
        }
        break;
      }
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/lib/squadjs-socket.ts
git commit -m "feat(live-server): audit balance execution and failure"
```

---

## Task 6: Webpage web — pill shows "by {name} · {age}"

**Files:**
- Modify: `C:\Users\OleEd\Azure\RB-balance-attribution\packages\web\app\(protected)\live-server\page.tsx`

**Interfaces:**
- Consumes: `formatRelativeAge` from Task 3; existing `balanceStatus` state (`{ pending, requestedBy?, requestedAt? }`).

Working dir: `C:\Users\OleEd\Azure\RB-balance-attribution`

- [ ] **Step 1: Import the helper**

Add to the imports at the top of `page.tsx`:
```ts
import { formatRelativeAge } from "@/lib/format-relative-age";
```

- [ ] **Step 2: Add a ticking clock (only while a balance is pending)**

Add this state near the other `useState` hooks (e.g. just after the `balanceStatus` state):
```tsx
  const [nowMs, setNowMs] = useState(() => Date.now());
```
Add this effect near the other `useEffect` hooks:
```tsx
  useEffect(() => {
    if (!balanceStatus?.pending) return;
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, [balanceStatus?.pending]);
```

- [ ] **Step 3: Update the pending pill text**

In the Balance Teams block, replace:
```tsx
                <div className="flex items-center gap-2">
                  <span className="text-xs text-warning">Balance queued</span>
                  <button
                    onClick={handleCancelBalance}
                    className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
                  >
                    Cancel
                  </button>
                </div>
```
with:
```tsx
                <div className="flex items-center gap-2">
                  <span className="text-xs text-warning">
                    {balanceStatus.requestedBy ? `Balance queued by ${balanceStatus.requestedBy}` : "Balance queued"}
                    {balanceStatus.requestedAt ? ` · ${formatRelativeAge(balanceStatus.requestedAt, nowMs)}` : ""}
                  </span>
                  <button
                    onClick={handleCancelBalance}
                    className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
                  >
                    Cancel
                  </button>
                </div>
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors. (If `tsc` reports missing `next-env.d.ts`/JSX config unrelated to this change, fall back to `bun run --filter web build` to validate.)

- [ ] **Step 5: Commit**

```bash
git add "packages/web/app/(protected)/live-server/page.tsx"
git commit -m "feat(live-server): show who queued the balance and how long ago"
```

---

## Task 7: Webpage — version bump + full build gate

**Files:**
- Modify: `C:\Users\OleEd\Azure\RB-balance-attribution\package.json`

Working dir: `C:\Users\OleEd\Azure\RB-balance-attribution`

- [ ] **Step 1: Bump the version**

In root `package.json`, change `"version": "2.25.0"` to `"version": "2.26.0"`.

- [ ] **Step 2: Full build (the real deploy gate)**

Run: `bun run build`
Expected: both `web` and `api` build successfully (this is what Railway runs).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump webpage to v2.26.0"
```

---

## Deployment (after review — run when the user approves the push)

**SquadJS** (`C:\Users\OleEd\Azure\SquadJS-Royal-battalion`, on `master`):
- Staging: `git push origin master:main` — verify via `gh run list` (staging deploy) and that the `squadjs-staging` container comes up (restarts=0, `TeamBalancer initialised`).
- Prod: `git checkout production && git merge master && git push origin production` (use a throwaway worktree if the tree is dirty), then `git checkout master`. Verify `squadjs-production` container is up.

**Webpage** (worktree `C:\Users\OleEd\Azure\RB-balance-attribution`, branch `feat/balance-attribution`):
- `git push origin feat/balance-attribution:production` (Railway auto-deploys; `production` feeds staging + prod). Verify API + web commit statuses = success and probe `royalbattalion.xyz`.
- Then remove the worktree: `git worktree remove C:\Users\OleEd\Azure\RB-balance-attribution` (from the primary repo).

**Post-deploy sanity:** queue a balance from the website → confirm the in-game broadcast names the admin ("…triggered by {name} will take effect next round"), every open admin pill shows "Balance queued by {name} · age", and audit rows appear for queue and (at round end) execute. Have a second admin cancel → broadcast/audit name that admin.

---

## Self-Review

**Spec coverage:**
- Decision 1 (public in-game name) → Task 2 (queue/cancel broadcasts interpolate the name). ✓
- Decision 2 (queue wording) → Task 2 Step 2 `msgQueued` default. ✓
- Decision 3 (cancel names canceller) → Task 2 Steps 2/4/5 (`cancelledBy`). ✓
- Decision 4 (audit detail attribution-only) → Task 4 (`{displayName}` / `{displayName, originalRequester}`). ✓
- Decision 5 (audit execute+fail) → Task 5. ✓
- Decision 6 (pill name + age) → Tasks 3 + 6. ✓
- Decision 7 (display name w/ fallback) → Task 4 (`displayName ?? userName`). ✓
- Decision 8 (staff explainer) → delivered separately (in the spec); no code task. ✓
- Config edit: **not needed** — configs omit the message options and inherit the plugin defaults (verified). No task. ✓

**Type/name consistency:** `applyTemplate` used with the same `{requestedBy}`/`{cancelledBy}` var names as the defaults; `cancelBalance` returns `{ originalRequester }` consumed in Task 4; `key` is the in-scope server id in Task 5; `formatRelativeAge(iso, nowMs)` signature matches its call in Task 6; `balanceStatus.requestedBy` now carries the display name because Task 4 passes it as `requestedBy`.

**Placeholder scan:** none — every code step shows complete code and every verify step an exact command + expected result.

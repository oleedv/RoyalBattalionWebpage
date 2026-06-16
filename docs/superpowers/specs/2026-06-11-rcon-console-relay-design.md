# RCON Console + Command Relay — Design

**Date:** 2026-06-11
**Status:** Approved (pending written-spec review)
**Area:** Webpage (`RoyalBattalionWebpage`) — live-server admin panel

## Problem

Admins want to send arbitrary in-game RCON commands to the Squad server from the
webpage admin panel. Today the live-server page can only issue a fixed set of
**structured actions** (broadcast, warn, kick, switch team/squad, disband, end
match, set next layer, demote commander, clan moves, randomize). There is no
free-form console and several common commands (ban, change-layer-now, restart
match, list disconnected) have no button.

The full relay already exists end-to-end; the missing piece is exposing it.

## Existing architecture (reused, not rebuilt)

```
Browser (live-server page)
  → WebSocket  →  API handleAdminAction  (packages/api/src/ws/live-server.ts)
    → squadjsSocket.executeRcon(serverKey, method, ...args)  (packages/api/src/lib/squadjs-socket.ts)
      → Socket.IO  →  SquadJS socket-io-api plugin
        → server.rcon.<method>(...)   (SquadRcon: execute / broadcast / warn / ban / switchTeam / getListPlayers ...)
          → Squad server RCON
```

- Auth: WS upgrade sets `ws.data.permissions`, `canManage` (`manage:live-server`
  or `developer`). `handleAdminAction` already gates on `canManage`, and
  individual actions can require an extra permission via
  `hasPermission(ws, perm)` (which `developer` always satisfies).
- `executeRcon` returns the raw RCON response string and has a 2-second dedup
  keyed on `method:args`.
- Every action is `auditDirect`-logged.

## Scope (agreed)

1. **Free-form RCON console** — type any command, see raw response. Separate
   route. Unrestricted commands, gated by a new permission.
2. **Four new dedicated buttons** — Ban, Change layer now, Restart match,
   List disconnected.
3. **Command reference** — static dataset of all ~40 Squad admin commands
   driving autocomplete + help, with destructive commands flagged + confirm.

Out of scope (explicitly deferred): standalone `POST /api/rcon` HTTP endpoint
for external automation. The backend handler is built so it could be reused for
that later, but it is not part of this work.

## Components

### 1. New permission — `manage:rcon-console`

- `packages/shared/types/roles.ts`: add `"manage:rcon-console"` to `PERMISSIONS`.
- `packages/web/app/(protected)/roles/page.tsx`: add an entry to the existing
  **Live Server** group in `PERMISSION_GROUPS`:
  - label: `RCON Console`
  - description: `Run arbitrary RCON commands via the live console`
  - The compile-time coverage check (`_allGroupedPerms`) then passes.
- Gate model:
  - The **console** action (`rcon_console`) is gated **solely** by
    `manage:rcon-console` (or `developer`). It is checked on its own and routed
    **before** the generic `canManage` early-return (the same way `ping` and
    `switch_server` already bypass it), so `manage:rcon-console` is a standalone,
    grantable capability — a user can hold it without `manage:live-server`.
    Rationale: the permission exists precisely so console access can be granted
    deliberately; requiring `manage:live-server` too would make a lone grant
    silently non-functional.
  - The **four buttons** live in the Monitor view and remain under the existing
    `canManage` (`manage:live-server`) gate, like kick/endmatch/setnextlayer.
  - Note the console (arbitrary `execute`) is strictly more powerful than the
    structured buttons; `manage:rcon-console` is therefore the more privileged
    grant and intentionally stands alone.

### 2. Backend relay extension (`packages/api/src/ws/live-server.ts`)

New actions in `handleAdminAction` (each: permission check → execute → audit →
respond):

| Action | Permission | Backend call | Returns |
|---|---|---|---|
| `rcon_console` | `manage:rcon-console` | `executeRcon(serverKey, "execute", command, { dedupe: false })` | raw response text |
| `ban` | `manage:live-server` | `executeRcon(serverKey, "ban", playerId, banLength, reason)` | ok |
| `changelayer` | `manage:live-server` | `executeRcon(serverKey, "execute", \`AdminChangeLayer ${layer}\`)` | ok |
| `restartmatch` | `manage:live-server` | `executeRcon(serverKey, "execute", "AdminRestartMatch")` | ok |
| `listdisconnected` | `manage:live-server` | `executeRcon(serverKey, "execute", "AdminListDisconnectedPlayers", { dedupe: false })` | raw response text |

Notes:
- `ban` uses SquadRcon's `ban(anyID, banLength, message)` helper (length syntax:
  `0`=perm, `1m`/`1d`/`1M` etc.). `playerId` = steamID or eosID, mirroring
  existing kick/warn.
- Console + list commands must bypass the 2s dedup so repeated reads
  (`ListPlayers`, `AdminListDisconnectedPlayers`) aren't swallowed → add an
  options arg to `executeRcon`: `executeRcon(serverKey, method, ...args, opts?)`
  where `opts.dedupe` defaults to `true`. Implementation detail: detect a
  trailing plain-object arg as options so existing call sites are unaffected.
- Response delivery: new WS message `{ type: "rcon_response", command, output,
  success }` so the console can render command + raw output. Button actions keep
  using `action_result`.
- Audit: `auditDirect(userId, userName, "rcon.console", "LiveServer", serverKey,
  { command })` for the console; `rcon.ban` / `rcon.changelayer` /
  `rcon.restartmatch` / `rcon.listdisconnected` for the buttons.
- After `restartmatch` / `changelayer`, refresh players/layer like existing
  endmatch/setnextlayer flows.

### 3. Command reference dataset (`packages/shared`)

New module `packages/shared/squad-commands.ts` (exported via shared index):

```ts
export interface SquadCommand {
  name: string;          // "AdminBan"
  args?: string;         // "<NameOrId> <Length> <Reason>"
  description: string;
  destructive?: boolean; // true → UI warning + confirm
}
export const SQUAD_COMMANDS: SquadCommand[] = [ ... ]
```

Initial set (~40), grouped in source by purpose; `destructive: true` on: AdminBan,
AdminBanById, AdminKick, AdminKickById, AdminEndMatch, AdminRestartMatch,
AdminChangeLayer, AdminSlomo, AdminSetServerPassword, AdminSetMaxNumPlayers,
AdminPauseMatch, AdminDisbandSquad, AdminForceTeamChange(ById),
AdminDemoteCommander(ById), AdminRemovePlayerFromSquad(ById),
AdminCreateVehicle. Non-destructive: ListPlayers, ListSquads, ShowNextMap,
ShowCurrentMap, AdminListDisconnectedPlayers, AdminBroadcast, AdminWarn(ById),
ChatToAdmin, AdminSetNextLayer, AdminUnpauseMatch,
AdminForceAllRoleAvailability, AdminForceAllDeployableAvailability,
AdminDisableVehicleClaiming, AdminNetTestStart/Stop, AdminProfileServer,
AdminSetPublicQueueLimit, AdminNoRespawnTimer, AdminNoTeamChangeTimer.

Source: Squad Wiki (Server_Administration), holy.gg console reference, Nitrado.

### 4. Frontend — console route + buttons

**Route:** new `packages/web/app/(protected)/live-server/console/page.tsx`.
- Register in `app/(protected)/layout.tsx` `PROTECTED_ROUTES`:
  `{ href: "/live-server/console", requiredPermissions: ["manage:rcon-console"] }`.
- Tab switcher on the live-server pages ("Monitor" ↔ "Console"); Console tab only
  rendered when the user holds `manage:rcon-console` (`developer` bypasses).
- Optionally a sidebar sub-item; primary nav is the tab. (No new top-level nav
  group required.)

**Console UI** (own component, e.g. `live-server/console/components/rcon-console.tsx`):
- Terminal-style scrollback: each entry shows the command and its raw response
  (monospace, preserves newlines from `ListPlayers` etc.).
- Input box with command history (↑/↓), Enter to send.
- Autocomplete dropdown sourced from `SQUAD_COMMANDS`: filters by prefix, shows
  `name` + `args` + `description`; destructive entries marked (icon/color).
- Sending a destructive command (matched by leading token against the dataset)
  → confirm dialog before the WS send.
- Reuses the existing live-server WebSocket connection/auth; sends
  `{ action: "rcon_console", command }`, renders `rcon_response`.

**Buttons** (in the Monitor view, contextual):
- **Ban** — player row, next to Kick. Opens a small form: duration (preset
  dropdown: 0/perm, 1h, 1d, 3d, 7d, 30d, custom) + reason. Confirm. Sends
  `{ action: "ban", steamId|eosId, banLength, reason, playerName }`.
- **Change layer now** — next to the existing "set next layer" control. Layer
  input (reuse next-layer picker if present). Confirm (destructive). Sends
  `{ action: "changelayer", message: layer }`.
- **Restart match** — next to "End match". Confirm (destructive). Sends
  `{ action: "restartmatch" }`.
- **List disconnected** — quick-action that runs `listdisconnected` and renders
  the result (in the console output if on console tab, else a popover/toast).

Types: extend `WSMessage` union in `live-server/lib/types.ts` with
`{ type: "rcon_response"; command: string; output: string; success: boolean }`.

### 5. Versioning / deploy

- Bump `package.json` version (minor: feature) before push, per project
  convention.
- Work on `feat/rcon-console`; deploy via existing staging→prod branch flow.

## Data flow — free-form console command

1. User types `AdminSlomo 2` on the Console tab → matched as destructive →
   confirm dialog.
2. Browser sends `{ action: "rcon_console", command: "AdminSlomo 2" }` over the
   existing live-server WS.
3. API: `rcon_console` is routed before the `canManage` early-return; its own
   `hasPermission(ws, "manage:rcon-console")` check passes →
   `executeRcon(serverKey, "execute", "AdminSlomo 2", { dedupe: false })`.
4. SquadJS runs `server.rcon.execute("AdminSlomo 2")`, returns raw output.
5. API `auditDirect(..., "rcon.console", ..., { command })` and replies
   `{ type: "rcon_response", command, output, success: true }`.
6. Console appends command + raw output to scrollback.

## Error handling

- Missing/blank command → `{ rcon_response, success: false, output: "Empty command" }`.
- Not connected to server → existing `executeRcon` throws `Not connected` →
  surfaced as `success: false`.
- RCON timeout (10s) → `success: false` with the timeout message.
- Permission denied → `action_result`/`rcon_response` `success: false` with
  `manage:rcon-console permission required`.
- Frontend renders failures inline in scrollback (red), never silently drops.

## Testing

No automated test suite in this repo (consistent with existing live-server
code). Manual verification on **staging**:
- Grant `manage:rcon-console` to a test role; confirm console tab appears only
  with the permission, hidden without.
- Run a read command (`ListPlayers`) twice in a row → both return output
  (dedup bypass works).
- Run each new button (ban a test alt, change layer, restart match, list
  disconnected) → verify in-game effect + audit-log entries.
- Confirm dialogs appear for destructive commands/buttons.
- Verify a non-`manage:rcon-console` `manage:live-server` user cannot invoke
  `rcon_console` (server-side rejection, not just hidden UI).

## Files touched (summary)

- `packages/shared/types/roles.ts` — new permission.
- `packages/shared/squad-commands.ts` (+ shared index export) — command dataset.
- `packages/api/src/ws/live-server.ts` — new actions, `rcon_response`.
- `packages/api/src/lib/squadjs-socket.ts` — `executeRcon` dedupe opt-out + return value.
- `packages/web/app/(protected)/layout.tsx` — protected route entry.
- `packages/web/app/(protected)/roles/page.tsx` — permission group entry.
- `packages/web/app/(protected)/live-server/console/page.tsx` + components — console UI.
- `packages/web/app/(protected)/live-server/page.tsx` — tab switcher + new buttons.
- `packages/web/app/(protected)/live-server/lib/types.ts` — `rcon_response` message.
- `package.json` — version bump.
```

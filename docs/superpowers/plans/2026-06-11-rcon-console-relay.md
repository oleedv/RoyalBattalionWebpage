# RCON Console + Command Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-form RCON console (new route, new permission) plus four new admin buttons (Ban, Change layer now, Restart match, List disconnected) to the webpage live-server panel, reusing the existing browser→API→SquadJS RCON relay.

**Architecture:** No new transport. The browser already opens a WebSocket to the API; the API already forwards to SquadJS via `squadjsSocket.executeRcon(serverKey, method, ...args)`. We add new WS actions in `handleAdminAction`, a new `manage:rcon-console` permission, a `/live-server/console` route with its own lightweight WS client, and a static command-reference dataset for autocomplete.

**Tech Stack:** Bun monorepo, Next.js 15 (React 19, client components), Hono + Bun WebSocket API, shared TS package, Tailwind v4. Spec: `docs/superpowers/specs/2026-06-11-rcon-console-relay-design.md`.

**Testing note:** This repo has no automated unit-test harness for WS/React code. Per-task verification is **type-check/build** (`bun run --filter <pkg> build` / `bunx tsc --noEmit`) plus a **manual check** described in each task. Final integration testing is on **staging** (Task 9). Do not invent a test framework.

**Branch:** `feat/rcon-console` (already created). Commit after every task.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `packages/shared/types/roles.ts` | modify | add `manage:rcon-console` to `PERMISSIONS` |
| `packages/shared/squad-commands.ts` | create | static Squad admin command reference (autocomplete/help) |
| `packages/shared/index.ts` | modify | export squad-commands |
| `packages/api/src/lib/squadjs-socket.ts` | modify | `executeRcon` dedupe opt-out; already returns raw output |
| `packages/api/src/ws/live-server.ts` | modify | new actions: `rcon_console`, `ban`, `changelayer`, `restartmatch`, `listdisconnected`; `rcon_response` reply |
| `packages/web/app/(protected)/layout.tsx` | modify | register `/live-server/console` route gate |
| `packages/web/app/(protected)/roles/page.tsx` | modify | add permission to Live Server group |
| `packages/web/app/(protected)/live-server/lib/types.ts` | modify | add `rcon_response` to `WSMessage` |
| `packages/web/app/(protected)/live-server/lib/use-rcon-socket.ts` | create | small WS hook for the console (connect/send/receive) |
| `packages/web/app/(protected)/live-server/console/page.tsx` | create | console route page |
| `packages/web/app/(protected)/live-server/console/components/rcon-console.tsx` | create | terminal UI + autocomplete + destructive confirm |
| `packages/web/app/(protected)/live-server/components/live-server-tabs.tsx` | create | Monitor ↔ Console tab nav |
| `packages/web/app/(protected)/live-server/page.tsx` | modify | render tabs; add Ban/Change-layer/Restart-match handlers + UI |
| `packages/web/app/(protected)/live-server/components/player-card.tsx` | modify | add Ban button + `onBan` prop |
| `package.json` | modify | version bump 1.2.0 → 1.3.0 |

---

## Task 1: Add `manage:rcon-console` permission

**Files:**
- Modify: `packages/shared/types/roles.ts`
- Modify: `packages/web/app/(protected)/roles/page.tsx`

- [ ] **Step 1: Add the permission to the shared enum**

In `packages/shared/types/roles.ts`, add the line after `"manage:randomize",`:

```ts
  "manage:randomize",
  "manage:rcon-console",
  "developer",
```

- [ ] **Step 2: Add it to the roles UI group**

In `packages/web/app/(protected)/roles/page.tsx`, inside the `live-server` group's `entries` array (after the `manage:randomize` entry, before the closing `]`):

```ts
      {
        perm: "manage:randomize",
        label: "Randomize Teams",
        description: "Queue or run team randomization",
      },
      {
        perm: "manage:rcon-console",
        label: "RCON Console",
        description: "Run arbitrary RCON commands via the live console",
      },
```

- [ ] **Step 3: Verify types + coverage check**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors. (The `_allGroupedPerms` compile-time check in roles/page.tsx now finds `manage:rcon-console` in a group, so no "Permissions missing from PERMISSION_GROUPS" warning.)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/types/roles.ts "packages/web/app/(protected)/roles/page.tsx"
git commit -m "feat(roles): add manage:rcon-console permission"
```

---

## Task 2: Static Squad command reference dataset

**Files:**
- Create: `packages/shared/squad-commands.ts`
- Modify: `packages/shared/index.ts`

- [ ] **Step 1: Create the dataset**

Create `packages/shared/squad-commands.ts`:

```ts
export interface SquadCommand {
  name: string;
  args?: string;
  description: string;
  destructive?: boolean;
}

// Source: Squad Wiki (Server_Administration), holy.gg console reference, Nitrado.
export const SQUAD_COMMANDS: SquadCommand[] = [
  // Info / read-only
  { name: "ListPlayers", description: "List all connected players with IDs, team and squad." },
  { name: "ListSquads", description: "List all squads per team with sizes and creators." },
  { name: "ShowNextMap", description: "Show the next level and layer in rotation." },
  { name: "ShowCurrentMap", description: "Show the current level and layer." },
  { name: "AdminListDisconnectedPlayers", description: "List recently disconnected players with their IDs." },
  // Messaging
  { name: "AdminBroadcast", args: "<Message>", description: "Broadcast a system message to all players." },
  { name: "ChatToAdmin", args: "<Message>", description: "Send a message visible to admins only." },
  // Player moderation
  { name: "AdminWarn", args: "<NameOrId> <Reason>", description: "Warn a player by name or online ID." },
  { name: "AdminWarnById", args: "<PlayerId> <Reason>", description: "Warn a player by in-game player ID." },
  { name: "AdminKick", args: "<NameOrId> <Reason>", description: "Kick a player by name or online ID.", destructive: true },
  { name: "AdminKickById", args: "<PlayerId> <Reason>", description: "Kick a player by in-game player ID.", destructive: true },
  { name: "AdminBan", args: "<NameOrId> <Length> <Reason>", description: "Ban a player. Length: 0=perm, 1m/1d/1M.", destructive: true },
  { name: "AdminBanById", args: "<PlayerId> <Length> <Reason>", description: "Ban a player by in-game player ID.", destructive: true },
  // Teams / squads / roles
  { name: "AdminForceTeamChange", args: "<NameOrId>", description: "Force a player to switch teams.", destructive: true },
  { name: "AdminForceTeamChangeById", args: "<PlayerId>", description: "Force a player to switch teams by player ID.", destructive: true },
  { name: "AdminDisbandSquad", args: "<TeamNumber 1|2> <SquadIndex>", description: "Disband a squad on a team.", destructive: true },
  { name: "AdminRemovePlayerFromSquad", args: "<PlayerName>", description: "Remove a player from their squad.", destructive: true },
  { name: "AdminRemovePlayerFromSquadById", args: "<PlayerId>", description: "Remove a player from their squad by ID.", destructive: true },
  { name: "AdminDemoteCommander", args: "<PlayerName>", description: "Remove commander status from a player.", destructive: true },
  { name: "AdminDemoteCommanderById", args: "<PlayerId>", description: "Remove commander status by player ID.", destructive: true },
  // Match control
  { name: "AdminEndMatch", description: "End the current match immediately.", destructive: true },
  { name: "AdminRestartMatch", description: "Restart the current match.", destructive: true },
  { name: "AdminPauseMatch", description: "Pause the current match.", destructive: true },
  { name: "AdminUnpauseMatch", description: "Resume a paused match." },
  { name: "AdminChangeLayer", args: "<LayerName>", description: "Change the active layer immediately.", destructive: true },
  { name: "AdminSetNextLayer", args: "<LayerName>", description: "Queue the next layer to load." },
  // Server config
  { name: "AdminSetMaxNumPlayers", args: "<NumPlayers>", description: "Change the player cap.", destructive: true },
  { name: "AdminSetServerPassword", args: "<Password>", description: "Set (or clear) the server password.", destructive: true },
  { name: "AdminSetPublicQueueLimit", args: "<Value>", description: "Cap the public queue size." },
  { name: "AdminSlomo", args: "<TimeDilation>", description: "Change server clock speed (1 = normal).", destructive: true },
  // Gameplay / deployables
  { name: "AdminForceAllRoleAvailability", args: "<0|1>", description: "Ignore kit/role restrictions when enabled." },
  { name: "AdminForceAllDeployableAvailability", args: "<0|1>", description: "Bypass deployable placement rules." },
  { name: "AdminDisableVehicleClaiming", args: "<0|1>", description: "Prevent vehicle claiming." },
  { name: "AdminCreateVehicle", args: "<VehicleLink>", description: "Spawn a vehicle.", destructive: true },
  { name: "AdminNoRespawnTimer", args: "<0|1>", description: "Disable the respawn timer (layer setting)." },
  { name: "AdminNoTeamChangeTimer", args: "<0|1>", description: "Disable the team-change timer (layer setting)." },
  // Diagnostics
  { name: "AdminNetTestStart", description: "Start a network test (writes to client logs)." },
  { name: "AdminNetTestStop", description: "Stop the network test." },
  { name: "AdminProfileServer", args: "<Seconds> <0|1>", description: "Profile the server for N seconds." },
];

/** Lowercased command-name set for fast destructive lookup. */
const DESTRUCTIVE = new Set(
  SQUAD_COMMANDS.filter((c) => c.destructive).map((c) => c.name.toLowerCase())
);

/** True if the first token of `input` matches a known destructive command. */
export function isDestructiveCommand(input: string): boolean {
  const first = input.trim().split(/\s+/)[0]?.toLowerCase();
  return first ? DESTRUCTIVE.has(first) : false;
}
```

- [ ] **Step 2: Export from the shared barrel**

In `packages/shared/index.ts`, add after the `./countries` line:

```ts
export { COUNTRIES, validateCountry } from "./countries";
export * from "./squad-commands";
```

- [ ] **Step 3: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors (web consumes `shared`).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/squad-commands.ts packages/shared/index.ts
git commit -m "feat(shared): add Squad admin command reference dataset"
```

---

## Task 3: `executeRcon` dedupe opt-out

**Files:**
- Modify: `packages/api/src/lib/squadjs-socket.ts`

The console must be able to re-run read commands (e.g. `ListPlayers`) within 2s. Add an optional trailing options object to `executeRcon`. Existing callers pass only string args, so a trailing plain (non-array) object is unambiguously the options bag.

- [ ] **Step 1: Update the method signature and dedupe gate**

In `packages/api/src/lib/squadjs-socket.ts`, replace the `executeRcon` method (currently starting `async executeRcon(serverKey: string, method: string, ...args: unknown[])`) with:

```ts
  async executeRcon(serverKey: string, method: string, ...rest: unknown[]): Promise<unknown> {
    // Detect an optional trailing options object: executeRcon(key, method, ...args, { dedupe })
    let opts: { dedupe: boolean } = { dedupe: true };
    let args = rest;
    const last = rest[rest.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last)) {
      opts = { dedupe: true, ...(last as { dedupe?: boolean }) };
      args = rest.slice(0, -1);
    }

    const state = this.servers.get(serverKey);
    if (!state || !state.connected) {
      throw new Error(`Not connected to ${serverKey}`);
    }

    // Deduplication: prevent same command within 2 seconds (skippable for reads)
    if (opts.dedupe) {
      const dedupeKey = `${method}:${args.map(String).join(":")}`;
      const now = Date.now();
      const lastExec = state.lastRcon.get(dedupeKey);
      if (lastExec && now - lastExec < 2000) {
        logger.warn("squadjs", `Dedup: skipping duplicate rcon.${method} on ${serverKey}`);
        return "deduplicated";
      }
      state.lastRcon.set(dedupeKey, now);

      // Clean old entries every 50 commands
      if (state.lastRcon.size > 50) {
        for (const [k, t] of state.lastRcon) {
          if (now - t > 5000) state.lastRcon.delete(k);
        }
      }
    }

    logger.info("squadjs", `RCON ${serverKey}: rcon.${method}(${args.map(String).join(", ")})`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("RCON timeout")), 10000);
      state.socket.emit(`rcon.${method}`, ...args, (result: unknown) => {
        clearTimeout(timeout);
        if (result && typeof result === "object" && "error" in result) {
          reject(new Error((result as { error: string }).error));
        } else {
          resolve(result);
        }
      });
    });
  }
```

- [ ] **Step 2: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: no errors. (Existing `executeRcon(serverKey, "warn", id, msg)` calls still type-check because the extra options arg is optional.)

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/lib/squadjs-socket.ts
git commit -m "feat(api): allow executeRcon to skip dedupe for read commands"
```

---

## Task 4: Backend WS actions (console + 4 buttons)

**Files:**
- Modify: `packages/api/src/ws/live-server.ts`

- [ ] **Step 1: Route `rcon_console` before the canManage gate**

In `handleLiveServerMessage`, the `rcon_console` action must work for holders of `manage:rcon-console` even without `manage:live-server`. Add handling **before** the `if (!ws.data.canManage)` block. Locate this block:

```ts
    // Handle server switching
    if (msg.action === "switch_server" && msg.server) {
      ...
      return;
    }

    if (!ws.data.canManage) {
```

Insert between the `switch_server` block's closing `}` and the `if (!ws.data.canManage)` line:

```ts
    // Free-form RCON console: gated solely by manage:rcon-console (developer bypasses)
    if (msg.action === "rcon_console") {
      if (!hasPermission(ws, "manage:rcon-console")) {
        ws.send(JSON.stringify({ type: "rcon_response", command: msg.message ?? "", output: "", success: false, error: "manage:rcon-console permission required" }));
        return;
      }
      await handleRconConsole(ws, msg);
      return;
    }

```

Note: `hasPermission` is already defined in this file and `developer` satisfies it.

- [ ] **Step 2: Widen the parsed message type for the console**

In `handleLiveServerMessage`, the `msg` is parsed as a typed object. Add `command?: string` and `banLength?: string` to that inline type so `rcon_console`/`ban` fields type-check. Find the `const msg = JSON.parse(text) as {` object and add these fields to it:

```ts
      clanTag?: string;
      targetTeam?: string;
      command?: string;
      banLength?: string;
    };
```

- [ ] **Step 3: Add the console handler function**

At the end of the file (after `handleAdminAction`), add:

```ts
async function handleRconConsole(
  ws: ServerWebSocket<WSData>,
  msg: { action: string; command?: string; message?: string }
) {
  const serverKey = ws.data.serverKey;
  const command = (msg.command ?? msg.message ?? "").trim();
  if (!command) {
    ws.send(JSON.stringify({ type: "rcon_response", command: "", output: "", success: false, error: "Empty command" }));
    return;
  }
  logger.info("live-server", `RCON console from user ${ws.data.userId} on ${serverKey}: ${command}`);
  try {
    const output = await squadjsSocket.executeRcon(serverKey, "execute", command, { dedupe: false });
    auditDirect(ws.data.userId, ws.data.userName, "rcon.console", "LiveServer", serverKey, { command });
    ws.send(JSON.stringify({
      type: "rcon_response",
      command,
      output: typeof output === "string" ? output : JSON.stringify(output),
      success: true,
    }));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Command failed";
    ws.send(JSON.stringify({ type: "rcon_response", command, output: "", success: false, error }));
  }
}
```

- [ ] **Step 4: Add the four button actions inside `handleAdminAction`'s switch**

These live under the existing `canManage` gate (Monitor view). Add these `case`s before the `default:` in `handleAdminAction`'s `switch (msg.action)`:

```ts
      case "ban": {
        const playerId = msg.steamId || msg.eosId;
        if (!playerId || !msg.banLength) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing player ID or ban length" }));
          return;
        }
        const reason = msg.reason || "Banned by admin";
        await squadjsSocket.executeRcon(serverKey, "ban", playerId, msg.banLength, reason);
        auditDirect(ws.data.userId, ws.data.userName, "rcon.ban", "LiveServer", serverKey, { playerId, playerName: msg.playerName, banLength: msg.banLength, reason });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "ban" }));
        setTimeout(() => squadjsSocket.refreshPlayers(serverKey), 500);
        break;
      }

      case "changelayer": {
        if (!msg.message) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing layer name" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "execute", `AdminChangeLayer ${msg.message}`);
        auditDirect(ws.data.userId, ws.data.userName, "rcon.changelayer", "LiveServer", serverKey, { layer: msg.message });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "changelayer" }));
        break;
      }

      case "restartmatch": {
        await squadjsSocket.executeRcon(serverKey, "execute", "AdminRestartMatch");
        auditDirect(ws.data.userId, ws.data.userName, "rcon.restartmatch", "LiveServer", serverKey, {});
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "restartmatch" }));
        break;
      }

      case "listdisconnected": {
        const output = await squadjsSocket.executeRcon(serverKey, "execute", "AdminListDisconnectedPlayers", { dedupe: false });
        auditDirect(ws.data.userId, ws.data.userName, "rcon.listdisconnected", "LiveServer", serverKey, {});
        ws.send(JSON.stringify({ type: "rcon_response", command: "AdminListDisconnectedPlayers", output: typeof output === "string" ? output : JSON.stringify(output), success: true }));
        break;
      }
```

Also add `banLength?: string;` and `command?: string;` to the inline parameter type of `handleAdminAction` (the `msg: { action: string; ... }` parameter) so `msg.banLength` type-checks.

- [ ] **Step 5: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/ws/live-server.ts
git commit -m "feat(api): add rcon console + ban/changelayer/restartmatch/listdisconnected actions"
```

---

## Task 5: Frontend types + route gate

**Files:**
- Modify: `packages/web/app/(protected)/live-server/lib/types.ts`
- Modify: `packages/web/app/(protected)/layout.tsx`

- [ ] **Step 1: Add `rcon_response` to the WS message union**

In `packages/web/app/(protected)/live-server/lib/types.ts`, add to the `WSMessage` union:

```ts
  | { type: "online_clans"; data: OnlineClanData }
  | { type: "rcon_response"; command: string; output: string; success: boolean; error?: string };
```

- [ ] **Step 2: Register the console route gate**

In `packages/web/app/(protected)/layout.tsx`, find the `PROTECTED_ROUTES` array (entry for `/live-server` is around line 63) and add immediately after the `/live-server` entry:

```ts
  {
    href: "/live-server/console",
    requiredPermissions: ["manage:rcon-console"],
  },
```

(Match the exact object shape used by the surrounding entries — `href` + `requiredPermissions`.)

- [ ] **Step 3: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "packages/web/app/(protected)/live-server/lib/types.ts" "packages/web/app/(protected)/layout.tsx"
git commit -m "feat(web): add rcon_response type and console route gate"
```

---

## Task 6: Console WS hook

**Files:**
- Create: `packages/web/app/(protected)/live-server/lib/use-rcon-socket.ts`

The console only needs: connect, connection status, send a command, receive responses. It does not need the Monitor's snapshot/player machinery, so it gets its own small client.

- [ ] **Step 1: Create the hook**

Create `packages/web/app/(protected)/live-server/lib/use-rcon-socket.ts`:

```ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WSMessage } from "./types";

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/^http/, "ws");

export interface RconLine {
  id: number;
  command: string;
  output: string;
  success: boolean;
  error?: string;
  time: string;
}

export function useRconSocket(apiToken: string | null, serverKey: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);
  const serverKeyRef = useRef(serverKey);
  serverKeyRef.current = serverKey;

  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<RconLine[]>([]);

  useEffect(() => {
    if (!apiToken) return;
    let closed = false;

    function connect() {
      const ws = new WebSocket(`${WS_BASE}/live-server/ws`, [`auth-${apiToken}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ action: "switch_server", server: serverKeyRef.current }));
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) reconnectRef.current = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        let msg: WSMessage;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as WSMessage;
        } catch {
          return;
        }
        if (msg.type === "rcon_response") {
          setLines((prev) => [
            ...prev,
            {
              id: idRef.current++,
              command: msg.command,
              output: msg.output,
              success: msg.success,
              error: msg.error,
              time: new Date().toISOString(),
            },
          ]);
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [apiToken]);

  const send = useCallback((command: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "rcon_console", command }));
    }
  }, []);

  const runListDisconnected = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "listdisconnected" }));
    }
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { connected, lines, send, runListDisconnected, clear };
}
```

Note: confirm the WS path `${WS_BASE}/live-server/ws` and the `auth-${token}` subprotocol against how `live-server/page.tsx` opens its socket (around lines 180–230). If the page uses a different path/handshake, match it exactly.

- [ ] **Step 2: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "packages/web/app/(protected)/live-server/lib/use-rcon-socket.ts"
git commit -m "feat(web): add useRconSocket hook for the console"
```

---

## Task 7: Console component + route page

**Files:**
- Create: `packages/web/app/(protected)/live-server/console/components/rcon-console.tsx`
- Create: `packages/web/app/(protected)/live-server/console/page.tsx`

- [ ] **Step 1: Create the console component**

Create `packages/web/app/(protected)/live-server/console/components/rcon-console.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SQUAD_COMMANDS, isDestructiveCommand, type SquadCommand } from "shared";
import { useRconSocket, type RconLine } from "../../lib/use-rcon-socket";

export function RconConsole({ apiToken, serverKey }: { apiToken: string | null; serverKey: string }) {
  const { connected, lines, send, runListDisconnected, clear } = useRconSocket(apiToken, serverKey);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const [showSuggest, setShowSuggest] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const suggestions: SquadCommand[] = useMemo(() => {
    const first = input.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!first || input.includes(" ")) return [];
    return SQUAD_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(first)).slice(0, 8);
  }, [input]);

  function submit(raw: string) {
    const command = raw.trim();
    if (!command) return;
    if (isDestructiveCommand(command)) {
      const ok = window.confirm(`This is a destructive command:\n\n${command}\n\nRun it?`);
      if (!ok) return;
    }
    send(command);
    setHistory((h) => [...h, command]);
    setHistIdx(-1);
    setInput("");
    setShowSuggest(false);
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
      if (next >= history.length) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(next); setInput(history[next]); }
    } else if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      setInput(suggestions[0].name + " ");
      setShowSuggest(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-sm border border-border bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-danger"}`} />
          <span className="text-text-muted">{connected ? "Connected" : "Disconnected"} · {serverKey}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={runListDisconnected} className="rounded-sm border border-accent/20 px-2 py-1 text-[11px] text-accent hover:bg-accent/10">List Disconnected</button>
          <button onClick={clear} className="rounded-sm border border-border px-2 py-1 text-[11px] text-text-muted hover:bg-bg-tertiary">Clear</button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 && (
          <div className="text-text-muted">Type an RCON command and press Enter. Use ↑/↓ for history, Tab to autocomplete.</div>
        )}
        {lines.map((l: RconLine) => (
          <div key={l.id} className="mb-2">
            <div className="text-accent">&gt; {l.command}</div>
            {l.success ? (
              <pre className="whitespace-pre-wrap break-words text-text-secondary">{l.output || "(no output)"}</pre>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-danger">{l.error || "Command failed"}</pre>
            )}
          </div>
        ))}
      </div>

      <div className="relative border-t border-border p-2">
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 max-h-56 overflow-y-auto rounded-sm border border-border bg-bg-tertiary">
            {suggestions.map((c) => (
              <button
                key={c.name}
                onClick={() => { setInput(c.name + " "); setShowSuggest(false); }}
                className="flex w-full items-start justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-bg-secondary"
              >
                <span className="font-mono text-text-primary">
                  {c.name} {c.args && <span className="text-text-muted">{c.args}</span>}
                  {c.destructive && <span className="ml-1 text-danger">●</span>}
                </span>
                <span className="text-text-muted">{c.description}</span>
              </button>
            ))}
          </div>
        )}
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggest(true); }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          placeholder="AdminBroadcast Hello world"
          className="w-full rounded-sm border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
          autoFocus
          spellCheck={false}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the console route page**

Create `packages/web/app/(protected)/live-server/console/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { usePermissions } from "@/lib/permission-context";
import { LiveServerTabs } from "../components/live-server-tabs";
import { RconConsole } from "./components/rcon-console";

export default function RconConsolePage() {
  const { apiToken, hasPermission } = usePermissions();
  const canConsole = hasPermission("manage:rcon-console");
  // Default to the same server the monitor defaults to; adjust if the monitor uses a different default.
  const [serverKey] = useState<string>("production");

  if (!canConsole) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  return (
    <div className="space-y-3">
      <LiveServerTabs active="console" canConsole={canConsole} />
      <RconConsole apiToken={apiToken} serverKey={serverKey} />
    </div>
  );
}
```

Note: `serverKey` default of `"production"` matches the SquadJS server keys from `SQUADJS_SERVERS`. If the monitor page exposes a server switcher and a different default, mirror that here (a follow-up could add a switcher to the console; out of scope for v1).

- [ ] **Step 3: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: errors only about the not-yet-created `LiveServerTabs` import (created in Task 8). If so, proceed to Task 8 then re-run.

- [ ] **Step 4: Commit**

```bash
git add "packages/web/app/(protected)/live-server/console"
git commit -m "feat(web): add RCON console route and component"
```

---

## Task 8: Monitor ↔ Console tab nav

**Files:**
- Create: `packages/web/app/(protected)/live-server/components/live-server-tabs.tsx`
- Modify: `packages/web/app/(protected)/live-server/page.tsx`

- [ ] **Step 1: Create the tab component**

Create `packages/web/app/(protected)/live-server/components/live-server-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";

export function LiveServerTabs({ active, canConsole }: { active: "monitor" | "console"; canConsole: boolean }) {
  const tab = (href: string, label: string, key: "monitor" | "console") => (
    <Link
      href={href}
      className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
        active === key ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 border-b border-border pb-2">
      {tab("/live-server", "Monitor", "monitor")}
      {canConsole && tab("/live-server/console", "Console", "console")}
    </div>
  );
}
```

- [ ] **Step 2: Render tabs on the monitor page**

In `packages/web/app/(protected)/live-server/page.tsx`:

1. Add the import near the other component imports (after line 13):

```ts
import { PlayerCard } from "./components/player-card";
import { LiveServerTabs } from "./components/live-server-tabs";
```

2. The page early-returns `<div className="text-danger">Insufficient permissions.</div>` when `!canView` (around line 574) — leave that as is. Immediately after the **main authorized render** opens (the top-level returned JSX wrapper), add the tabs. Find the top-level `return (` of the authorized view and insert as the first child:

```tsx
      <LiveServerTabs active="monitor" canConsole={hasPermission("manage:rcon-console")} />
```

(If the top-level element is a fragment or a `<div className="space-y-...">`, place `<LiveServerTabs ... />` as its first child.)

- [ ] **Step 3: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors (Task 7's `LiveServerTabs` import now resolves).

- [ ] **Step 4: Commit**

```bash
git add "packages/web/app/(protected)/live-server/components/live-server-tabs.tsx" "packages/web/app/(protected)/live-server/page.tsx"
git commit -m "feat(web): add Monitor/Console tab navigation"
```

---

## Task 9: Monitor buttons — Ban, Change layer now, Restart match

**Files:**
- Modify: `packages/web/app/(protected)/live-server/components/player-card.tsx`
- Modify: `packages/web/app/(protected)/live-server/page.tsx`

- [ ] **Step 1: Add a Ban button to the player card**

In `player-card.tsx`, add `onBan` to `PlayerCardProps`:

```ts
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onBan: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
```

Destructure it in the component params (alongside `onKick`), and add a Ban button after the Kick button inside the `showActions` block:

```tsx
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
```

- [ ] **Step 2: Add ban state + handler in `page.tsx`**

Near the other modal state (`kickTarget`/`kickReason` declarations), add:

```ts
  const [banTarget, setBanTarget] = useState<Player | null>(null);
  const [banLength, setBanLength] = useState("1d");
  const [banReason, setBanReason] = useState("");
```

Add the handler alongside `handleKick`:

```ts
  const handleBan = useCallback(() => {
    if (!banTarget) return;
    sendAction({
      action: "ban",
      steamId: banTarget.steamID,
      eosId: banTarget.eosID,
      playerName: banTarget.name,
      banLength,
      reason: banReason.trim() || "Banned by admin",
    });
    setBanTarget(null);
    setBanReason("");
    setBanLength("1d");
  }, [banTarget, banLength, banReason]);
```

Pass `onBan={(p) => setBanTarget(p)}` to every `<PlayerCard ... />` render (same place `onKick` is passed).

- [ ] **Step 3: Add the ban modal**

Find where the existing kick modal is rendered (a `<Modal>` driven by `kickTarget`) and add a sibling ban modal:

```tsx
      {banTarget && (
        <Modal onClose={() => setBanTarget(null)} title={`Ban ${banTarget.name}`}>
          <div className="space-y-3">
            <label className="block text-xs text-text-muted">Duration</label>
            <select
              value={banLength}
              onChange={(e) => setBanLength(e.target.value)}
              className="w-full rounded-sm border border-border bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="0">Permanent</option>
              <option value="1h">1 hour</option>
              <option value="1d">1 day</option>
              <option value="3d">3 days</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
            <label className="block text-xs text-text-muted">Reason</label>
            <input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason shown to player"
              className="w-full rounded-sm border border-border bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setBanTarget(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-muted">Cancel</button>
              <button onClick={handleBan} className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">Ban</button>
            </div>
          </div>
        </Modal>
      )}
```

Match the actual `<Modal>` prop API used elsewhere in this file (check the existing kick/endmatch modal usage — it may use `title`/`onClose` or children-only; mirror it exactly).

- [ ] **Step 4: Add Change-layer-now and Restart-match controls**

Find the existing **Set Next Layer** control (uses `nextLayerInput` + `handleSetNextLayer`) and the **End Match** confirm (`endMatchConfirm` + `handleEndMatch`). Add adjacent controls and handlers.

Handlers (next to `handleSetNextLayer` / `handleEndMatch`):

```ts
  const [changeLayerInput, setChangeLayerInput] = useState("");
  function handleChangeLayerNow() {
    if (!changeLayerInput.trim()) return;
    if (!window.confirm(`Change the CURRENT layer to "${changeLayerInput.trim()}" now? This restarts the round.`)) return;
    sendAction({ action: "changelayer", message: changeLayerInput.trim() });
    setChangeLayerInput("");
  }

  const [restartConfirm, setRestartConfirm] = useState(false);
  function handleRestartMatch() {
    sendAction({ action: "restartmatch" });
    setRestartConfirm(false);
  }
```

UI — next to the Set Next Layer input, add a Change-layer-now input + button:

```tsx
          <div className="flex gap-2">
            <input
              value={changeLayerInput}
              onChange={(e) => setChangeLayerInput(e.target.value)}
              placeholder="Change layer NOW"
              className="flex-1 rounded-sm border border-border bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
            />
            <button onClick={handleChangeLayerNow} className="rounded-sm border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10">Change Now</button>
          </div>
```

UI — next to the End Match button, add Restart Match (mirror the End Match confirm pattern). If End Match uses an inline confirm:

```tsx
          {!restartConfirm ? (
            <button onClick={() => setRestartConfirm(true)} className="rounded-sm border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10">Restart Match</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleRestartMatch} className="rounded-sm border border-danger/60 bg-danger/10 px-3 py-1.5 text-xs text-danger">Confirm Restart</button>
              <button onClick={() => setRestartConfirm(false)} className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-muted">Cancel</button>
            </div>
          )}
```

- [ ] **Step 5: Verify**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bunx tsc --noEmit -p packages/web/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "packages/web/app/(protected)/live-server/components/player-card.tsx" "packages/web/app/(protected)/live-server/page.tsx"
git commit -m "feat(web): add Ban, Change-layer-now, and Restart-match buttons"
```

---

## Task 10: Version bump + full build + manual staging test

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

In root `package.json`, change `"version": "1.2.0"` to `"version": "1.3.0"`.

- [ ] **Step 2: Full build**

Run: `cd C:\Users\OleEd\Azure\RoyalBattalionWebpage && bun run --filter api build && bun run --filter web build`
Expected: both succeed (Next.js build type-checks the whole web app).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.3.0 for rcon console"
```

- [ ] **Step 4: Deploy to staging and manually verify**

Deploy via the normal staging flow, then on staging:
- Grant a test role `manage:rcon-console`; confirm the **Console** tab appears for it and is hidden for a user with only `manage:live-server`.
- Open `/live-server/console`: run `ListPlayers` twice in a row → both return output (dedupe bypass works).
- Type `Admin` → autocomplete lists commands; destructive ones show the red dot; running one prompts a confirm.
- From the Monitor: open a player card → **Ban** (1h, with reason) a test alt → verify in-game + an audit-log `rcon.ban` entry.
- Use **Change Now** (confirm), **Restart Match** (confirm), **List Disconnected** (renders in console) → verify effects + audit entries `rcon.changelayer` / `rcon.restartmatch` / `rcon.listdisconnected` / `rcon.console`.
- Confirm a `manage:live-server`-only user gets a server-side rejection if they craft an `rcon_console` message (UI hidden + backend denies).

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge/PR. Deploy: staging (`git push origin <branch>:main`) → production after sign-off.

---

## Self-review notes (addressed)

- **Spec coverage:** permission (T1), command dataset (T2), dedupe opt-out (T3), backend actions + `rcon_response` (T4), web types + route gate (T5), WS hook (T6), console UI + route (T7), tabs (T8), four buttons (T9), version + verify (T10). All spec sections mapped.
- **Standalone permission:** `rcon_console` is handled before the `canManage` gate in T4 — `manage:rcon-console` alone suffices, matching the spec.
- **Type consistency:** `rcon_response` shape identical in API (T4), web `WSMessage` (T5), and hook (T6). `executeRcon(..., { dedupe: false })` opt-out defined in T3 and used in T4/console. `SquadCommand`/`isDestructiveCommand` defined in T2, consumed in T7.
- **Manual-verify substituted for unit tests** because no WS/React test harness exists in this repo (documented in header).
- **Anchors to confirm while editing** (flagged inline): exact `<Modal>` prop API, the WS path/handshake in `use-rcon-socket.ts`, the monitor's default server key, and the top-level JSX wrapper for tab insertion.

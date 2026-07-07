import { squadjsSocket } from "../lib/squadjs-socket";
import { auditDirect } from "../lib/audit";
import { logger } from "../lib/logger";
import prisma from "../lib/db";
import type { ServerWebSocket } from "bun";
import type { WSData } from "./types";
import type { Permission } from "shared";

export const wsClients = new Set<ServerWebSocket<WSData>>();

/** Set up the SquadJS event relay to all subscribed live-server WebSocket clients. */
export function initLiveServerRelay() {
  // Clear previous listeners first (handles bun --watch re-evaluation)
  squadjsSocket.clearListeners();
  squadjsSocket.onEvent((serverKey, event, data) => {
    const message = JSON.stringify({ type: "event", event, data, server: serverKey });
    for (const ws of wsClients) {
      try {
        if (ws.data.serverKey === serverKey) {
          ws.send(message);
        }
      } catch (err) {
        logger.error("live-server", "Failed to send to client, removing", err);
        wsClients.delete(ws);
      }
    }
  });
}

export function handleLiveServerOpen(ws: ServerWebSocket<WSData>) {
  wsClients.add(ws);
  logger.info("live-server", `WebSocket connected (${wsClients.size} clients)`);

  // Send available servers + initial snapshot
  ws.send(
    JSON.stringify({
      type: "servers",
      data: squadjsSocket.getServerKeys(),
    })
  );

  const snapshot = squadjsSocket.getSnapshot(ws.data.serverKey);
  const configured = squadjsSocket.isConfigured();
  ws.send(
    JSON.stringify({
      type: "snapshot",
      data: snapshot || { connected: false, players: [], serverInfo: null, chatLog: [], consoleLog: [], tickRate: null, metricHistory: [] },
      server: ws.data.serverKey,
      configured,
    })
  );
}

export async function handleLiveServerMessage(ws: ServerWebSocket<WSData>, message: string | Buffer) {
  try {
    const text = typeof message === "string" ? message : message.toString();
    const msg = JSON.parse(text) as {
      action: string;
      server?: string;
      steamId?: string;
      eosId?: string;
      message?: string;
      reason?: string;
      teamID?: string;
      squadID?: string;
      players?: { steamId?: string; eosId?: string }[];
      clanTag?: string;
      targetTeam?: string;
      command?: string;
      banLength?: string;
    };

    // Handle keepalive ping (before auth checks so any connected client can ping)
    if (msg.action === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    // Handle server switching
    if (msg.action === "switch_server" && msg.server) {
      ws.data.serverKey = msg.server;
      const snapshot = squadjsSocket.getSnapshot(msg.server);
      ws.send(JSON.stringify({
        type: "snapshot",
        data: snapshot || { connected: false, players: [], serverInfo: null, chatLog: [], consoleLog: [], tickRate: null, metricHistory: [] },
        server: msg.server,
        configured: squadjsSocket.isConfigured(),
      }));
      return;
    }

    // Console-tier actions: gated solely by manage:rcon-console (developer bypasses).
    // Routed before the canManage gate so a standalone manage:rcon-console user can use them.
    if (msg.action === "rcon_console" || msg.action === "listdisconnected") {
      if (!hasPermission(ws, "manage:rcon-console")) {
        ws.send(JSON.stringify({ type: "rcon_response", command: msg.command ?? msg.message ?? "", output: "", success: false, error: "manage:rcon-console permission required" }));
        return;
      }
      if (msg.action === "rcon_console") await handleRconConsole(ws, msg);
      else await handleListDisconnected(ws);
      return;
    }

    if (!ws.data.canManage) {
      ws.send(
        JSON.stringify({
          type: "action_result",
          success: false,
          error: "Manage live-server permission required",
        })
      );
      return;
    }

    handleAdminAction(ws, msg);
  } catch (err) {
    logger.error("live-server", "Error handling WebSocket message", err);
    ws.send(
      JSON.stringify({
        type: "action_result",
        success: false,
        error: "Invalid message format",
      })
    );
  }
}

export function handleLiveServerClose(ws: ServerWebSocket<WSData>) {
  wsClients.delete(ws);
  logger.info("live-server", `WebSocket disconnected (${wsClients.size} clients)`);
}

function hasPermission(ws: ServerWebSocket<WSData>, perm: Permission): boolean {
  return ws.data.permissions.includes("developer") || ws.data.permissions.includes(perm);
}

async function handleAdminAction(
  ws: ServerWebSocket<WSData>,
  msg: { action: string; server?: string; steamId?: string; eosId?: string; playerName?: string; message?: string; reason?: string; teamID?: string; squadID?: string; players?: { steamId?: string; eosId?: string; name?: string }[]; clanTag?: string; clanId?: string; targetTeam?: string; banLength?: string; command?: string }
) {
  const serverKey = ws.data.serverKey;
  logger.info("live-server", `RCON ${msg.action} from user ${ws.data.userId} on ${serverKey}`);

  try {
    switch (msg.action) {
      case "warn": {
        const playerId = msg.steamId || msg.eosId;
        if (!playerId || !msg.message) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing player ID or message" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "warn", playerId, msg.message);
        auditDirect(ws.data.userId, ws.data.userName, "rcon.warn", "LiveServer", serverKey, { playerId, playerName: msg.playerName, message: msg.message });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "warn" }));
        break;
      }

      case "kick": {
        const playerId = msg.steamId || msg.eosId;
        if (!playerId) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing player ID" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "kick", playerId, msg.reason || "Kicked by admin");
        auditDirect(ws.data.userId, ws.data.userName, "rcon.kick", "LiveServer", serverKey, { playerId, playerName: msg.playerName, reason: msg.reason });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "kick" }));
        setTimeout(() => squadjsSocket.refreshPlayers(serverKey), 500);
        break;
      }

      case "broadcast":
        if (!msg.message) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing message" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "broadcast", msg.message);
        auditDirect(ws.data.userId, ws.data.userName, "rcon.broadcast", "LiveServer", serverKey, { message: msg.message });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "broadcast" }));
        break;

      case "switchteam": {
        if (!msg.steamId && !msg.eosId) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing player ID" }));
          return;
        }
        if (msg.steamId) {
          await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChange ${msg.steamId}`);
        } else {
          await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChangeById ${msg.eosId}`);
        }
        const playerId = msg.steamId || msg.eosId;
        auditDirect(ws.data.userId, ws.data.userName, "rcon.switchteam", "LiveServer", serverKey, { playerId, playerName: msg.playerName });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "switchteam" }));
        setTimeout(() => squadjsSocket.refreshPlayers(serverKey), 500);
        break;
      }

      case "switchsquad": {
        if (!msg.players?.length) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing players list" }));
          return;
        }
        const squadEstimate = Math.ceil((msg.players.length - 1) * 0.5 + 1);
        ws.send(JSON.stringify({ type: "action_progress", action: "switchsquad", count: msg.players.length, estimatedSeconds: squadEstimate }));
        let switched = 0;
        for (const p of msg.players) {
          if (!p.steamId && !p.eosId) continue;
          const warnId = p.steamId || p.eosId;
          await squadjsSocket.executeRcon(serverKey, "execute", `AdminWarn ${warnId} You are being moved to the other team by an admin.`);
          if (p.steamId) {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChange ${p.steamId}`);
          } else {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChangeById ${p.eosId}`);
          }
          switched++;
          if (switched < msg.players.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.switchsquad", "LiveServer", serverKey, { count: switched, playerNames: msg.players!.map((p) => p.name).filter(Boolean) });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "switchsquad" }));
        setTimeout(() => squadjsSocket.refreshPlayers(serverKey), 500);
        break;
      }

      case "disband": {
        if (!msg.teamID || !msg.squadID) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing team or squad ID" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "execute", `AdminDisbandSquad ${msg.teamID} ${msg.squadID}`);
        auditDirect(ws.data.userId, ws.data.userName, "rcon.disband", "LiveServer", serverKey, { teamID: msg.teamID, squadID: msg.squadID });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "disband" }));
        setTimeout(() => squadjsSocket.refreshPlayers(serverKey), 500);
        break;
      }

      case "endmatch": {
        await squadjsSocket.executeRcon(serverKey, "execute", "AdminEndMatch");
        auditDirect(ws.data.userId, ws.data.userName, "rcon.endmatch", "LiveServer", serverKey, {});
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "endmatch" }));
        break;
      }

      case "setnextlayer": {
        if (!msg.message) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing layer name" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "execute", `AdminSetNextLayer ${msg.message}`);
        auditDirect(ws.data.userId, ws.data.userName, "rcon.setnextlayer", "LiveServer", serverKey, { layer: msg.message });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "setnextlayer" }));
        break;
      }

      case "demotecommander": {
        if (!msg.steamId && !msg.eosId) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing player ID" }));
          return;
        }
        if (msg.steamId) {
          await squadjsSocket.executeRcon(serverKey, "execute", `AdminDemoteCommander ${msg.steamId}`);
        } else {
          await squadjsSocket.executeRcon(serverKey, "execute", `AdminDemoteCommander ${msg.eosId}`);
        }
        const playerId = msg.steamId || msg.eosId;
        auditDirect(ws.data.userId, ws.data.userName, "rcon.demotecommander", "LiveServer", serverKey, { playerId, playerName: msg.playerName });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "demotecommander" }));
        break;
      }

      case "switchclan": {
        if (!hasPermission(ws, "manage:clan-move")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:clan-move permission required" }));
          return;
        }
        if ((!msg.clanTag && !msg.clanId) || !msg.targetTeam) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing clan identifier or target team" }));
          return;
        }
        const snapshot = squadjsSocket.getSnapshot(serverKey);
        if (!snapshot) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Server not connected" }));
          return;
        }
        const onlineSteamIds = snapshot.players.map((p) => p.steamID).filter(Boolean);
        // Support both clanId (new) and clanTag (legacy)
        const clanWhere = msg.clanId
          ? { clanId: msg.clanId, steamId: { in: onlineSteamIds } }
          : { clan: msg.clanTag, steamId: { in: onlineSteamIds } };
        const clanEntries = await prisma.whitelistEntry.findMany({
          where: clanWhere,
          select: { steamId: true },
        });
        const clanSteamIds = new Set(clanEntries.map((e) => e.steamId));
        const toSwitch = snapshot.players.filter(
          (p) => clanSteamIds.has(p.steamID) && p.teamID !== msg.targetTeam
        );
        if (toSwitch.length === 0) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "No clan members to switch" }));
          return;
        }
        const clanEstimate = Math.ceil((toSwitch.length - 1) * 0.5 + 1);
        ws.send(JSON.stringify({ type: "action_progress", action: "switchclan", count: toSwitch.length, estimatedSeconds: clanEstimate }));
        let switched = 0;
        for (const p of toSwitch) {
          const warnId = p.steamID || p.eosID;
          if (warnId) {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminWarn ${warnId} You are being moved to the other team by an admin.`);
          }
          if (p.steamID) {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChange ${p.steamID}`);
          } else if (p.eosID) {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChangeById ${p.eosID}`);
          }
          switched++;
          if (switched < toSwitch.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.switchclan", "LiveServer", serverKey, { clanId: msg.clanId, clanTag: msg.clanTag, targetTeam: msg.targetTeam, count: switched, playerNames: toSwitch.map((p) => p.name) });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "switchclan" }));
        setTimeout(() => squadjsSocket.refreshPlayers(serverKey), 500);
        break;
      }

      case "get_online_clans": {
        const snapshot = squadjsSocket.getSnapshot(serverKey);
        if (!snapshot) {
          ws.send(JSON.stringify({ type: "online_clans", data: {} }));
          return;
        }
        const steamIds = snapshot.players.map((p) => p.steamID).filter(Boolean);
        if (steamIds.length === 0) {
          ws.send(JSON.stringify({ type: "online_clans", data: {} }));
          return;
        }
        const entries = await prisma.whitelistEntry.findMany({
          where: { steamId: { in: steamIds }, clanId: { not: null } },
          select: { steamId: true, clanId: true, clanRef: { select: { id: true, name: true, tag: true } } },
        });
        const playerMap = new Map(snapshot.players.map((p) => [p.steamID, p]));
        const clanMap: Record<string, { id: string; tag: string; members: { teamID: string; steamId: string; name: string }[] }> = {};
        for (const e of entries) {
          if (!e.clanRef) continue;
          const player = playerMap.get(e.steamId);
          if (!player) continue;
          const key = e.clanRef.id;
          if (!clanMap[key]) clanMap[key] = { id: e.clanRef.id, tag: e.clanRef.tag, members: [] };
          clanMap[key].members.push({ teamID: player.teamID, steamId: player.steamID, name: player.name });
        }
        // Also include legacy clan string entries that haven't been migrated yet
        const legacyEntries = await prisma.whitelistEntry.findMany({
          where: { steamId: { in: steamIds }, clan: { not: null }, clanId: null },
          select: { steamId: true, clan: true },
        });
        for (const e of legacyEntries) {
          if (!e.clan) continue;
          const player = playerMap.get(e.steamId);
          if (!player) continue;
          const key = `legacy:${e.clan}`;
          if (!clanMap[key]) clanMap[key] = { id: "", tag: e.clan, members: [] };
          clanMap[key].members.push({ teamID: player.teamID, steamId: player.steamID, name: player.name });
        }
        // Deduplicate members by steamId within each clan (player may have entries on multiple servers)
        for (const clan of Object.values(clanMap)) {
          const seen = new Set<string>();
          clan.members = clan.members.filter((m) => {
            if (seen.has(m.steamId)) return false;
            seen.add(m.steamId);
            return true;
          });
        }
        ws.send(JSON.stringify({ type: "online_clans", data: clanMap }));
        break;
      }

      case "queueclan": {
        if (!hasPermission(ws, "manage:clan-move")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:clan-move permission required" }));
          return;
        }
        if ((!msg.clanTag && !msg.clanId) || !msg.targetTeam) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing clan identifier or target team" }));
          return;
        }
        const qcSnapshot = squadjsSocket.getSnapshot(serverKey);
        if (!qcSnapshot) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Server not connected" }));
          return;
        }
        const qcOnlineSteamIds = qcSnapshot.players.map((p) => p.steamID).filter(Boolean);
        const qcClanWhere = msg.clanId
          ? { clanId: msg.clanId, steamId: { in: qcOnlineSteamIds } }
          : { clan: msg.clanTag, steamId: { in: qcOnlineSteamIds } };
        const qcClanEntries = await prisma.whitelistEntry.findMany({
          where: qcClanWhere,
          select: { steamId: true },
        });
        const qcClanSteamIds = new Set(qcClanEntries.map((e) => e.steamId));
        const toQueue = qcSnapshot.players.filter(
          (p) => qcClanSteamIds.has(p.steamID) && p.teamID !== msg.targetTeam
        );
        if (toQueue.length === 0) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "No clan members to queue" }));
          return;
        }
        const playersData = toQueue.map((p) => ({
          eosID: p.eosID,
          steamID: p.steamID,
          name: p.name,
        }));
        const qcResult = await squadjsSocket.callMethod(serverKey, "queuePlayersForSwap", playersData) as { success?: boolean; error?: string };
        if (qcResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: qcResult.error || "Queue failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.queueclan", "LiveServer", serverKey, {
          clanId: msg.clanId, clanTag: msg.clanTag, targetTeam: msg.targetTeam,
          count: toQueue.length, playerNames: toQueue.map((p) => p.name),
        });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "queueclan", data: qcResult }));
        break;
      }

      case "queuerandomize": {
        if (!hasPermission(ws, "manage:randomize")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:randomize permission required" }));
          return;
        }
        if (!msg.message || (msg.message !== "all" && msg.message !== "squad")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Invalid mode. Use 'all' or 'squad'" }));
          return;
        }
        const qrResult = await squadjsSocket.callMethod(serverKey, "queueRandomization", msg.message, ws.data.userName) as { success?: boolean; error?: string };
        if (qrResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: qrResult.error || "Queue failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.queuerandomize", "LiveServer", serverKey, { mode: msg.message });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "queuerandomize", data: qrResult }));
        break;
      }

      case "runrandomize": {
        if (!hasPermission(ws, "manage:randomize")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:randomize permission required" }));
          return;
        }
        if (!msg.message || (msg.message !== "all" && msg.message !== "squad")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Invalid mode. Use 'all' or 'squad'" }));
          return;
        }
        const rrResult = await squadjsSocket.callMethod(serverKey, "runRandomization", msg.message, ws.data.userName) as { success?: boolean; error?: string };
        if (rrResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: rrResult.error || "Run failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.runrandomize", "LiveServer", serverKey, { mode: msg.message });
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "runrandomize", data: rrResult }));
        break;
      }

      case "cancelrandomize": {
        if (!hasPermission(ws, "manage:randomize")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:randomize permission required" }));
          return;
        }
        const crResult = await squadjsSocket.callMethod(serverKey, "cancelRandomization") as { success?: boolean; error?: string };
        if (crResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: crResult.error || "Cancel failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.cancelrandomize", "LiveServer", serverKey, {});
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "cancelrandomize", data: crResult }));
        break;
      }

      case "previewbalance": {
        if (!hasPermission(ws, "manage:balance-teams")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:balance-teams permission required" }));
          return;
        }
        const plan = await squadjsSocket.callMethod(serverKey, "getBalancePlan");
        ws.send(JSON.stringify({ type: "balance_plan", data: plan }));
        break;
      }

      case "queuebalance": {
        if (!hasPermission(ws, "manage:balance-teams")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:balance-teams permission required" }));
          return;
        }
        const qbResult = await squadjsSocket.callMethod(serverKey, "queueBalance", ws.data.userName) as { success?: boolean; error?: string };
        if (qbResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: qbResult.error || "Queue failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.queuebalance", "LiveServer", serverKey, {});
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "queuebalance", data: qbResult }));
        break;
      }

      case "cancelbalance": {
        if (!hasPermission(ws, "manage:balance-teams")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "manage:balance-teams permission required" }));
          return;
        }
        const cbResult = await squadjsSocket.callMethod(serverKey, "cancelBalance") as { success?: boolean; error?: string };
        if (cbResult?.success === false) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: cbResult.error || "Cancel failed" }));
          return;
        }
        auditDirect(ws.data.userId, ws.data.userName, "rcon.cancelbalance", "LiveServer", serverKey, {});
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "cancelbalance", data: cbResult }));
        break;
      }

      case "testwarn": {
        if (!ws.data.permissions.includes("developer")) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Developer only" }));
          return;
        }
        if (!msg.eosId || typeof msg.eosId !== "string") {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "eosId required" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "warn", msg.eosId, "Line 1\n\nLine after empty row\n\n\nTwo empty rows above\nNo gap here");
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "testwarn" }));
        break;
      }

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

      default:
        ws.send(JSON.stringify({ type: "action_result", success: false, error: `Unknown action: ${msg.action}` }));
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Action failed";
    ws.send(JSON.stringify({ type: "action_result", success: false, error }));
  }
}

async function handleListDisconnected(ws: ServerWebSocket<WSData>) {
  const serverKey = ws.data.serverKey;
  try {
    const output = await squadjsSocket.executeRcon(serverKey, "execute", "AdminListDisconnectedPlayers", { dedupe: false });
    auditDirect(ws.data.userId, ws.data.userName, "rcon.listdisconnected", "LiveServer", serverKey, {});
    ws.send(JSON.stringify({ type: "rcon_response", command: "AdminListDisconnectedPlayers", output: typeof output === "string" ? output : JSON.stringify(output), success: true }));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Command failed";
    ws.send(JSON.stringify({ type: "rcon_response", command: "AdminListDisconnectedPlayers", output: "", success: false, error }));
  }
}

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

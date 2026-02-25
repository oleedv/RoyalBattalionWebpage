import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { rateLimit, globalRateLimit } from "./middleware/rate-limit";
import { jwtVerify } from "jose";
import auth from "./routes/auth";
import users from "./routes/users";
import roles from "./routes/roles";
import whitelist from "./routes/whitelist";
import tickets from "./routes/tickets";
import matches from "./routes/matches";
import servers from "./routes/servers";
import stats from "./routes/stats";
import adminGroups from "./routes/admin-groups";
import clans from "./routes/clans";
import squadjsConfig from "./routes/squadjs-config";
import serverConfig from "./routes/server-config";
import discordBot from "./routes/discord-bot";
import auditLogs from "./routes/audit-logs";
import { syncMatches } from "./lib/match-sync";
import { generateAdminsCfg } from "./lib/cfg-generator";
import { squadjsSocket } from "./lib/squadjs-socket";
import { syncAllUserRoles } from "./lib/role-sync";
import { auditDirect } from "./lib/audit";
import prisma from "./lib/db";
import type { Permission } from "shared";
import type { ServerWebSocket } from "bun";

const app = new Hono();

app.use("*", secureHeaders());
app.use("*", globalRateLimit(200));

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "https://royalbattalion.com",
      "https://www.royalbattalion.com",
      "https://stg.royalbattalion.xyz",
    ],
    credentials: true,
  })
);

app.route("/auth", auth);
app.route("/users", users);
app.route("/roles", roles);
app.route("/whitelist", whitelist);
app.route("/admin-groups", adminGroups);
app.route("/clans", clans);
app.route("/tickets", tickets);
app.route("/matches", matches);
app.route("/servers", servers);
app.route("/stats", stats);
app.route("/squadjs-config", squadjsConfig);
app.route("/server-config", serverConfig);
app.route("/discord-bot", discordBot);
app.route("/audit-logs", auditLogs);

// Public cfg endpoint (IP-restricted) -- separate from /whitelist to avoid auth middleware
app.get("/admins.cfg", async (c) => {
  const allowedIps = (process.env.CFG_ALLOWED_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowedIps.length > 0) {
    const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      || c.req.header("x-real-ip")
      || "unknown";
    if (!allowedIps.includes(clientIp)) {
      return c.text("Forbidden", 403);
    }
  }
  const server = c.req.query("server");
  const cfg = await generateAdminsCfg(server || undefined);
  return c.text(cfg, 200, { "Content-Type": "text/plain" });
});

app.get("/health", (c) => c.json({ status: "ok" }));

// Global error handler -- return JSON instead of plain text for unhandled exceptions
app.onError((err, c) => {
  console.error("Unhandled API error:", err);
  return c.json({ success: false, error: "Internal server error" }, 500);
});

// Bootstrap default server configs if none exist
(async () => {
  const count = await prisma.serverConfig.count();
  if (count === 0) {
    await prisma.serverConfig.createMany({
      data: [
        { server: "main", label: "Main Server" },
        { server: "battle", label: "Battle Server" },
      ],
    });
    console.log("[bootstrap] Created default ServerConfig rows");
  }
})().catch(console.error);

// Sync SquadJS matches on startup and every 15 minutes
if (process.env.SQUADJS_DATABASE_URL) {
  syncMatches().catch(console.error);
  setInterval(() => syncMatches().catch(console.error), 15 * 60 * 1000);
}

// Sync Discord roles for all users on startup and every 2 minutes
if (process.env.DISCORD_BOT_TOKEN) {
  syncAllUserRoles()
    .then((n) => console.log(`[role-sync] Initial sync: ${n} users updated`))
    .catch(console.error);
  setInterval(
    () =>
      syncAllUserRoles()
        .then((n) => { if (n > 0) console.log(`[role-sync] ${n} users updated`); })
        .catch(console.error),
    2 * 60 * 1000
  );
}

// Cleanup audit logs older than 30 days -- run on startup and every 24 hours
async function cleanupOldAuditLogs() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (count > 0) console.log(`[audit-cleanup] Deleted ${count} entries older than 30 days`);
}
cleanupOldAuditLogs().catch(console.error);
setInterval(() => cleanupOldAuditLogs().catch(console.error), 24 * 60 * 60 * 1000);

// --- WebSocket for live server ---

interface WSData {
  wsType: "live-server" | "presence";
  userId: string;
  userName: string;
  avatarUrl: string | null;
  permissions: Permission[];
  canManage: boolean;
  canView: boolean;
  serverKey: string;
  currentPage: string;
}

const wsClients = new Set<ServerWebSocket<WSData>>();

// --- Presence tracking ---
const presenceClients = new Set<ServerWebSocket<WSData>>();

function broadcastPresence() {
  const users = Array.from(presenceClients).map((ws) => ({
    userId: ws.data.userId,
    userName: ws.data.userName,
    avatarUrl: ws.data.avatarUrl,
    currentPage: ws.data.currentPage,
  }));
  // Deduplicate by userId (keep latest)
  const seen = new Map<string, typeof users[0]>();
  for (const u of users) seen.set(u.userId, u);
  const payload = JSON.stringify({ type: "presence", users: Array.from(seen.values()) });
  for (const ws of presenceClients) {
    try { ws.send(payload); } catch {}
  }
}

// Relay SquadJS events to subscribed WebSocket clients
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
      console.error("[live-server] Failed to send to client, removing:", err);
      wsClients.delete(ws);
    }
  }
});

async function verifyToken(token: string): Promise<WSData | null> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    const userId = payload.userId as string;
    const permissions = payload.permissions as Permission[];
    if (!userId || !permissions) return null;
    const isAdmin = permissions.includes("admin");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordName: true, avatarUrl: true } });
    return {
      wsType: "live-server" as const,
      userId,
      userName: user?.discordName ?? "Unknown",
      avatarUrl: user?.avatarUrl ?? null,
      permissions,
      canManage: isAdmin || permissions.includes("manage:live-server"),
      canView: isAdmin || permissions.includes("view:live-server") || permissions.includes("manage:live-server"),
      serverKey: "",
      currentPage: "",
    };
  } catch (err) {
    console.error("[live-server] Token verification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export default {
  port: Number(process.env.PORT) || 3001,
  fetch(req: Request, server: { upgrade: (req: Request, opts: { data: WSData }) => boolean }) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade for live server
    if (url.pathname === "/live-server/ws") {
      const token = url.searchParams.get("token");
      const serverKey = url.searchParams.get("server") || squadjsSocket.getServerKeys()[0] || "";
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }

      return verifyToken(token).then((data) => {
        if (!data) {
          console.warn("[live-server] WebSocket auth failed for token");
          return new Response("Invalid token", { status: 401 });
        }
        if (!data.canView) {
          return new Response("Live server access required", { status: 403 });
        }
        data.serverKey = serverKey;
        const upgraded = server.upgrade(req, { data });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined as unknown as Response;
      });
    }

    // Handle WebSocket upgrade for presence
    if (url.pathname === "/presence/ws") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }

      return verifyToken(token).then((data) => {
        if (!data) {
          return new Response("Invalid token", { status: 401 });
        }
        data.wsType = "presence";
        data.currentPage = url.searchParams.get("page") || "/dashboard";
        const upgraded = server.upgrade(req, { data });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined as unknown as Response;
      });
    }

    // REST endpoint to list available SquadJS servers
    if (url.pathname === "/live-server/servers") {
      return app.fetch(req);
    }

    // All other requests go through Hono
    return app.fetch(req);
  },
  websocket: {
    open(ws: ServerWebSocket<WSData>) {
      if (ws.data.wsType === "presence") {
        presenceClients.add(ws);
        console.log(`[presence] Connected (${presenceClients.size} clients)`);
        broadcastPresence();
        return;
      }

      wsClients.add(ws);
      console.log(`[live-server] WebSocket connected (${wsClients.size} clients)`);

      // Send available servers + initial snapshot
      ws.send(
        JSON.stringify({
          type: "servers",
          data: squadjsSocket.getServerKeys(),
        })
      );

      const snapshot = squadjsSocket.getSnapshot(ws.data.serverKey);
      ws.send(
        JSON.stringify({
          type: "snapshot",
          data: snapshot || { connected: false, players: [], serverInfo: null, chatLog: [], consoleLog: [], tickRate: null, metricHistory: [] },
          server: ws.data.serverKey,
        })
      );
    },
    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      if (ws.data.wsType === "presence") {
        try {
          const text = typeof message === "string" ? message : message.toString();
          const msg = JSON.parse(text) as { page?: string };
          if (msg.page) {
            ws.data.currentPage = msg.page;
            broadcastPresence();
          }
        } catch {}
        return;
      }

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
        };

        // Handle server switching
        if (msg.action === "switch_server" && msg.server) {
          ws.data.serverKey = msg.server;
          const snapshot = squadjsSocket.getSnapshot(msg.server);
          ws.send(JSON.stringify({
            type: "snapshot",
            data: snapshot || { connected: false, players: [], serverInfo: null, chatLog: [], consoleLog: [], tickRate: null, metricHistory: [] },
            server: msg.server,
          }));
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
        console.error("[live-server] Error handling WebSocket message:", err);
        ws.send(
          JSON.stringify({
            type: "action_result",
            success: false,
            error: "Invalid message format",
          })
        );
      }
    },
    close(ws: ServerWebSocket<WSData>) {
      if (ws.data.wsType === "presence") {
        presenceClients.delete(ws);
        console.log(`[presence] Disconnected (${presenceClients.size} clients)`);
        broadcastPresence();
        return;
      }

      wsClients.delete(ws);
      console.log(`[live-server] WebSocket disconnected (${wsClients.size} clients)`);
    },
  },
};

async function handleAdminAction(
  ws: ServerWebSocket<WSData>,
  msg: { action: string; server?: string; steamId?: string; eosId?: string; playerName?: string; message?: string; reason?: string; teamID?: string; squadID?: string; players?: { steamId?: string; eosId?: string; name?: string }[]; clanTag?: string; clanId?: string; targetTeam?: string }
) {
  const serverKey = ws.data.serverKey;
  console.log(`[live-server] RCON ${msg.action} from user ${ws.data.userId} on ${serverKey}`);

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
        let switched = 0;
        for (const p of msg.players) {
          if (!p.steamId && !p.eosId) continue;
          if (p.steamId) {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChange ${p.steamId}`);
          } else {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChangeById ${p.eosId}`);
          }
          switched++;
          if (switched < msg.players.length) {
            await new Promise((r) => setTimeout(r, 100));
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
        let switched = 0;
        for (const p of toSwitch) {
          if (p.steamID) {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChange ${p.steamID}`);
          } else if (p.eosID) {
            await squadjsSocket.executeRcon(serverKey, "execute", `AdminForceTeamChangeById ${p.eosID}`);
          }
          switched++;
          if (switched < toSwitch.length) {
            await new Promise((r) => setTimeout(r, 100));
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
        ws.send(JSON.stringify({ type: "online_clans", data: clanMap }));
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

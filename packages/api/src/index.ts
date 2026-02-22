import { Hono } from "hono";
import { cors } from "hono/cors";
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
import squadjsConfig from "./routes/squadjs-config";
import { syncMatches } from "./lib/match-sync";
import { generateAdminsCfg } from "./lib/cfg-generator";
import { squadjsSocket } from "./lib/squadjs-socket";
import { syncAllUserRoles } from "./lib/role-sync";
import type { Permission } from "shared";
import type { ServerWebSocket } from "bun";

const app = new Hono();

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
app.route("/tickets", tickets);
app.route("/matches", matches);
app.route("/servers", servers);
app.route("/stats", stats);
app.route("/squadjs-config", squadjsConfig);

// Public cfg endpoint (no auth) -- separate from /whitelist to avoid auth middleware
app.get("/admins.cfg", async (c) => {
  const cfg = await generateAdminsCfg();
  return c.text(cfg, 200, { "Content-Type": "text/plain" });
});

app.get("/health", (c) => c.json({ status: "ok" }));

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

// --- WebSocket for live server ---

interface WSData {
  userId: string;
  permissions: Permission[];
  canManage: boolean;
  canView: boolean;
  serverKey: string;
}

const wsClients = new Set<ServerWebSocket<WSData>>();

// Relay SquadJS events to subscribed WebSocket clients
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
    return {
      userId,
      permissions,
      canManage: isAdmin || permissions.includes("manage:live-server"),
      canView: isAdmin || permissions.includes("view:live-server") || permissions.includes("manage:live-server"),
      serverKey: "",
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

    // REST endpoint to list available SquadJS servers
    if (url.pathname === "/live-server/servers") {
      return app.fetch(req);
    }

    // All other requests go through Hono
    return app.fetch(req);
  },
  websocket: {
    open(ws: ServerWebSocket<WSData>) {
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
      try {
        const text = typeof message === "string" ? message : message.toString();
        const msg = JSON.parse(text) as {
          action: string;
          server?: string;
          steamId?: string;
          eosId?: string;
          message?: string;
          reason?: string;
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
      wsClients.delete(ws);
      console.log(`[live-server] WebSocket disconnected (${wsClients.size} clients)`);
    },
  },
};

async function handleAdminAction(
  ws: ServerWebSocket<WSData>,
  msg: { action: string; server?: string; steamId?: string; eosId?: string; message?: string; reason?: string; teamID?: string; squadID?: string }
) {
  const serverKey = ws.data.serverKey;

  try {
    switch (msg.action) {
      case "warn": {
        const playerId = msg.steamId || msg.eosId;
        if (!playerId || !msg.message) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing player ID or message" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "warn", playerId, msg.message);
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
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "kick" }));
        break;
      }

      case "broadcast":
        if (!msg.message) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing message" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "broadcast", msg.message);
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "broadcast" }));
        break;

      case "switchteam": {
        const playerId = msg.steamId || msg.eosId;
        if (!playerId) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing player ID" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "forceTeamChange", playerId);
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "switchteam" }));
        break;
      }

      case "disband": {
        if (!msg.teamID || !msg.squadID) {
          ws.send(JSON.stringify({ type: "action_result", success: false, error: "Missing team or squad ID" }));
          return;
        }
        await squadjsSocket.executeRcon(serverKey, "disbandSquad", msg.teamID, msg.squadID);
        ws.send(JSON.stringify({ type: "action_result", success: true, action: "disband" }));
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

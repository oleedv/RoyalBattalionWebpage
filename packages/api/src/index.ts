import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { globalRateLimit } from "./middleware/rate-limit";
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
import observability from "./routes/observability";
import { generateAdminsCfg } from "./lib/cfg-generator";
import { squadjsSocket } from "./lib/squadjs-socket";
import { AppError } from "./lib/errors";
import { logger } from "./lib/logger";
import prisma from "./lib/db";
import { env } from "./lib/env";
import { bootstrap } from "./lib/bootstrap";
import { initLiveServerRelay, handleLiveServerOpen, handleLiveServerMessage, handleLiveServerClose } from "./ws/live-server";
import { handlePresenceOpen, handlePresenceMessage, handlePresenceClose } from "./ws/presence";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Permission } from "shared";
import type { ServerWebSocket } from "bun";
import type { WSData } from "./ws/types";

// --- Hono app setup ---

const app = new Hono();

app.use("*", secureHeaders());
app.use("*", globalRateLimit(200));

const origins = [
  "https://royalbattalion.xyz",
  "https://www.royalbattalion.xyz",
  "https://stg.royalbattalion.xyz",
];
if (env.NODE_ENV !== "production") {
  origins.push("http://localhost:3000");
}

app.use(
  "*",
  cors({
    origin: origins,
    credentials: true,
  })
);

// --- Route mounting ---

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
app.route("/observability", observability);

// Public cfg endpoint (IP-restricted) -- separate from /whitelist to avoid auth middleware
app.get("/admins.cfg", async (c) => {
  const allowedIps = env.CFG_ALLOWED_IPS.split(",").map((s) => s.trim()).filter(Boolean);
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
  return c.text(cfg, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

app.get("/health", async (c) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {}
  return c.json({ status: dbOk ? "ok" : "degraded", database: dbOk ? "connected" : "unreachable" });
});
app.get("/live-server/health", (c) => c.json(squadjsSocket.getStatus()));

// Global error handler -- return JSON instead of plain text for unhandled exceptions
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ success: false, error: err.message }, err.statusCode as ContentfulStatusCode);
  }
  logger.error("api", "Unhandled API error", err);
  return c.json({ success: false, error: "Internal server error" }, 500);
});

// --- Bootstrap (DB defaults, cron jobs) ---

bootstrap().catch((err) => logger.error("bootstrap", "Bootstrap failed", err));

// --- WebSocket relay ---

initLiveServerRelay();

// --- Token verification for WebSocket upgrades ---

async function verifyToken(token: string): Promise<WSData | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(env.JWT_SECRET)
    );
    const userId = payload.userId as string;
    const permissions = payload.permissions as Permission[];
    if (!userId || !permissions) return null;
    const isAdmin = permissions.includes("developer");
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
    logger.error("live-server", "Token verification failed", err instanceof Error ? err.message : err);
    return null;
  }
}

function extractToken(req: Request, url: URL): { token: string | null; authProtocol: string | undefined } {
  const protocols = req.headers.get("sec-websocket-protocol")?.split(",").map((p) => p.trim()) || [];
  const authProtocol = protocols.find((p) => p.startsWith("auth-"));
  const token = authProtocol ? authProtocol.slice(5) : url.searchParams.get("token");
  return { token, authProtocol };
}

// --- Bun server export ---

export default {
  port: env.PORT,
  fetch(req: Request, server: { upgrade: (req: Request, opts: { data: WSData; headers?: Record<string, string> }) => boolean }) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade for live server
    if (url.pathname === "/live-server/ws") {
      const { token, authProtocol } = extractToken(req, url);
      const serverKey = url.searchParams.get("server") || squadjsSocket.getServerKeys()[0] || "";
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }

      return verifyToken(token).then((data) => {
        if (!data) {
          logger.warn("live-server", "WebSocket auth failed for token");
          return new Response("Invalid token", { status: 401 });
        }
        if (!data.canView) {
          return new Response("Live server access required", { status: 403 });
        }
        data.serverKey = serverKey;
        const upgraded = server.upgrade(req, {
          data,
          ...(authProtocol ? { headers: { "sec-websocket-protocol": authProtocol } } : {}),
        });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined as unknown as Response;
      });
    }

    // Handle WebSocket upgrade for presence
    if (url.pathname === "/presence/ws") {
      const { token, authProtocol } = extractToken(req, url);
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }

      return verifyToken(token).then((data) => {
        if (!data) {
          return new Response("Invalid token", { status: 401 });
        }
        data.wsType = "presence";
        data.currentPage = url.searchParams.get("page") || "/dashboard";
        const upgraded = server.upgrade(req, {
          data,
          ...(authProtocol ? { headers: { "sec-websocket-protocol": authProtocol } } : {}),
        });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined as unknown as Response;
      });
    }

    // All other requests go through Hono
    return app.fetch(req);
  },
  websocket: {
    open(ws: ServerWebSocket<WSData>) {
      if (ws.data.wsType === "presence") {
        handlePresenceOpen(ws);
        return;
      }
      handleLiveServerOpen(ws);
    },
    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      if (ws.data.wsType === "presence") {
        handlePresenceMessage(ws, message);
        return;
      }
      handleLiveServerMessage(ws, message);
    },
    close(ws: ServerWebSocket<WSData>) {
      if (ws.data.wsType === "presence") {
        handlePresenceClose(ws);
        return;
      }
      handleLiveServerClose(ws);
    },
  },
};

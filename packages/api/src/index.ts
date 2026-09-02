import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { globalRateLimit, rateLimit } from "./middleware/rate-limit";
import { requestLog } from "./middleware/request-log";
import { jwtVerify } from "jose";
import auth from "./routes/auth";
import users from "./routes/users";
import roles from "./routes/roles";
import whitelist from "./routes/whitelist";
import tickets from "./routes/tickets";
import prospects from "./routes/prospects";
import legacyTickets from "./routes/legacy-tickets";
import matches from "./routes/matches";
import servers from "./routes/servers";
import stats from "./routes/stats";
import adminGroups from "./routes/admin-groups";
import clans from "./routes/clans";
import squadjsConfig from "./routes/squadjs-config";
import serverConfig from "./routes/server-config";
import discordBot from "./routes/discord-bot";
import auditLogs from "./routes/audit-logs";
import playtime from "./routes/playtime";
import seedingTracker from "./routes/seeding-tracker";
import playerStats from "./routes/player-stats";
import lobby from "./routes/lobby";
import giveaway from "./routes/giveaway";
import { generateAdminsCfg } from "./lib/cfg-generator";
import { squadjsSocket } from "./lib/squadjs-socket";
import { AppError } from "./lib/errors";
import { logger } from "./lib/logger";
import prisma from "./lib/db";
import getSecretaryDb, { resetSecretaryDb } from "./lib/secretary-db";
import { Prisma } from "./generated/prisma/client";
import { env } from "./lib/env";
import { bootstrap } from "./lib/bootstrap";
import { initLiveServerRelay, handleLiveServerOpen, handleLiveServerMessage, handleLiveServerClose } from "./ws/live-server";
import { handlePresenceOpen, handlePresenceMessage, handlePresenceClose, setHidePresence } from "./ws/presence";
import { printStartupBanner, printReadyBanner, printShutdownBanner } from "./lib/print-banner";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Permission } from "shared";
import type { ServerWebSocket } from "bun";
import type { WSData } from "./ws/types";

// --- Startup banner ---

const bootStartedAt = Date.now();
printStartupBanner();

// --- Hono app setup ---

const app = new Hono();

app.use("*", secureHeaders());
app.use("*", requestLog());
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

// All REST routers are versioned under /v1. Root-level exceptions below
// (/admins.cfg, /health, /live-server/health, WS upgrades) are external/infra
// contracts and intentionally stay unversioned.
app.route("/v1/auth", auth);
app.route("/v1/users", users);
app.route("/v1/roles", roles);
app.route("/v1/whitelist", whitelist);
app.route("/v1/admin-groups", adminGroups);
app.route("/v1/clans", clans);
app.route("/v1/tickets", tickets);
app.route("/v1/prospects", prospects);
app.route("/v1/legacy-tickets", legacyTickets);
app.route("/v1/matches", matches);
app.route("/v1/servers", servers);
app.route("/v1/stats", stats);
app.route("/v1/squadjs-config", squadjsConfig);
app.route("/v1/server-config", serverConfig);
app.route("/v1/discord-bot", discordBot);
app.route("/v1/audit-logs", auditLogs);
app.route("/v1/playtime", playtime);
app.route("/v1/seeding-tracker", seedingTracker);
app.route("/v1/player-stats", playerStats);
app.route("/v1/lobby", lobby);
app.route("/v1/giveaway", giveaway);

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

// Public count of staff-tier whitelist entries (admin / superadmin / founder / owner).
// Filters at the DB level (only staff-tier rows fetched), dedupes by steamId, and
// rate-limited per IP on top of the global limiter to prevent abuse of the public route.
app.get("/v1/admins/team-count", rateLimit(30), async (c) => {
  const tierMatch = ["admin", "owner", "founder"].flatMap((kw) => [
    { role: { contains: kw } },
    { group: { is: { name: { contains: kw } } } },
  ]);
  const rows = await prisma.whitelistEntry.findMany({
    where: {
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        { OR: tierMatch },
      ],
    },
    select: { steamId: true },
    distinct: ["steamId"],
  });
  return c.json({ success: true, data: { count: rows.length } });
});

app.get("/health", async (c) => {
  let dbOk = false;
  let secretaryDbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    logger.warn("health", "Primary DB health check failed", err);
  }
  try {
    if (env.SECRETARY_DATABASE_URL) {
      await getSecretaryDb().$queryRaw(Prisma.sql`SELECT 1`);
      secretaryDbOk = true;
    }
  } catch (err) {
    logger.warn("health", "Secretary DB health check failed; resetting pool", err);
    resetSecretaryDb();
  }
  const allOk = dbOk && (secretaryDbOk || !env.SECRETARY_DATABASE_URL);
  return c.json({
    status: allOk ? "ok" : "degraded",
    database: dbOk ? "connected" : "unreachable",
    secretaryDb: env.SECRETARY_DATABASE_URL
      ? (secretaryDbOk ? "connected" : "unreachable")
      : "not configured",
  });
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

// --- Ready banner (fires after Bun begins listening) ---

async function emitReadyBanner() {
  await new Promise((r) => setTimeout(r, 50));
  const dbStatus: Record<string, boolean> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus.primary = true;
  } catch {
    dbStatus.primary = false;
  }
  if (env.SECRETARY_DATABASE_URL) {
    try {
      await getSecretaryDb().$queryRaw(Prisma.sql`SELECT 1`);
      dbStatus.secretary = true;
    } catch {
      dbStatus.secretary = false;
    }
  }

  printReadyBanner({
    port: env.PORT,
    routeCount: app.routes.length,
    wsEndpoints: ["/live-server/ws", "/presence/ws"],
    dbStatus,
    bootMs: Date.now() - bootStartedAt,
  });
}
emitReadyBanner().catch((err) => logger.error("banner", "Ready banner failed", err));

// --- Shutdown banner ---

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    printShutdownBanner(signal, bootStartedAt);
    process.exit(0);
  });
}

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
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordName: true, displayName: true, avatarUrl: true, disabled: true } });
    if (!user || user.disabled) return null;
    return {
      wsType: "live-server" as const,
      userId,
      userName: user?.discordName ?? "Unknown",
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      permissions,
      canManage: isAdmin || permissions.includes("manage:live-server"),
      // manage:rcon-console is standalone-sufficient for the console, which uses this same
      // WS transport — admit it at the upgrade (RCON access already implies seeing live data).
      canView:
        isAdmin ||
        permissions.includes("view:live-server") ||
        permissions.includes("manage:live-server") ||
        permissions.includes("manage:rcon-console"),
      serverKey: "",
      currentPage: "",
      hidePresence: false,
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
        setHidePresence(data, url.searchParams.get("hidden") === "1");
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
    idleTimeout: 120,
    sendPing: true,
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

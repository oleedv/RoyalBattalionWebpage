import { Hono } from "hono"
import { cors } from "hono/cors"
import { serve } from "@hono/node-server"
import { connectSteam, reconnectSteam } from "./auth"
import { startDiscoveryLoop, getCachedServers } from "./discovery"
import { createLobby } from "./lobby"
import { apiCallStore } from "./store"
import { getHealthStatus } from "./health"

const app = new Hono()
const PORT = Number(process.env.PORT) || 3002
const INTERNAL_KEY = process.env.LOBBY_INTERNAL_KEY || ""

// --- CORS ---
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
)

// --- Global rate limiter (1 req/sec for public API) ---
let lastPublicRequest = 0

function isRateLimited(): boolean {
  const now = Date.now()
  if (now - lastPublicRequest < 1000) {
    return true
  }
  lastPublicRequest = now
  return false
}

// --- Internal auth middleware ---
function requireInternalKey(c: Parameters<Parameters<typeof app.use>[1]>[0], next: () => Promise<void>) {
  const key = c.req.header("X-Internal-Key")
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401)
  }
  return next()
}

// --- Public routes ---

app.post("/api/v1/lobby/:serverName", async (c) => {
  const start = Date.now()
  const serverName = decodeURIComponent(c.req.param("serverName"))
  const callerIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"

  if (isRateLimited()) {
    apiCallStore.logRateLimitHit()
    apiCallStore.log({
      timestamp: Date.now(),
      endpoint: `POST /api/v1/lobby/${serverName}`,
      callerIp,
      serverRequested: serverName,
      status: 429,
      latencyMs: Date.now() - start,
    })
    return c.json(
      { success: false, error: "Rate limited. Try again in 1 second." },
      429
    )
  }

  try {
    const result = await createLobby(serverName)
    apiCallStore.log({
      timestamp: Date.now(),
      endpoint: `POST /api/v1/lobby/${serverName}`,
      callerIp,
      serverRequested: serverName,
      status: 200,
      latencyMs: Date.now() - start,
    })
    return c.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    apiCallStore.log({
      timestamp: Date.now(),
      endpoint: `POST /api/v1/lobby/${serverName}`,
      callerIp,
      serverRequested: serverName,
      status: 500,
      latencyMs: Date.now() - start,
      error: message,
    })
    return c.json({ success: false, error: message }, 500)
  }
})

app.get("/api/v1/servers", async (c) => {
  const start = Date.now()
  const callerIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"

  if (isRateLimited()) {
    apiCallStore.logRateLimitHit()
    apiCallStore.log({
      timestamp: Date.now(),
      endpoint: "GET /api/v1/servers",
      callerIp,
      serverRequested: "",
      status: 429,
      latencyMs: Date.now() - start,
    })
    return c.json(
      { success: false, error: "Rate limited. Try again in 1 second." },
      429
    )
  }

  const servers = getCachedServers().map((s) => ({
    sessionId: s.sessionId,
    serverName: s.serverName,
    mapName: s.mapName,
    playerCount: s.playerCount,
    maxPlayers: s.maxPlayers,
  }))

  apiCallStore.log({
    timestamp: Date.now(),
    endpoint: "GET /api/v1/servers",
    callerIp,
    serverRequested: "",
    status: 200,
    latencyMs: Date.now() - start,
  })

  return c.json({ success: true, data: servers })
})

// --- Internal routes ---

app.get("/internal/stats", (c, next) => requireInternalKey(c, next), (c) => {
  return c.json({
    success: true,
    data: {
      stats: apiCallStore.getStats(),
      recentCalls: apiCallStore.getRecentCalls(100),
    },
  })
})

app.get("/internal/health", (c) => {
  return c.json({ success: true, data: getHealthStatus() })
})

app.post("/internal/steam/reconnect", (c, next) => requireInternalKey(c, next), async (c) => {
  try {
    await reconnectSteam()
    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return c.json({ success: false, error: message }, 500)
  }
})

// --- Startup ---

async function start() {
  console.log(`[lobby-service] Starting on port ${PORT}...`)

  // Connect to Steam
  try {
    await connectSteam()
  } catch (err) {
    console.error(
      "[lobby-service] Steam connection failed on startup:",
      err instanceof Error ? err.message : err
    )
    console.warn("[lobby-service] Service will start but lobby creation will fail until Steam connects")
  }

  // Start EOS server discovery loop
  startDiscoveryLoop()

  serve({ fetch: app.fetch, port: PORT })
  console.log(`[lobby-service] Listening on port ${PORT}`)
}

start()

import { Hono } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { authMiddleware } from "../middleware/auth"
import { requirePermission } from "../middleware/permissions"
import { logger } from "../lib/logger"
import { success, fail } from "../lib/crud-helpers"

const lobby = new Hono()

const LOBBY_SERVICE_URL =
  process.env.LOBBY_SERVICE_URL || "https://lobby.royalbattalion.xyz"
const INTERNAL_KEY = process.env.LOBBY_INTERNAL_KEY || ""

// Public route - no auth required. Registered BEFORE the auth middleware so it
// stays unauthenticated.
lobby.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const serverName = (body as { serverName?: string }).serverName
  if (!serverName) {
    return fail(c, "serverName is required", 400)
  }
  try {
    const res = await fetch(
      `${LOBBY_SERVICE_URL}/api/v1/lobby/${encodeURIComponent(serverName)}`,
      { method: "POST" }
    )
    const data = await res.json()
    return success(c, data, res.status as ContentfulStatusCode)
  } catch (err) {
    logger.error("lobby", "Lobby service unreachable (create)", { serverName, err })
    return fail(c, "Lobby service unreachable", 502)
  }
})

// All other routes require auth
lobby.use("*", authMiddleware, requirePermission("developer"))

async function proxyToLobbyService(
  method: string,
  path: string
): Promise<{ data: unknown; status: number }> {
  const res = await fetch(`${LOBBY_SERVICE_URL}${path}`, {
    method,
    headers: {
      "X-Internal-Key": INTERNAL_KEY,
    },
  })
  const data = await res.json()
  return { data, status: res.status }
}

lobby.get("/stats", async (c) => {
  try {
    const { data } = await proxyToLobbyService("GET", "/internal/stats")
    return success(c, data)
  } catch (err) {
    logger.error("lobby", "Lobby service unreachable (stats)", { err })
    return fail(c, "Lobby service unreachable", 502)
  }
})

lobby.get("/health", async (c) => {
  try {
    const { data } = await proxyToLobbyService("GET", "/internal/health")
    return success(c, data)
  } catch (err) {
    logger.warn("lobby", "Lobby service unreachable (health)", { err })
    return fail(c, "Lobby service unreachable", 502)
  }
})

lobby.post("/steam/reconnect", async (c) => {
  try {
    const { data } = await proxyToLobbyService("POST", "/internal/steam/reconnect")
    return success(c, data, 202)
  } catch (err) {
    logger.error("lobby", "Lobby service unreachable (steam/reconnect)", { err })
    return fail(c, "Lobby service unreachable", 502)
  }
})

export default lobby

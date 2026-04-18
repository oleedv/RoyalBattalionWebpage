import { Hono } from "hono"
import { authMiddleware } from "../middleware/auth"
import { requirePermission } from "../middleware/permissions"
import { logger } from "../lib/logger"

const lobby = new Hono()

// Public route - no auth required
lobby.post("/create/:serverName", async (c) => {
  const serverName = decodeURIComponent(c.req.param("serverName"))
  try {
    const res = await fetch(
      `${LOBBY_SERVICE_URL}/api/v1/lobby/${encodeURIComponent(serverName)}`,
      { method: "POST" }
    )
    const data = await res.json()
    return c.json(data, res.status as 200)
  } catch (err) {
    logger.error("lobby", "Lobby service unreachable (create)", { serverName, err })
    return c.json({ success: false, error: "Lobby service unreachable" }, 502)
  }
})

// All other routes require auth
lobby.use("*", authMiddleware, requirePermission("developer"))

const LOBBY_SERVICE_URL =
  process.env.LOBBY_SERVICE_URL || "https://lobby.royalbattalion.xyz"
const INTERNAL_KEY = process.env.LOBBY_INTERNAL_KEY || ""

async function proxyToLobbyService(
  method: string,
  path: string
): Promise<Response> {
  const res = await fetch(`${LOBBY_SERVICE_URL}${path}`, {
    method,
    headers: {
      "X-Internal-Key": INTERNAL_KEY,
    },
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

lobby.get("/stats", async (c) => {
  try {
    const res = await proxyToLobbyService("GET", "/internal/stats")
    return res
  } catch (err) {
    logger.error("lobby", "Lobby service unreachable (stats)", { err })
    return c.json(
      { success: false, error: "Lobby service unreachable" },
      502
    )
  }
})

lobby.get("/health", async (c) => {
  try {
    const res = await proxyToLobbyService("GET", "/internal/health")
    return res
  } catch (err) {
    logger.warn("lobby", "Lobby service unreachable (health)", { err })
    return c.json(
      { success: false, error: "Lobby service unreachable" },
      502
    )
  }
})

lobby.post("/steam/reconnect", async (c) => {
  try {
    const res = await proxyToLobbyService("POST", "/internal/steam/reconnect")
    return res
  } catch (err) {
    logger.error("lobby", "Lobby service unreachable (steam/reconnect)", { err })
    return c.json(
      { success: false, error: "Lobby service unreachable" },
      502
    )
  }
})

export default lobby

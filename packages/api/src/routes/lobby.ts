import { Hono } from "hono"
import { authMiddleware } from "../middleware/auth"
import { requirePermission } from "../middleware/permissions"

const lobby = new Hono()
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
  } catch {
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
  } catch {
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
  } catch {
    return c.json(
      { success: false, error: "Lobby service unreachable" },
      502
    )
  }
})

export default lobby

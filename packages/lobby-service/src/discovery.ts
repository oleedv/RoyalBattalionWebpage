import axios from "axios"
import { getEosToken } from "./auth"

const EOS_MATCHMAKING_URL =
  "https://api.epicgames.dev/matchmaking/v1/5dee4062a90b42cd98fcad618b6636c2/filter"

interface ServerSession {
  sessionId: string
  serverName: string
  mapName: string
  playerCount: number
  maxPlayers: number
  attributes: Record<string, unknown>
}

// Cache of known servers
const serverCache = new Map<string, ServerSession>()
let lastRefresh = 0
const REFRESH_INTERVAL = 30_000 // 30 seconds

// Known server name mappings
const SERVER_ALIASES: Record<string, string[]> = {
  "Royal Battalion": ["Royal Battalion"],
  "RB Battle": ["RB Battle"],
}

export function getCachedServers(): ServerSession[] {
  return Array.from(serverCache.values())
}

export function getLastRefreshTime(): number {
  return lastRefresh
}

export function findServerSession(
  serverName: string
): ServerSession | undefined {
  // Direct match first
  for (const session of serverCache.values()) {
    if (
      session.serverName.toLowerCase().includes(serverName.toLowerCase())
    ) {
      return session
    }
  }

  // Try aliases
  const aliases = SERVER_ALIASES[serverName]
  if (aliases) {
    for (const alias of aliases) {
      for (const session of serverCache.values()) {
        if (
          session.serverName.toLowerCase().includes(alias.toLowerCase())
        ) {
          return session
        }
      }
    }
  }

  return undefined
}

export async function refreshServerDiscovery(): Promise<void> {
  const token = getEosToken()
  if (!token) {
    console.warn("[discovery] No EOS token available, skipping refresh")
    return
  }

  try {
    const res = await axios.post(
      EOS_MATCHMAKING_URL,
      {
        criteria: [
          {
            key: "attributes.SERVERNAMEF_s",
            op: "CONTAINS",
            value: "Royal",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    )

    const sessions = res.data?.sessions || []
    serverCache.clear()

    for (const s of sessions) {
      const attrs = s.attributes || {}
      const session: ServerSession = {
        sessionId: s.id,
        serverName: attrs.SERVERNAMEF_s || "Unknown",
        mapName: attrs.MAPNAME_s || "Unknown",
        playerCount: attrs.MATCHINGPLAYERS_i || 0,
        maxPlayers: attrs.MAXPUBLICPLAYERS_i || 100,
        attributes: attrs,
      }
      serverCache.set(session.sessionId, session)
    }

    lastRefresh = Date.now()
    console.log(`[discovery] Refreshed: ${serverCache.size} server(s) found`)
  } catch (err) {
    console.error(
      "[discovery] Refresh failed:",
      err instanceof Error ? err.message : err
    )
  }
}

// Start periodic refresh
export function startDiscoveryLoop(): void {
  // Initial refresh
  refreshServerDiscovery()
  setInterval(refreshServerDiscovery, REFRESH_INTERVAL)
}

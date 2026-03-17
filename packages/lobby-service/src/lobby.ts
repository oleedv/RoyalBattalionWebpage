import steamworks from "steamworks.js"
import { findServerSession } from "./discovery"

const SQUAD_APP_ID = 393380
const LOBBY_LIFETIME_MS = 60_000 // Auto-cleanup after 60s

let client: ReturnType<typeof steamworks.init> | null = null
let initialized = false

export function initSteamworks(): void {
  if (initialized) return
  try {
    client = steamworks.init(SQUAD_APP_ID)
    initialized = true
    console.log("[lobby] steamworks.js initialized")
  } catch (err) {
    console.error(
      "[lobby] steamworks.js init failed:",
      err instanceof Error ? err.message : err
    )
  }
}

export async function createLobby(
  serverName: string
): Promise<{ url: string; serverId: string; serverName: string }> {
  if (!client || !initialized) {
    throw new Error("steamworks.js not initialized")
  }

  const session = findServerSession(serverName)
  if (!session) {
    throw new Error(`Server "${serverName}" not found in discovery cache`)
  }

  const buildId = process.env.SQUAD_BUILD_ID || "0"

  // Create a friends-only lobby
  const lobbyId = await client.matchmaking.createLobby(
    steamworks.LobbyType.FriendsOnly,
    2
  )

  // Set lobby metadata for Squad to recognize it
  client.matchmaking.setLobbyData(lobbyId, "buildid", buildId)
  client.matchmaking.setLobbyData(lobbyId, "CONMETHOD", "P2P")
  client.matchmaking.setLobbyData(lobbyId, "SESSIONFLAGS", "227")
  client.matchmaking.setLobbyData(
    lobbyId,
    "RedpointEOSRoomId_s",
    `Session:${session.sessionId}`
  )
  client.matchmaking.setLobbyData(
    lobbyId,
    "RedpointEOSRoomNamespace_s",
    "Synthetic"
  )

  const url = `steam://joinlobby/${SQUAD_APP_ID}/${lobbyId}`

  // Schedule lobby cleanup
  setTimeout(() => {
    try {
      client?.matchmaking.leaveLobby(lobbyId)
      console.log(`[lobby] Cleaned up lobby ${lobbyId}`)
    } catch {
      // Ignore cleanup errors
    }
  }, LOBBY_LIFETIME_MS)

  console.log(
    `[lobby] Created lobby ${lobbyId} for "${session.serverName}" (session: ${session.sessionId})`
  )

  return {
    url,
    serverId: session.sessionId,
    serverName: session.serverName,
  }
}

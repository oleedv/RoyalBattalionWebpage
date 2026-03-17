import { getSteamClient, isSteamConnected } from "./auth"
import { findServerSession, getSquadBuildId } from "./discovery"

const SQUAD_APP_ID = 393380
const LOBBY_LIFETIME_MS = 60_000 // Auto-cleanup after 60s

// EMsg values for MMS lobby operations
const EMsg = {
  ClientMMSCreateLobby: 6601,
  ClientMMSCreateLobbyResponse: 6602,
  ClientMMSSetLobbyData: 6609,
  ClientMMSSetLobbyDataResponse: 6610,
  ClientMMSLeaveLobby: 6605,
  ClientMMSLeaveLobbyResponse: 6606,
} as const

// ELobbyType from Steam SDK
const ELobbyType = {
  Private: 0,
  FriendsOnly: 1,
  Public: 2,
  Invisible: 3,
} as const

function encodeLobbyMetadata(data: Record<string, string>): Buffer {
  // Steam lobby metadata is encoded as key-value pairs:
  // Each entry: key\0value\0
  const parts: string[] = []
  for (const [key, value] of Object.entries(data)) {
    parts.push(key, value)
  }
  // Null-separated with trailing null
  return Buffer.from(parts.join("\0") + "\0", "utf8")
}

function sendMMS(emsg: number, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const client = getSteamClient() as any
  if (!client) throw new Error("Steam client not connected")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("MMS request timed out")), 10_000)
    client._send(emsg, body, (response: Record<string, unknown>) => {
      clearTimeout(timeout)
      resolve(response)
    })
  })
}

export async function createLobby(
  serverName: string
): Promise<{ url: string; serverId: string; serverName: string }> {
  if (!isSteamConnected()) {
    throw new Error("Steam not connected")
  }

  const session = findServerSession(serverName)
  if (!session) {
    throw new Error(`Server "${serverName}" not found in discovery cache`)
  }

  const buildId = getSquadBuildId()

  const metadata = encodeLobbyMetadata({
    buildid: buildId,
    CONMETHOD: "P2P",
    SESSIONFLAGS: "227",
    RedpointEOSRoomId_s: `Session:${session.sessionId}`,
    RedpointEOSRoomNamespace_s: "Synthetic",
  })

  // Create lobby via MMS protocol
  const createResponse = await sendMMS(EMsg.ClientMMSCreateLobby, {
    app_id: SQUAD_APP_ID,
    max_members: 2,
    lobby_type: ELobbyType.FriendsOnly,
    lobby_flags: 0,
    metadata,
  }) as { steam_id_lobby?: { low: number; high: number } | string | bigint; eresult?: number }

  if (createResponse.eresult && createResponse.eresult !== 1) {
    throw new Error(`Failed to create lobby: EResult ${createResponse.eresult}`)
  }

  const lobbyId = createResponse.steam_id_lobby
  if (!lobbyId) {
    throw new Error("No lobby ID returned from Steam")
  }

  // Convert lobby ID to string for the URL
  const lobbyIdStr = typeof lobbyId === "object" && "low" in lobbyId
    ? (BigInt(lobbyId.high >>> 0) << 32n | BigInt(lobbyId.low >>> 0)).toString()
    : String(lobbyId)

  const url = `steam://joinlobby/${SQUAD_APP_ID}/${lobbyIdStr}`

  // Schedule lobby cleanup
  setTimeout(async () => {
    try {
      await sendMMS(EMsg.ClientMMSLeaveLobby, {
        app_id: SQUAD_APP_ID,
        steam_id_lobby: lobbyId,
      })
      console.log(`[lobby] Cleaned up lobby ${lobbyIdStr}`)
    } catch {
      // Ignore cleanup errors
    }
  }, LOBBY_LIFETIME_MS)

  console.log(
    `[lobby] Created lobby ${lobbyIdStr} for "${session.serverName}" (session: ${session.sessionId})`
  )

  return {
    url,
    serverId: session.sessionId,
    serverName: session.serverName,
  }
}

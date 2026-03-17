import SteamUser from "steam-user"
import axios from "axios"

const EOS_TOKEN_URL = "https://api.epicgames.dev/auth/v1/oauth/token"
const DEPLOYMENT_ID = "5dee4062a90b42cd98fcad618b6636c2"

// Squad game client OAuth credentials (public, used by every game client)
// Source: https://github.com/gamedig/node-gamedig/blob/main/protocols/squad.js
const EOS_CLIENT_ID = "xyza7891J7d3GU8ZIwCoC5xdBsdoqVWA"
const EOS_CLIENT_SECRET = "4SLVBqAm09q776SIlQRTD6moM/bnGAWhDSqOxJAIS0s"
const EOS_BASIC_AUTH = btoa(`${EOS_CLIENT_ID}:${EOS_CLIENT_SECRET}`)

let steamClient: SteamUser | null = null
let eosToken: string | null = null
let eosTokenExpiry = 0
let steamConnected = false
let steamConnecting = false

export function isSteamConnected(): boolean {
  return steamConnected
}

export function isEosTokenValid(): boolean {
  return !!eosToken && Date.now() < eosTokenExpiry
}

export function getEosTokenTTL(): number {
  if (!eosToken) return 0
  return Math.max(0, Math.floor((eosTokenExpiry - Date.now()) / 1000))
}

export function getEosToken(): string | null {
  if (!eosToken || Date.now() >= eosTokenExpiry) return null
  return eosToken
}

async function exchangeForEosToken(): Promise<void> {
  if (!steamClient || !steamConnected) {
    throw new Error("Steam client not connected")
  }

  // Get a session ticket for Squad (AppID 393380)
  const ticket = await new Promise<Buffer>((resolve, reject) => {
    steamClient!.createAuthSessionTicket(393380, (err, sessionTicket) => {
      if (err) return reject(err)
      resolve(sessionTicket.sessionTicket)
    })
  })

  const ticketHex = ticket.toString("hex")

  const res = await axios.post(
    EOS_TOKEN_URL,
    new URLSearchParams({
      grant_type: "external_auth",
      external_auth_type: "steam_session_ticket",
      external_auth_token: ticketHex,
      deployment_id: DEPLOYMENT_ID,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${EOS_BASIC_AUTH}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  )

  eosToken = res.data.access_token
  // Refresh 5 minutes before expiry
  const expiresIn = res.data.expires_in || 3600
  eosTokenExpiry = Date.now() + (expiresIn - 300) * 1000

  console.log(
    `[auth] EOS token acquired, expires in ${expiresIn}s`
  )

  // Schedule auto-refresh
  setTimeout(
    () => {
      exchangeForEosToken().catch((err) =>
        console.error("[auth] EOS token refresh failed:", err.message)
      )
    },
    (expiresIn - 300) * 1000
  )
}

export async function connectSteam(): Promise<void> {
  if (steamConnecting) return
  steamConnecting = true

  const refreshToken = process.env.STEAM_REFRESH_TOKEN
  if (!refreshToken) {
    steamConnecting = false
    throw new Error("STEAM_REFRESH_TOKEN not configured")
  }

  return new Promise<void>((resolve, reject) => {
    steamClient = new SteamUser()

    steamClient.on("loggedOn", async () => {
      steamConnected = true
      steamConnecting = false
      console.log("[auth] Steam logged in")

      try {
        await exchangeForEosToken()
        resolve()
      } catch (err) {
        console.error("[auth] Initial EOS token exchange failed:", err)
        // Still resolve - Steam is connected, EOS can retry
        resolve()
      }
    })

    steamClient.on("error", (err) => {
      steamConnected = false
      steamConnecting = false
      console.error("[auth] Steam error:", err.message)
      reject(err)
    })

    steamClient.on("disconnected", () => {
      steamConnected = false
      console.warn("[auth] Steam disconnected, will auto-reconnect")
    })

    steamClient.logOn({ refreshToken })
  })
}

export async function reconnectSteam(): Promise<void> {
  if (steamClient) {
    steamClient.logOff()
    steamClient = null
    steamConnected = false
  }
  eosToken = null
  eosTokenExpiry = 0
  await connectSteam()
}

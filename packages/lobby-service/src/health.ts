import { isSteamConnected, isEosTokenValid, getEosTokenTTL } from "./auth"
import { getCachedServers, getLastRefreshTime } from "./discovery"

const startTime = Date.now()

export function getHealthStatus() {
  return {
    steam: {
      connected: isSteamConnected(),
    },
    eos: {
      tokenValid: isEosTokenValid(),
      tokenTTLSeconds: getEosTokenTTL(),
    },
    discovery: {
      serverCount: getCachedServers().length,
      lastRefresh: getLastRefreshTime()
        ? new Date(getLastRefreshTime()).toISOString()
        : null,
    },
    service: {
      uptime: Math.floor((Date.now() - startTime) / 1000),
      buildId: process.env.SQUAD_BUILD_ID || "not set",
    },
  }
}

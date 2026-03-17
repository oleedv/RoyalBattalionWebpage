export interface ApiCallEntry {
  timestamp: number
  endpoint: string
  callerIp: string
  serverRequested: string
  status: number
  latencyMs: number
}

const BUFFER_SIZE = 1000

class ApiCallStore {
  private buffer: ApiCallEntry[] = []
  private rateLimitHits = 0
  private totalCalls = 0
  private totalErrors = 0
  private totalLatencyMs = 0

  log(entry: ApiCallEntry) {
    this.buffer.push(entry)
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift()
    }
    this.totalCalls++
    this.totalLatencyMs += entry.latencyMs
    if (entry.status >= 400) {
      this.totalErrors++
    }
  }

  logRateLimitHit() {
    this.rateLimitHits++
  }

  getRecentCalls(limit = 100): ApiCallEntry[] {
    return this.buffer.slice(-limit).reverse()
  }

  getStats() {
    const now = Date.now()
    const oneMinuteAgo = now - 60_000
    const oneHourAgo = now - 3_600_000
    const oneDayAgo = now - 86_400_000

    const callsThisMinute = this.buffer.filter(
      (e) => e.timestamp >= oneMinuteAgo
    ).length
    const callsThisHour = this.buffer.filter(
      (e) => e.timestamp >= oneHourAgo
    ).length
    const callsToday = this.buffer.filter(
      (e) => e.timestamp >= oneDayAgo
    ).length

    return {
      callsThisMinute,
      callsThisHour,
      callsToday,
      totalCalls: this.totalCalls,
      totalErrors: this.totalErrors,
      rateLimitHits: this.rateLimitHits,
      errorRate:
        this.totalCalls > 0
          ? Number(((this.totalErrors / this.totalCalls) * 100).toFixed(2))
          : 0,
      avgLatencyMs:
        this.totalCalls > 0
          ? Math.round(this.totalLatencyMs / this.totalCalls)
          : 0,
    }
  }
}

export const apiCallStore = new ApiCallStore()

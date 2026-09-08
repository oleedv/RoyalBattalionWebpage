import { env } from "./env";
import { logger } from "./logger";
import type { BattleMetricsServer } from "./live-status-payload";

const CACHE_TTL_MS = 20_000;
const DEFAULT_SERVER_IDS = ["27560507", "36099124"];

let cache: { data: BattleMetricsServer[]; expiry: number } | null = null;

export function getBattleMetricsServerIds(): string[] {
  const ids = env.BATTLEMETRICS_SERVER_IDS;
  if (ids) return ids.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_SERVER_IDS;
}

export function aliasToBmId(server: string, ids: string[]): string | null {
  const key = server.trim().toLowerCase();
  if (key === "main" && ids[0]) return ids[0];
  if ((key === "battle" || key === "rb-battle") && ids[1]) return ids[1];
  if (ids.includes(server.trim())) return server.trim();
  return null;
}

async function fetchOne(serverId: string): Promise<BattleMetricsServer | null> {
  try {
    const res = await fetch(`https://api.battlemetrics.com/servers/${serverId}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { id?: string; attributes?: Record<string, unknown> };
    };
    const attrs = json.data?.attributes;
    if (!attrs) return null;
    const details = (attrs.details ?? {}) as BattleMetricsServer["details"];
    return {
      id: String(json.data?.id ?? serverId),
      name: String(attrs.name ?? "Unknown"),
      ip: typeof attrs.ip === "string" ? attrs.ip : undefined,
      address: (attrs.address as string | null) ?? null,
      location: Array.isArray(attrs.location) ? (attrs.location as number[]) : undefined,
      port: Number(attrs.port ?? 0),
      players: Number(attrs.players ?? 0),
      maxPlayers: Number(attrs.maxPlayers ?? 0),
      rank: attrs.rank == null ? null : Number(attrs.rank),
      status: String(attrs.status ?? "offline"),
      country: attrs.country == null ? null : String(attrs.country),
      updatedAt: attrs.updatedAt == null ? null : String(attrs.updatedAt),
      details,
    };
  } catch (err) {
    logger.warn("live-status", "BattleMetrics fetch failed", { serverId, err });
    return null;
  }
}

export async function fetchBattleMetricsServers(force = false): Promise<BattleMetricsServer[]> {
  const now = Date.now();
  if (!force && cache && cache.expiry > now) return cache.data;
  const ids = getBattleMetricsServerIds();
  const results = await Promise.all(ids.map(fetchOne));
  const data = results.filter((s): s is BattleMetricsServer => s !== null);
  cache = { data, expiry: now + CACHE_TTL_MS };
  return data;
}

export function clearBmCache() {
  cache = null;
}

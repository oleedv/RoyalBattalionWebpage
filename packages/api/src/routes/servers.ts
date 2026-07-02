import { Hono } from "hono";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { success } from "../lib/crud-helpers";

const servers = new Hono();

export interface ServerStatus {
  id: string;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  map: string;
  status: "online" | "offline";
  playerList: { name: string; duration: number }[];
  publicQueue: number;
  reserveQueue: number;
  metricHistory: { time: number; tickRate: number | null; playerCount: number; publicQueue: number; reserveQueue: number }[];
}

const CACHE_TTL_MS = 30_000;
let cache: { data: ServerStatus[]; expiry: number } | null = null;

const DEFAULT_SERVER_IDS = ["27560507", "36099124"];

function getServerIds(): string[] {
  const ids = env.BATTLEMETRICS_SERVER_IDS;
  if (ids) return ids.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_SERVER_IDS;
}

async function fetchServerStatus(serverId: string): Promise<ServerStatus | null> {
  try {
    const res = await fetch(
      `https://api.battlemetrics.com/servers/${serverId}?include=player`,
      { headers: { Accept: "application/json" } }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const attrs = json.data?.attributes;
    if (!attrs) return null;

    const players: { name: string; duration: number }[] = [];
    if (json.included) {
      for (const inc of json.included) {
        if (inc.type === "player") {
          players.push({
            name: inc.attributes?.name || "Unknown",
            duration: inc.meta?.timePlayed || 0,
          });
        }
      }
    }

    return {
      id: serverId,
      name: attrs.name || "Unknown",
      ip: attrs.ip || "",
      port: attrs.port || 0,
      players: attrs.players || 0,
      maxPlayers: attrs.maxPlayers || 100,
      map: attrs.details?.map || "Unknown",
      status: attrs.status === "online" ? "online" : "offline",
      playerList: players,
      publicQueue: 0,
      reserveQueue: 0,
      metricHistory: [],
    };
  } catch (err) {
    logger.warn("servers", "BattleMetrics fetch failed", { serverId, err });
    return null;
  }
}

export async function fetchAllServers(): Promise<ServerStatus[]> {
  const now = Date.now();

  if (cache && cache.expiry > now) {
    return cache.data;
  }

  const ids = getServerIds();
  const results = await Promise.all(ids.map(fetchServerStatus));
  const data = results.filter((s): s is ServerStatus => s !== null);

  cache = { data, expiry: now + CACHE_TTL_MS };
  return data;
}

servers.get("/status", async (c) => {
  const data = await fetchAllServers();
  return success(c, data);
});

export default servers;

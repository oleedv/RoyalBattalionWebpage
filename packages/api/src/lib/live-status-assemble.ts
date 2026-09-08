import prisma from "./db";
import getSecretaryDb from "./secretary-db";
import { Prisma } from "../generated/prisma/client";
import { squadjsSocket, type SquadJSPlayer } from "./squadjs-socket";
import { logger } from "./logger";
import { classifyOnlinePlayers } from "./live-status-classify";
import { buildLiveStatusPayload, type LiveSnapshot, type LiveStatusPayload } from "./live-status-payload";
import {
  aliasToBmId,
  fetchBattleMetricsServers,
  getBattleMetricsServerIds,
} from "./live-status-bm";

const DEFAULT_SEED_THRESHOLD = 40;

async function loadSeedThreshold(): Promise<number> {
  try {
    const db = getSecretaryDb();
    const rows = await db.$queryRaw<{ seed_threshold: number }[]>(
      Prisma.sql`SELECT seed_threshold FROM seeding_config WHERE id = 1 LIMIT 1`,
    );
    if (rows[0]?.seed_threshold != null) return Number(rows[0].seed_threshold);
  } catch (err) {
    logger.warn("live-status", "Could not load seed threshold", { err });
  }
  return DEFAULT_SEED_THRESHOLD;
}

async function loadWhitelistRoles(): Promise<Map<string, Array<{ role: string | null }>>> {
  const rows = await prisma.whitelistEntry.findMany({
    where: {
      deactivatedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      steamId: true,
      role: true,
      group: { select: { name: true } },
    },
  });
  const map = new Map<string, Array<{ role: string | null }>>();
  for (const row of rows) {
    const role = row.group?.name || row.role;
    const list = map.get(row.steamId) ?? [];
    list.push({ role });
    map.set(row.steamId, list);
  }
  return map;
}

function snapshotToLive(key: string): LiveSnapshot | null {
  const snap = squadjsSocket.getSnapshot(key);
  if (!snap) return null;
  return {
    connected: snap.connected,
    players: snap.players as SquadJSPlayer[],
    serverInfo: snap.serverInfo,
    tickRate: snap.tickRate,
    metricHistory: snap.metricHistory,
  };
}

function matchSnapshot(bmName: string, bmIndex: number): { key: string; live: LiveSnapshot } | null {
  const keys = squadjsSocket.getServerKeys();
  const bmLower = bmName.toLowerCase();

  for (const key of keys) {
    const live = snapshotToLive(key);
    const sqName = (live?.serverInfo?.serverName || key).toLowerCase();
    if (bmLower === sqName || bmLower.includes(sqName) || sqName.includes(bmLower)) {
      return { key, live: live ?? { connected: false, players: [], serverInfo: null, tickRate: null, metricHistory: [] } };
    }
  }

  if (keys[bmIndex]) {
    const key = keys[bmIndex];
    const live = snapshotToLive(key);
    if (live) return { key, live };
  }
  return null;
}

export async function assembleLiveStatus(opts: {
  server?: string | null;
  includePlayers: boolean;
}): Promise<{ payloads: LiveStatusPayload[]; notFound: boolean; unavailable: boolean }> {
  const [bmServers, entries, seedThreshold] = await Promise.all([
    fetchBattleMetricsServers(),
    loadWhitelistRoles(),
    loadSeedThreshold(),
  ]);

  const ids = getBattleMetricsServerIds();
  let selected = bmServers;
  if (opts.server) {
    const bmId = aliasToBmId(opts.server, ids);
    const byId = bmId ? bmServers.find((s) => s.id === bmId) : undefined;
    const byKey = squadjsSocket.getServerKeys().includes(opts.server)
      ? matchSnapshot(opts.server, ids.indexOf(opts.server))
      : null;

    if (byId) {
      selected = [byId];
    } else if (byKey) {
      const matchedBm = bmServers.find((s, i) => matchSnapshot(s.name, i)?.key === opts.server);
      selected = matchedBm ? [matchedBm] : [];
      if (selected.length === 0) {
        const live = byKey.live;
        const classification = classifyOnlinePlayers(live.players, entries);
        const payload = buildLiveStatusPayload({
          bm: null,
          live,
          classification,
          includePlayers: opts.includePlayers,
          seedThreshold,
          entriesBySteamId: entries,
        });
        return payload
          ? { payloads: [payload], notFound: false, unavailable: false }
          : { payloads: [], notFound: false, unavailable: true };
      }
    } else {
      return { payloads: [], notFound: true, unavailable: false };
    }
  }

  const payloads: LiveStatusPayload[] = [];
  for (let i = 0; i < selected.length; i++) {
    const bm = selected[i];
    const bmIndex = ids.indexOf(bm.id);
    const matched = matchSnapshot(bm.name, bmIndex < 0 ? i : bmIndex);
    const live = matched?.live ?? null;
    const players = live?.players ?? [];
    const classification = classifyOnlinePlayers(players, entries);
    const payload = buildLiveStatusPayload({
      bm,
      live,
      classification,
      includePlayers: opts.includePlayers,
      seedThreshold,
      entriesBySteamId: entries,
    });
    if (payload) payloads.push(payload);
  }

  if (payloads.length === 0) {
    return { payloads: [], notFound: false, unavailable: true };
  }
  return { payloads, notFound: false, unavailable: false };
}

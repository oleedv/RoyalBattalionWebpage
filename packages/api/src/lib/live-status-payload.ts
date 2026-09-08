import { createHash } from "crypto";
import {
  rosterRoleForSteamId,
  type PlayerClassification,
} from "./live-status-classify";

export type LiveIndicator = "disconnected" | "empty" | "seeding" | "live";

export interface BattleMetricsDetails {
  map?: string;
  gameMode?: string;
  version?: string;
  licensedServer?: boolean;
  licenseId?: string;
  password?: boolean;
  squad_playerReserveCount?: number;
  squad_playTime?: number;
  squad_publicQueueLimit?: number;
  squad_publicQueue?: number;
  squad_reservedQueue?: number;
  squad_teamOne?: string;
  squad_teamTwo?: string;
}

export interface BattleMetricsServer {
  id: string;
  name: string;
  ip?: string;
  address?: string | null;
  location?: number[];
  port?: number;
  players?: number;
  maxPlayers?: number;
  rank?: number | null;
  status?: "online" | "offline" | string;
  country?: string | null;
  updatedAt?: string | null;
  details?: BattleMetricsDetails;
}

export interface LiveSnapshot {
  connected: boolean;
  players: Array<{
    name?: string;
    steamID?: string;
    steamId?: string;
    teamID?: string | number | null;
    role?: string;
  }>;
  serverInfo: {
    serverName?: string;
    currentLayer?: string | null;
    playerCount?: number;
    publicQueue?: number;
    reserveQueue?: number;
    maxPlayers?: number;
    publicSlots?: number;
    reserveSlots?: number;
  } | null;
  tickRate: number | null;
  metricHistory: Array<{ time: number; tickRate: number | null }>;
}

export interface LiveStatusPlayer {
  name: string;
  teamId: number | null;
  rb: boolean;
  role: string;
}

export interface LiveStatusPayload {
  id: string;
  name: string;
  status: "online" | "offline";
  players: LiveStatusPlayer[] | null;
  playerCount: number;
  maxPlayers: number;
  port: number;
  country: string | null;
  rank: number | null;
  map: string | null;
  gameMode: string | null;
  version: string | null;
  password: boolean;
  licensedServer: boolean;
  publicQueue: number;
  reservedQueue: number;
  reserveCount: number;
  publicQueueLimit: number | null;
  playTime: number | null;
  teamOne: string | null;
  teamTwo: string | null;
  updatedAt: string | null;
  live: {
    connected: boolean;
    layer: string | null;
    matchStartedAt: string | null;
    matchDurationSeconds: number | null;
    tps: { avg: number; min: number; max: number; window: "10m" } | null;
    teamOneSize: number;
    teamTwoSize: number;
    rbCount: number;
    prospectCount: number;
    wlCount: number;
    adminCount: number;
    newPlayers1h: number | null;
    seedThreshold: number;
    indicator: LiveIndicator;
  };
}

export function stripSensitiveBm(attrs: Record<string, unknown>): Record<string, unknown> {
  const { ip: _ip, address: _address, location: _location, licenseId: _licenseId, ...rest } = attrs;
  void _ip;
  void _address;
  void _location;
  void _licenseId;
  return rest;
}

export function indicatorFor(
  connected: boolean,
  playerCount: number,
  seedThreshold: number,
): LiveIndicator {
  if (!connected) return "disconnected";
  if (playerCount >= seedThreshold) return "live";
  if (playerCount > 0) return "seeding";
  return "empty";
}

export function computeTps(
  history: Array<{ time: number; tickRate: number | null }>,
  now: number,
): { avg: number; min: number; max: number; window: "10m" } | null {
  const cutoff = now - 10 * 60_000;
  const samples = history
    .filter((s) => s.time >= cutoff && s.tickRate != null)
    .map((s) => s.tickRate as number);
  if (samples.length === 0) return null;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10;
  return { avg, min, max, window: "10m" };
}

export function etagFor(payload: unknown): string {
  const hex = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  return `"${hex}"`;
}

export function buildLiveStatusPayload(opts: {
  bm: BattleMetricsServer | null;
  live: LiveSnapshot | null;
  classification: PlayerClassification;
  includePlayers: boolean;
  seedThreshold: number;
  now?: Date;
  entriesBySteamId?: Map<string, Array<{ role: string | null }>>;
}): LiveStatusPayload | null {
  const { bm, live, classification, includePlayers, seedThreshold } = opts;
  if (!bm && !live) return null;

  const now = opts.now ?? new Date();
  const details = bm?.details ?? {};
  const info = live?.serverInfo;
  const connected = live?.connected === true;
  const playerCount =
    info?.playerCount ??
    live?.players.length ??
    bm?.players ??
    0;
  const playTime = details.squad_playTime ?? null;
  const matchStartedAt =
    playTime != null
      ? new Date(now.getTime() - playTime * 1000).toISOString()
      : null;

  const tps =
    computeTps(live?.metricHistory ?? [], now.getTime()) ??
    (live?.tickRate != null
      ? { avg: live.tickRate, min: live.tickRate, max: live.tickRate, window: "10m" as const }
      : null);

  let roster: LiveStatusPlayer[] | null = null;
  if (includePlayers) {
    const entries = opts.entriesBySteamId ?? new Map();
    roster = (live?.players ?? []).map((p) => {
      const steamId = String(p.steamID || p.steamId || "");
      const tagged = steamId ? rosterRoleForSteamId(steamId, entries) : { rb: false, role: "none" as const };
      return {
        name: p.name || "Unknown",
        teamId: p.teamID != null && p.teamID !== "" ? Number(p.teamID) : null,
        rb: tagged.rb,
        role: tagged.role,
      };
    });
  }

  return {
    id: bm?.id ?? info?.serverName ?? "unknown",
    name: bm?.name ?? info?.serverName ?? "Unknown",
    status: (bm?.status === "online" || connected ? "online" : "offline") as "online" | "offline",
    players: roster,
    playerCount,
    maxPlayers: info?.maxPlayers ?? bm?.maxPlayers ?? 0,
    port: bm?.port ?? 0,
    country: bm?.country ?? null,
    rank: bm?.rank ?? null,
    map: details.map ?? null,
    gameMode: details.gameMode ?? null,
    version: details.version ?? null,
    password: details.password === true,
    licensedServer: details.licensedServer === true,
    publicQueue: info?.publicQueue ?? details.squad_publicQueue ?? 0,
    reservedQueue: info?.reserveQueue ?? details.squad_reservedQueue ?? 0,
    reserveCount: details.squad_playerReserveCount ?? info?.reserveSlots ?? 0,
    publicQueueLimit: details.squad_publicQueueLimit ?? null,
    playTime,
    teamOne: details.squad_teamOne ?? null,
    teamTwo: details.squad_teamTwo ?? null,
    updatedAt: bm?.updatedAt ?? now.toISOString(),
    live: {
      connected,
      layer: info?.currentLayer ?? details.map ?? null,
      matchStartedAt,
      matchDurationSeconds: playTime,
      tps,
      teamOneSize: classification.teamOneSize,
      teamTwoSize: classification.teamTwoSize,
      rbCount: classification.rbCount,
      prospectCount: classification.prospectCount,
      wlCount: classification.wlCount,
      adminCount: classification.adminCount,
      newPlayers1h: null,
      seedThreshold,
      indicator: indicatorFor(connected, playerCount, seedThreshold),
    },
  };
}

import { Hono } from "hono";
import type {
  ApiResponse,
  PlayerStats,
  PlayerStatsWindow,
  PlayerStatsDailyPoint,
  StatWindowKey,
} from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { getSquadJSPool } from "../lib/squadjs-db";
import { logger } from "../lib/logger";

const playerStats = new Hono<{ Variables: { userId: string } }>();

playerStats.use("*", authMiddleware);

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type Row = Record<string, unknown>;

/**
 * Build SELECT columns that aggregate `valueExpr` over the 7/30/90-day and
 * all-time windows. Mirrors the conditional-SUM pattern already used in
 * playtime.ts. Aliases are `<prefix>7`, `<prefix>30`, `<prefix>90`, `<prefix>all`.
 */
function windowCols(prefix: string, valueExpr: string, timeCol = "time"): string {
  const win = (days: number) =>
    `COALESCE(SUM(CASE WHEN ${timeCol} >= DATE_SUB(NOW(), INTERVAL ${days} DAY) THEN ${valueExpr} ELSE 0 END), 0)`;
  return [
    `${win(7)} AS ${prefix}7`,
    `${win(30)} AS ${prefix}30`,
    `${win(90)} AS ${prefix}90`,
    `COALESCE(SUM(${valueExpr}), 0) AS ${prefix}all`,
  ].join(", ");
}

const NON_TK = "(teamkill IS NULL OR teamkill = 0)";

function emptyWindow(): PlayerStatsWindow {
  return {
    kills: 0,
    deaths: 0,
    kdr: 0,
    teamkills: 0,
    revivesGiven: 0,
    revivesReceived: 0,
    playtimeHours: 0,
    seedHours: 0,
    sessions: 0,
    avgSessionMinutes: 0,
    slHours: 0,
    slRounds: 0,
    squadsCreated: 0,
    vehiclesDestroyed: 0,
    fobHabHits: 0,
    seedDays: 0,
  };
}

function emptyPayload(linked: boolean, steamId: string | null): PlayerStats {
  return {
    linked,
    hasData: false,
    steamId,
    playerName: null,
    windows: { d7: emptyWindow(), d30: emptyWindow(), d90: emptyWindow(), all: emptyWindow() },
    records: { favoriteWeapon: null, favoriteMap: null, bestRound: null },
    daily: [],
  };
}

// GET /player-stats — the current user's own Squad stats (requires a linked steamId)
playerStats.get("/", async (c) => {
  const userId = c.get("userId");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { steamId: true },
  });
  const steamId = user?.steamId ?? null;

  if (!steamId) {
    return c.json<ApiResponse<PlayerStats>>({ success: true, data: emptyPayload(false, null) });
  }

  const pool = getSquadJSPool();

  // Resolve the SquadJS player id(s) for this steamId (steam_id is not unique in
  // the schema, so collect every matching row and key combat events by all of them).
  const [playerRows] = await pool.query(
    "SELECT id, name FROM squadjs_players WHERE steam_id = ? ORDER BY last_seen DESC",
    [steamId]
  );
  const players = playerRows as Row[];
  if (players.length === 0) {
    return c.json<ApiResponse<PlayerStats>>({ success: true, data: emptyPayload(true, steamId) });
  }
  const ids = players.map((p) => Number(p.id));
  const playerName = (players[0].name as string) ?? null;

  const q = (sql: string, params: unknown[]) =>
    pool.query(sql, params).then(([rows]) => (rows as Row[])[0] ?? {});
  const qAll = (sql: string, params: unknown[]) =>
    pool.query(sql, params).then(([rows]) => rows as Row[]);

  const [
    combatAtk, // kills + teamkills (wounds inflicted)
    combatDeaths, // deaths (times incapacitated)
    revGiven,
    revRecv,
    conn, // playtime / seed / sessions
    sl, // squad-leader tenure + rounds
    squads, // squads created
    vehicles, // vehicles destroyed
    fobHab, // FOB/HAB damage events dealt
    seedDays, // distinct seed days
    favWeapon,
    favMap,
    bestRound,
    dailyCombat,
    dailyPlay,
  ] = await Promise.all([
    q(
      `SELECT ${windowCols("k", `CASE WHEN ${NON_TK} THEN 1 ELSE 0 END`)},
              ${windowCols("tk", "CASE WHEN teamkill = 1 THEN 1 ELSE 0 END")}
       FROM squadjs_combat_events
       WHERE event_type = 'wound' AND attacker_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("d", "1")}
       FROM squadjs_combat_events
       WHERE event_type = 'wound' AND victim_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("rg", "1")}
       FROM squadjs_combat_events
       WHERE event_type = 'revive' AND reviver_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("rr", "1")}
       FROM squadjs_combat_events
       WHERE event_type = 'revive' AND victim_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("pt", "session_duration")},
              ${windowCols("sd", "seed_duration")},
              ${windowCols("ses", "1")}
       FROM squadjs_connections
       WHERE player_id IN (?) AND event_type = 'leave'`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("sl", "sl_tenure_s", "created_at")},
              ${windowCols("slr", "1", "created_at")}
       FROM squadjs_sl_round_stats
       WHERE player_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("sc", "1")}
       FROM squadjs_squad_creations
       WHERE player_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("vd", `CASE WHEN ${NON_TK} THEN 1 ELSE 0 END`)}
       FROM squadjs_vehicle_destroyed
       WHERE attacker_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT ${windowCols("fh", "1")}
       FROM squadjs_fob_hab_damage
       WHERE player_id IN (?)`,
      [ids]
    ),
    q(
      `SELECT
         COUNT(DISTINCT CASE WHEN seed_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN seed_date END) AS sdd7,
         COUNT(DISTINCT CASE WHEN seed_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN seed_date END) AS sdd30,
         COUNT(DISTINCT CASE WHEN seed_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN seed_date END) AS sdd90,
         COUNT(DISTINCT seed_date) AS sddall
       FROM squadjs_seed_sessions
       WHERE player_id IN (?) AND status = 'completed'`,
      [ids]
    ),
    q(
      `SELECT weapon AS name, COUNT(*) AS kills
       FROM squadjs_combat_events
       WHERE event_type = 'wound' AND attacker_id IN (?) AND ${NON_TK}
         AND weapon IS NOT NULL AND weapon <> ''
       GROUP BY weapon ORDER BY kills DESC LIMIT 1`,
      [ids]
    ),
    q(
      `SELECT m.map AS map, COUNT(*) AS rounds
       FROM squadjs_scoreboard s
       JOIN squadjs_matches m ON m.id = s.match_id
       WHERE s.player_id IN (?) AND m.map IS NOT NULL AND m.map <> ''
       GROUP BY m.map ORDER BY rounds DESC LIMIT 1`,
      [ids]
    ),
    q(
      `SELECT m.map AS map, m.start_time AS date, COUNT(*) AS kills
       FROM squadjs_combat_events ce
       JOIN squadjs_matches m ON m.id = ce.match_id
       WHERE ce.event_type = 'wound' AND ce.attacker_id IN (?) AND ${NON_TK}
       GROUP BY ce.match_id, m.map, m.start_time
       ORDER BY kills DESC LIMIT 1`,
      [ids]
    ),
    qAll(
      `SELECT DATE_FORMAT(time, '%Y-%m-%d') AS d,
              SUM(CASE WHEN attacker_id IN (?) AND ${NON_TK} THEN 1 ELSE 0 END) AS kills,
              SUM(CASE WHEN victim_id IN (?) THEN 1 ELSE 0 END) AS deaths
       FROM squadjs_combat_events
       WHERE event_type = 'wound' AND time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         AND (attacker_id IN (?) OR victim_id IN (?))
       GROUP BY d`,
      [ids, ids, ids, ids]
    ),
    qAll(
      `SELECT DATE_FORMAT(time, '%Y-%m-%d') AS d, COALESCE(SUM(session_duration), 0) AS secs
       FROM squadjs_connections
       WHERE player_id IN (?) AND event_type = 'leave' AND time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
       GROUP BY d`,
      [ids]
    ),
  ]);

  const buildWindow = (s: "7" | "30" | "90" | "all"): PlayerStatsWindow => {
    const kills = num(combatAtk[`k${s}`]);
    const deaths = num(combatDeaths[`d${s}`]);
    const ptSec = num(conn[`pt${s}`]);
    const sessions = num(conn[`ses${s}`]);
    const slSec = num(sl[`sl${s}`]);
    return {
      kills,
      deaths,
      kdr: deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills,
      teamkills: num(combatAtk[`tk${s}`]),
      revivesGiven: num(revGiven[`rg${s}`]),
      revivesReceived: num(revRecv[`rr${s}`]),
      playtimeHours: Math.round((ptSec / 3600) * 10) / 10,
      seedHours: Math.round((num(conn[`sd${s}`]) / 3600) * 10) / 10,
      sessions,
      avgSessionMinutes: sessions > 0 ? Math.round((ptSec / 60 / sessions) * 10) / 10 : 0,
      slHours: Math.round((slSec / 3600) * 10) / 10,
      slRounds: num(sl[`slr${s}`]),
      squadsCreated: num(squads[`sc${s}`]),
      vehiclesDestroyed: num(vehicles[`vd${s}`]),
      fobHabHits: num(fobHab[`fh${s}`]),
      seedDays: num(seedDays[`sdd${s}`]),
    };
  };

  const windows: Record<StatWindowKey, PlayerStatsWindow> = {
    d7: buildWindow("7"),
    d30: buildWindow("30"),
    d90: buildWindow("90"),
    all: buildWindow("all"),
  };

  // Merge daily combat + playtime into a gap-filled 90-day series (ascending).
  const killsByDay = new Map<string, { kills: number; deaths: number }>();
  for (const r of dailyCombat) {
    killsByDay.set(String(r.d), { kills: num(r.kills), deaths: num(r.deaths) });
  }
  const playByDay = new Map<string, number>();
  for (const r of dailyPlay) {
    playByDay.set(String(r.d), num(r.secs));
  }
  const daily: PlayerStatsDailyPoint[] = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
      day.getDate()
    ).padStart(2, "0")}`;
    const c2 = killsByDay.get(key);
    daily.push({
      date: key,
      kills: c2?.kills ?? 0,
      deaths: c2?.deaths ?? 0,
      playtimeHours: Math.round(((playByDay.get(key) ?? 0) / 3600) * 10) / 10,
    });
  }

  const records: PlayerStats["records"] = {
    favoriteWeapon: favWeapon.name
      ? { name: String(favWeapon.name), kills: num(favWeapon.kills) }
      : null,
    favoriteMap: favMap.map ? { map: String(favMap.map), rounds: num(favMap.rounds) } : null,
    bestRound: bestRound.date
      ? {
          map: bestRound.map ? String(bestRound.map) : null,
          date: new Date(bestRound.date as string).toISOString(),
          kills: num(bestRound.kills),
        }
      : null,
  };

  const hasData =
    windows.all.kills > 0 ||
    windows.all.deaths > 0 ||
    windows.all.playtimeHours > 0 ||
    windows.all.sessions > 0;

  const data: PlayerStats = {
    linked: true,
    hasData,
    steamId,
    playerName,
    windows,
    records,
    daily,
  };

  return c.json<ApiResponse<PlayerStats>>({ success: true, data });
});

export default playerStats;

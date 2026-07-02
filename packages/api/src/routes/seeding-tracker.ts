import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { getSquadJSPool } from "../lib/squadjs-db";
import { success, fail } from "../lib/crud-helpers";
import { logger } from "../lib/logger";
import prisma from "../lib/db";
import type {
  SeedTrackerLeaderboardEntry,
  SeedTrackerPlayerDetail,
  SeedTrackerSession,
  SeedTrackerStats,
} from "shared";

const seedingTracker = new Hono();

seedingTracker.use("*", authMiddleware);
seedingTracker.use("*", requirePermission("view:seeding-tracker"));

// Serialize a SquadJS DATE/DATETIME value (Date or string) to ISO-8601, or null.
function toIso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const SELECT_LEADERBOARD_COLS = `
  p.name, p.steam_id AS steamId,
  COUNT(DISTINCT s.seed_date) AS seedDays,
  COALESCE(SUM(COALESCE(s.duration_seconds, TIMESTAMPDIFF(SECOND, s.spawn_time, NOW()))), 0) AS totalDuration,
  AVG(s.quality_score) AS avgQuality,
  MAX(s.seed_date) AS lastSeedDate,
  MAX(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS isActive
`;

function toLeaderboardEntry(row: Record<string, unknown>): SeedTrackerLeaderboardEntry {
  return {
    steamId: String(row.steamId),
    name: String(row.name),
    seedDays: Number(row.seedDays),
    totalDuration: Number(row.totalDuration),
    avgQuality: Math.round(Number(row.avgQuality || 0) * 100) / 100,
    streak: 0,
    lastSeedDate: toIso(row.lastSeedDate),
    isActive: Number(row.isActive) === 1,
  };
}

// GET /players?q=&days=30&limit=50
// Merged leaderboard + search: with ?q= runs the name-search query, otherwise the leaderboard query.
seedingTracker.get("/players", async (c) => {
  const days = Math.min(Math.max(parseInt(c.req.query("days") || "30", 10) || 30, 1), 365);
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50", 10) || 50, 1), 200);
  const q = c.req.query("q")?.trim();

  if (q !== undefined && q.length > 0 && q.length < 2) {
    return fail(c, "Search query must be at least 2 characters", 400);
  }

  try {
    const pool = getSquadJSPool();

    let rows: unknown;
    if (q) {
      const searchQuery = `
        SELECT ${SELECT_LEADERBOARD_COLS}
        FROM squadjs_seed_sessions s
        JOIN squadjs_players p ON p.id = s.player_id
        WHERE p.name LIKE ? AND s.status IN ('completed', 'active')
          AND s.seed_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY s.player_id
        ORDER BY seedDays DESC, totalDuration DESC
        LIMIT ?
      `;
      [rows] = await pool.query(searchQuery, [`%${q}%`, days, limit]);
    } else {
      const leaderboardQuery = `
        SELECT ${SELECT_LEADERBOARD_COLS}
        FROM squadjs_seed_sessions s
        JOIN squadjs_players p ON p.id = s.player_id
        WHERE s.status IN ('completed', 'active')
          AND s.seed_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY s.player_id
        ORDER BY seedDays DESC, totalDuration DESC
        LIMIT ?
      `;
      [rows] = await pool.query(leaderboardQuery, [days, limit]);
    }

    const entries = (rows as Record<string, unknown>[]).map(toLeaderboardEntry);
    return success(c, entries);
  } catch (err) {
    logger.error("seeding-tracker", "Failed to load seeding players", { q, days, limit, err });
    return fail(c, "Failed to load seeding players", 500);
  }
});

// GET /players/:steamId
seedingTracker.get("/players/:steamId", async (c) => {
  const steamId = c.req.param("steamId");

  try {
    const pool = getSquadJSPool();

    // 1. Stats for 30/90/all days
    const statsQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN s.seed_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN s.seed_date END) AS seedDays30,
        COUNT(DISTINCT CASE WHEN s.seed_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN s.seed_date END) AS seedDays90,
        COUNT(DISTINCT s.seed_date) AS seedDaysAll,
        COALESCE(SUM(CASE WHEN s.seed_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN COALESCE(s.duration_seconds, TIMESTAMPDIFF(SECOND, s.spawn_time, NOW())) ELSE 0 END), 0) AS totalDuration30,
        AVG(CASE WHEN s.seed_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN s.quality_score END) AS avgQuality
      FROM squadjs_seed_sessions s
      JOIN squadjs_players p ON p.id = s.player_id
      WHERE p.steam_id = ? AND s.status IN ('completed', 'active')
    `;

    // 2. Time-of-day distribution
    const hourQuery = `
      SELECT HOUR(s.spawn_time) AS hour, COUNT(*) AS cnt
      FROM squadjs_seed_sessions s
      JOIN squadjs_players p ON p.id = s.player_id
      WHERE p.steam_id = ? AND s.status IN ('completed', 'active')
      GROUP BY hour
      ORDER BY hour
    `;

    // 3. Weekday frequency
    const weekdayQuery = `
      SELECT WEEKDAY(s.seed_date) AS day, COUNT(DISTINCT s.seed_date) AS cnt
      FROM squadjs_seed_sessions s
      JOIN squadjs_players p ON p.id = s.player_id
      WHERE p.steam_id = ? AND s.status IN ('completed', 'active')
      GROUP BY day
      ORDER BY day
    `;

    // 4. Recent sessions (last 20)
    const sessionsQuery = `
      SELECT s.id, s.seed_date AS seedDate, s.join_time AS joinTime, s.spawn_time AS spawnTime,
        s.leave_time AS leaveTime, s.join_population AS joinPopulation,
        s.peak_population AS peakPopulation, s.threshold_reached AS thresholdReached,
        s.duration_seconds AS durationSeconds, s.quality_score AS qualityScore, s.status
      FROM squadjs_seed_sessions s
      JOIN squadjs_players p ON p.id = s.player_id
      WHERE p.steam_id = ? AND s.status IN ('completed', 'active')
      ORDER BY s.seed_date DESC, s.spawn_time DESC
      LIMIT 20
    `;

    // 5. Streak dates
    const streakQuery = `
      SELECT DISTINCT s.seed_date AS seedDate
      FROM squadjs_seed_sessions s
      JOIN squadjs_players p ON p.id = s.player_id
      WHERE p.steam_id = ? AND s.status IN ('completed', 'active')
      ORDER BY s.seed_date DESC
      LIMIT 100
    `;

    // 7. Player name
    const nameQuery = `SELECT name FROM squadjs_players WHERE steam_id = ? LIMIT 1`;

    // Run all SquadJS queries in parallel
    const [
      [statsRows],
      [hourRows],
      [weekdayRows],
      [sessionRows],
      [streakRows],
      [nameRows],
    ] = await Promise.all([
      pool.query(statsQuery, [steamId]),
      pool.query(hourQuery, [steamId]),
      pool.query(weekdayQuery, [steamId]),
      pool.query(sessionsQuery, [steamId]),
      pool.query(streakQuery, [steamId]),
      pool.query(nameQuery, [steamId]),
    ]);

    // Unknown / never-seen player -> 404 (no "Unknown" placeholder)
    const nameRow = (nameRows as Record<string, unknown>[])[0];
    if (!nameRow) {
      return fail(c, "Player not found", 404);
    }

    // 6. Whitelist status (Prisma)
    const whitelist = await prisma.whitelistEntry.findFirst({
      where: {
        steamId: steamId,
        server: "main",
        role: "Seeder",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { role: true, expiresAt: true },
    });

    // Parse stats
    const statsRow = (statsRows as Record<string, unknown>[])[0] || {};

    // Build time-of-day distribution (24-element array)
    const timeOfDayDistribution = new Array(24).fill(0);
    for (const row of hourRows as Record<string, unknown>[]) {
      const hour = Number(row.hour);
      if (hour >= 0 && hour < 24) {
        timeOfDayDistribution[hour] = Number(row.cnt);
      }
    }

    // Build weekday frequency (7-element array, Mon=0 through Sun=6)
    const frequencyByWeekday = new Array(7).fill(0);
    for (const row of weekdayRows as Record<string, unknown>[]) {
      const day = Number(row.day);
      if (day >= 0 && day < 7) {
        frequencyByWeekday[day] = Number(row.cnt);
      }
    }

    // Parse recent sessions (all timestamps ISO-8601)
    const recentSessions: SeedTrackerSession[] = (sessionRows as Record<string, unknown>[]).map((row) => ({
      id: Number(row.id),
      seedDate: toIso(row.seedDate)!,
      joinTime: toIso(row.joinTime)!,
      spawnTime: toIso(row.spawnTime),
      leaveTime: toIso(row.leaveTime),
      joinPopulation: Number(row.joinPopulation),
      peakPopulation: Number(row.peakPopulation),
      thresholdReached: Boolean(row.thresholdReached),
      durationSeconds: row.durationSeconds != null ? Number(row.durationSeconds) : null,
      qualityScore: row.qualityScore != null ? Number(row.qualityScore) : null,
      status: String(row.status) as SeedTrackerSession["status"],
    }));

    // Compute streak (consecutive days from most recent)
    const streakDates = (streakRows as Record<string, unknown>[]).map((row) => {
      const d = new Date(String(row.seedDate));
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    });

    let streak = 0;
    if (streakDates.length > 0) {
      streak = 1;
      for (let i = 1; i < streakDates.length; i++) {
        const diff = streakDates[i - 1].getTime() - streakDates[i].getTime();
        const daysDiff = diff / (1000 * 60 * 60 * 24);
        if (Math.round(daysDiff) === 1) {
          streak++;
        } else {
          break;
        }
      }
    }

    const data: SeedTrackerPlayerDetail = {
      steamId,
      name: String(nameRow.name),
      seedDays30: Number(statsRow.seedDays30 || 0),
      seedDays90: Number(statsRow.seedDays90 || 0),
      seedDaysAll: Number(statsRow.seedDaysAll || 0),
      totalDuration30: Number(statsRow.totalDuration30 || 0),
      avgQuality: Math.round(Number(statsRow.avgQuality || 0) * 100) / 100,
      streak,
      timeOfDayDistribution,
      frequencyByWeekday,
      recentSessions,
      whitelistStatus: whitelist
        ? {
            hasWhitelist: true,
            role: whitelist.role,
            expiresAt: whitelist.expiresAt ? whitelist.expiresAt.toISOString() : null,
          }
        : null,
    };

    return success(c, data);
  } catch (err) {
    logger.error("seeding-tracker", "Failed to load seeding player detail", { steamId, err });
    return fail(c, "Failed to load seeding player detail", 500);
  }
});

// GET /stats
seedingTracker.get("/stats", async (c) => {
  try {
    const pool = getSquadJSPool();

    const query = `
      SELECT
        COUNT(DISTINCT s.player_id) AS totalSeeders,
        COALESCE(SUM(COALESCE(s.duration_seconds, TIMESTAMPDIFF(SECOND, s.spawn_time, NOW()))), 0) / 3600 AS totalSeedHours,
        AVG(s.quality_score) AS avgQuality,
        COUNT(DISTINCT CASE WHEN s.seed_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN s.player_id END) AS activeSeeders7d,
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.player_id END) AS currentlySeedingCount
      FROM squadjs_seed_sessions s
      WHERE s.status IN ('completed', 'active')
        AND s.seed_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
    `;

    const [rows] = await pool.query(query);
    const row = (rows as Record<string, unknown>[])[0] || {};

    const data: SeedTrackerStats = {
      totalSeeders: Number(row.totalSeeders || 0),
      totalSeedHours: Math.round(Number(row.totalSeedHours || 0) * 10) / 10,
      avgQuality: Math.round(Number(row.avgQuality || 0) * 100) / 100,
      activeSeeders7d: Number(row.activeSeeders7d || 0),
      currentlySeedingCount: Number(row.currentlySeedingCount || 0),
    };

    return success(c, data);
  } catch (err) {
    logger.error("seeding-tracker", "Failed to load seeding stats", { err });
    return fail(c, "Failed to load seeding stats", 500);
  }
});

export default seedingTracker;

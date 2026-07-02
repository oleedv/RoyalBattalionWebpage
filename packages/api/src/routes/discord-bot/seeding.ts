import { Hono } from "hono";
import { Prisma } from "../../generated/prisma/client";
import type { SeedingConfig, SeedingSession, SeedingRapport, SeedingRapportSeeder } from "shared";
import getSecretaryDb, { resetSecretaryDb } from "../../lib/secretary-db";
import { getSquadJSPool } from "../../lib/squadjs-db";
import { requirePermission } from "../../middleware/permissions";
import { audit } from "../../lib/audit";
import { success, fail } from "../../lib/crud-helpers";
import { logger } from "../../lib/logger";

const seeding = new Hono();

function mapSession(r: any): SeedingSession {
  return {
    id: r.id,
    startedAt: new Date(r.started_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    durationMinutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
    startPlayers: r.start_players != null ? Number(r.start_players) : null,
    peakPlayers: r.peak_players != null ? Number(r.peak_players) : null,
    endPlayers: r.end_players != null ? Number(r.end_players) : null,
    mapName: r.map_name,
    layerName: r.layer_name,
    status: r.status,
    callMessageId: r.call_message_id,
    completionMessageId: r.completion_message_id,
  };
}

// GET /seeding/config
seeding.get(
  "/seeding/config",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT id, enabled, channel_id, role_id, seed_threshold, reset_threshold,
                daily_time, timezone, server_name
         FROM seeding_config WHERE id = 1`
      );

      if (rows.length === 0) {
        return fail(c, "Seeding config not found", 404);
      }

      const r = rows[0];
      const config: SeedingConfig = {
        id: r.id,
        enabled: Boolean(r.enabled),
        channelId: r.channel_id,
        roleId: r.role_id,
        seedThreshold: Number(r.seed_threshold),
        resetThreshold: Number(r.reset_threshold),
        dailyTime: r.daily_time,
        timezone: r.timezone,
        serverName: r.server_name,
      };

      return success(c, config);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding config endpoint error", err);
      return fail(c, "Failed to load seeding config", 500);
    }
  }
);

// PATCH /seeding/config - partial update (omitted fields are left untouched)
seeding.patch(
  "/seeding/config",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const body = await c.req.json<Partial<SeedingConfig>>();

      const sets: Prisma.Sql[] = [];
      if (body.enabled !== undefined) sets.push(Prisma.sql`enabled = ${body.enabled ? 1 : 0}`);
      if (body.seedThreshold !== undefined) sets.push(Prisma.sql`seed_threshold = ${body.seedThreshold}`);
      if (body.resetThreshold !== undefined) sets.push(Prisma.sql`reset_threshold = ${body.resetThreshold}`);
      if (body.dailyTime !== undefined) sets.push(Prisma.sql`daily_time = ${body.dailyTime}`);
      if (body.timezone !== undefined) sets.push(Prisma.sql`timezone = ${body.timezone}`);
      if (body.serverName !== undefined) sets.push(Prisma.sql`server_name = ${body.serverName}`);

      if (sets.length === 0) {
        return fail(c, "No updatable fields provided");
      }

      await getSecretaryDb().$executeRaw(Prisma.sql`
        UPDATE seeding_config SET ${Prisma.join(sets)} WHERE id = 1`
      );

      await audit(c, "discord_bot.update_seeding_config", "discord_bot");
      return success(c, { updated: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding config update error", err);
      return fail(c, "Failed to update seeding config", 500);
    }
  }
);

// GET /seeding/sessions
seeding.get(
  "/seeding/sessions",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const limit = Math.min(Number(c.req.query("limit") || "50"), 100);

      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT id, started_at, completed_at, duration_minutes, start_players,
                peak_players, end_players, map_name, layer_name, status,
                call_message_id, completion_message_id
         FROM seeding_sessions ORDER BY started_at DESC LIMIT ${limit}`
      );

      const sessions: SeedingSession[] = rows.map(mapSession);
      return success(c, sessions);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding sessions endpoint error", err);
      return fail(c, "Failed to load seeding sessions", 500);
    }
  }
);

// GET /seeding/rapport?date=YYYY-MM-DD
seeding.get(
  "/seeding/rapport",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const date = c.req.query("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail(c, "date query parameter required (YYYY-MM-DD)");
    }

    try {
      const pool = getSquadJSPool();
      const [rows] = await pool.query(
        `SELECT
           p.name AS playerName,
           p.steam_id AS steamId,
           j.time AS joinTime,
           l.time AS leaveTime,
           l.seed_duration AS seedDuration,
           l.session_duration AS sessionDuration
         FROM squadjs_connections j
         JOIN squadjs_players p ON p.id = j.player_id
         LEFT JOIN squadjs_connections l ON l.player_id = j.player_id
           AND l.server_id = j.server_id
           AND l.event_type = 'leave'
           AND l.time > j.time
           AND l.time < j.time + INTERVAL 24 HOUR
         WHERE j.event_type = 'join'
           AND j.seed_join = 1
           AND DATE(j.time) = ?
         ORDER BY l.seed_duration DESC`,
        [date]
      );

      const seeders = rows as any[];
      const uniquePlayers = new Set(seeders.map((s: any) => s.steamId || s.playerName));
      const totalSeedSeconds = seeders.reduce((sum: number, s: any) => sum + (s.seedDuration || 0), 0);
      const withDuration = seeders.filter((s: any) => s.seedDuration > 0);
      const avgSeedSeconds = withDuration.length > 0 ? Math.round(totalSeedSeconds / withDuration.length) : 0;

      const rapport: SeedingRapport = {
        date,
        totalSeeders: uniquePlayers.size,
        totalJoins: seeders.length,
        avgSeedMinutes: Math.round(avgSeedSeconds / 60),
        totalSeedMinutes: Math.round(totalSeedSeconds / 60),
        seeders: seeders.map((s: any): SeedingRapportSeeder => ({
          playerName: s.playerName || "Unknown",
          steamId: s.steamId || null,
          joinTime: s.joinTime ? new Date(s.joinTime).toISOString() : null,
          leaveTime: s.leaveTime ? new Date(s.leaveTime).toISOString() : null,
          seedDurationMinutes: s.seedDuration != null ? Math.round(Number(s.seedDuration) / 60) : null,
          sessionDurationMinutes: s.sessionDuration != null ? Math.round(Number(s.sessionDuration) / 60) : null,
        })),
      };

      return success(c, rapport);
    } catch (err) {
      logger.error("discord-bot", "Seeding rapport endpoint error", err);
      return fail(c, "Failed to load seeding rapport", 500);
    }
  }
);

// POST /seeding/send-now - enqueue a seeding call (async -> 202)
seeding.post(
  "/seeding/send-now",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const userId = c.get("userId") as string;
      const db = getSecretaryDb();
      await db.$executeRaw(Prisma.sql`
        INSERT INTO pending_actions (action_type, target_type, target_id, payload, actor_id)
        VALUES ('send_seeding_call', 'seeding', 0, '{}', ${userId})`
      );
      await audit(c, "discord_bot.send_seeding_call", "seeding");
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding send-now error", err);
      return fail(c, "Failed to queue seeding call", 500);
    }
  }
);

// POST /seeding/rapport/send - enqueue a seeding rapport (async -> 202)
seeding.post(
  "/seeding/rapport/send",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const userId = c.get("userId") as string;
    const { date } = await c.req.json<{ date: string }>();

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail(c, "date required (YYYY-MM-DD)");
    }

    try {
      const db = getSecretaryDb();
      await db.$executeRaw(Prisma.sql`
        INSERT INTO pending_actions (action_type, target_type, target_id, payload, actor_id)
        VALUES ('send_seeding_rapport', 'seeding', 0, ${JSON.stringify({ date })}, ${userId})`
      );
      await audit(c, "discord_bot.send_seeding_rapport", "seeding", undefined, { date });
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding rapport send error", err);
      return fail(c, "Failed to queue seeding rapport", 500);
    }
  }
);

export default seeding;

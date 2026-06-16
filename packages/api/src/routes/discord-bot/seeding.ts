import { Hono } from "hono";
import { Prisma } from "../../generated/prisma/client";
import type { SeedingConfig, SeedingSession, SeedingRapport, SeedingRapportSeeder, SeedingLiveStatus, SquadServerOption } from "shared";
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
        SELECT id, enabled, channel_id, role_ids, seed_threshold, reset_threshold,
               daily_time, timezone, announcer_server_id, tracker_server_id, tracker_enabled,
               required_seed_days, rolling_window_days, whitelist_duration_days, max_extension_days,
               progression_channel_id, leaderboard_channel_id
         FROM seeding_config WHERE id = 1`
      );

      if (rows.length === 0) {
        return fail(c, "Seeding config not found", 404);
      }

      const r = rows[0];
      let roleIds: string[] = [];
      if (Array.isArray(r.role_ids)) roleIds = r.role_ids.map((x: unknown) => String(x));
      else if (typeof r.role_ids === "string" && r.role_ids.trim()) {
        try { const p = JSON.parse(r.role_ids); if (Array.isArray(p)) roleIds = p.map((x) => String(x)); } catch { /* ignore */ }
      }

      const config: SeedingConfig = {
        id: r.id,
        enabled: Boolean(r.enabled),
        channelId: r.channel_id,
        roleIds,
        seedThreshold: Number(r.seed_threshold),
        resetThreshold: Number(r.reset_threshold),
        dailyTime: r.daily_time,
        timezone: r.timezone,
        announcerServerId: r.announcer_server_id != null ? Number(r.announcer_server_id) : null,
        trackerServerId: r.tracker_server_id != null ? Number(r.tracker_server_id) : null,
        trackerEnabled: Boolean(r.tracker_enabled),
        requiredSeedDays: Number(r.required_seed_days),
        rollingWindowDays: Number(r.rolling_window_days),
        whitelistDurationDays: Number(r.whitelist_duration_days),
        maxExtensionDays: Number(r.max_extension_days),
        progressionChannelId: r.progression_channel_id,
        leaderboardChannelId: r.leaderboard_channel_id,
      };

      return success(c, config);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding config endpoint error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

// PUT /seeding/config
seeding.put(
  "/seeding/config",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const body = await c.req.json<Partial<SeedingConfig>>();
      const roleIdsJson = JSON.stringify(Array.isArray(body.roleIds) ? body.roleIds.map((x) => String(x)) : []);

      await getSecretaryDb().$queryRaw(Prisma.sql`
        UPDATE seeding_config SET
          enabled = ${body.enabled ? 1 : 0},
          role_ids = ${roleIdsJson},
          seed_threshold = ${body.seedThreshold ?? 40},
          reset_threshold = ${body.resetThreshold ?? 20},
          daily_time = ${body.dailyTime ?? null},
          timezone = ${body.timezone ?? null},
          announcer_server_id = ${body.announcerServerId ?? null},
          tracker_server_id = ${body.trackerServerId ?? null},
          tracker_enabled = ${body.trackerEnabled ? 1 : 0},
          required_seed_days = ${body.requiredSeedDays ?? 10},
          rolling_window_days = ${body.rollingWindowDays ?? 30},
          whitelist_duration_days = ${body.whitelistDurationDays ?? 30},
          max_extension_days = ${body.maxExtensionDays ?? 60},
          progression_channel_id = ${body.progressionChannelId ?? null},
          leaderboard_channel_id = ${body.leaderboardChannelId ?? null}
         WHERE id = 1`
      );

      await audit(c, "discord_bot.update_seeding_config", "discord_bot");
      return success(c, { updated: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding config update error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

// GET /seeding/servers — canonical squadjs_servers list for the config dropdown
seeding.get(
  "/seeding/servers",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const pool = getSquadJSPool();
      const [rows] = await pool.query(`SELECT id, name FROM squadjs_servers ORDER BY id`);
      const servers: SquadServerOption[] = (rows as any[]).map((r) => ({ id: Number(r.id), name: String(r.name) }));
      return success(c, servers);
    } catch (err) {
      return fail(c, `Failed to load server list: ${err instanceof Error ? err.message : String(err)}`, 503);
    }
  }
);

// GET /seeding/live-status — last-known live state written by the bot each tick
seeding.get(
  "/seeding/live-status",
  requirePermission("view:seeding-tracker", "view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT server_resolved_ok, socket_connected, current_population, current_layer, active_session_id, updated_at
         FROM seeding_live_status WHERE id = 1`
      );
      if (rows.length === 0) {
        const empty: SeedingLiveStatus = {
          serverResolvedOk: false, socketConnected: false, currentPopulation: null,
          currentLayer: null, activeSessionId: null, updatedAt: null,
        };
        return success(c, empty);
      }
      const r = rows[0];
      const status: SeedingLiveStatus = {
        serverResolvedOk: Boolean(r.server_resolved_ok),
        socketConnected: Boolean(r.socket_connected),
        currentPopulation: r.current_population != null ? Number(r.current_population) : null,
        currentLayer: r.current_layer ?? null,
        activeSessionId: r.active_session_id != null ? Number(r.active_session_id) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      };
      return success(c, status);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Seeding live-status endpoint error", err);
      return fail(c, "Secretary database unavailable", 503);
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
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

// POST /seeding/send-now
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
      return success(c, { queued: true as const });
    } catch (err) {
      resetSecretaryDb();
      return fail(c, `Failed to queue seeding call: ${err instanceof Error ? err.message : String(err)}`, 503);
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
      return fail(c, `Failed to load rapport: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  }
);

// POST /seeding/rapport/send
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
      return success(c, { queued: true as const });
    } catch (err) {
      resetSecretaryDb();
      return fail(c, `Failed to queue rapport send: ${err instanceof Error ? err.message : String(err)}`, 503);
    }
  }
);

// POST /prospects/:id/pause
seeding.post(
  "/prospects/:id/pause",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const userId = c.get("userId") as string;
      const db = getSecretaryDb();

      await db.$queryRaw(Prisma.sql`UPDATE prospects SET paused_at = NOW() WHERE id = ${id}`);
      await db.$queryRaw(Prisma.sql`
        INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
         VALUES (${id}, 'paused', ${userId}, 'Period paused via dashboard', NOW())`
      );

      await audit(c, "discord_bot.pause_prospect", "prospect", String(id));
      return success(c, { updated: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Pause prospect error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

// POST /prospects/:id/unpause
seeding.post(
  "/prospects/:id/unpause",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const userId = c.get("userId") as string;
      const db = getSecretaryDb();

      await db.$queryRaw(Prisma.sql`UPDATE prospects SET paused_at = NULL WHERE id = ${id}`);
      await db.$queryRaw(Prisma.sql`
        INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
         VALUES (${id}, 'unpaused', ${userId}, 'Period unpaused via dashboard', NOW())`
      );

      await audit(c, "discord_bot.unpause_prospect", "prospect", String(id));
      return success(c, { updated: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Unpause prospect error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

// POST /prospects/:id/extend
seeding.post(
  "/prospects/:id/extend",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const userId = c.get("userId") as string;
      const { days } = await c.req.json<{ days: number }>();

      if (!days || days < 1 || days > 30) {
        return fail(c, "days must be between 1 and 30");
      }

      const db = getSecretaryDb();

      await db.$queryRaw(Prisma.sql`
        UPDATE prospects SET extra_days = COALESCE(extra_days, 0) + ${days} WHERE id = ${id}`
      );
      await db.$queryRaw(Prisma.sql`
        INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
         VALUES (${id}, 'extended', ${userId}, ${`Period extended by ${days} day(s) via dashboard`}, NOW())`
      );

      await audit(c, "discord_bot.extend_prospect", "prospect", String(id), { days });
      return success(c, { updated: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Extend prospect error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

export default seeding;

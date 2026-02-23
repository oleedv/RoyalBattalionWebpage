import { Hono } from "hono";
import type { ApiResponse, DiscordBotOverview, SeedingConfig, SeedingSession } from "shared";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const discordBot = new Hono();

discordBot.use("*", authMiddleware);

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

// GET /discord-bot/overview
discordBot.get(
  "/overview",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const db = getSecretaryDb();

    const [
      ticketTierRows,
      recentClosedRows,
      prospectStatusRows,
      recentProspectRows,
      activeSessionRows,
      recentSessionRows,
      seedingConfigRows,
    ] = await Promise.all([
      db.$queryRawUnsafe<any[]>(
        `SELECT tier, COUNT(*) as count FROM tickets WHERE status = 'open' GROUP BY tier`
      ),
      db.$queryRawUnsafe<any[]>(
        `SELECT id, uuid, tier, closed_at FROM tickets WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 5`
      ),
      db.$queryRawUnsafe<any[]>(
        `SELECT status, COUNT(*) as count FROM prospects GROUP BY status`
      ),
      db.$queryRawUnsafe<any[]>(
        `SELECT id, alias, status, created_at FROM prospects ORDER BY created_at DESC LIMIT 5`
      ),
      db.$queryRawUnsafe<any[]>(
        `SELECT * FROM seeding_sessions WHERE status = 'active' LIMIT 1`
      ).catch(() => [] as any[]),
      db.$queryRawUnsafe<any[]>(
        `SELECT * FROM seeding_sessions ORDER BY started_at DESC LIMIT 5`
      ).catch(() => [] as any[]),
      db.$queryRawUnsafe<any[]>(
        `SELECT enabled, seed_threshold FROM seeding_config WHERE id = 1`
      ).catch(() => [] as any[]),
    ]);

    const openByTier = { normal: 0, community_officer: 0, admin_officer: 0 };
    for (const r of ticketTierRows) {
      const tier = r.tier as keyof typeof openByTier;
      if (tier in openByTier) openByTier[tier] = Number(r.count);
    }

    const recentlyClosed = recentClosedRows.map((r: any) => ({
      id: r.id,
      uuid: r.uuid,
      tier: r.tier,
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : "",
    }));

    let prospectOpen = 0, prospectAccepted = 0, prospectDenied = 0;
    for (const r of prospectStatusRows) {
      const count = Number(r.count);
      if (r.status === "accepted") prospectAccepted += count;
      else if (r.status === "denied") prospectDenied += count;
      else if (r.status === "open") prospectOpen += count;
    }

    const recentActivity = recentProspectRows.map((r: any) => ({
      id: r.id,
      alias: r.alias,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    const activeSession = activeSessionRows.length > 0 ? mapSession(activeSessionRows[0]) : null;
    const recentSessions = recentSessionRows.map(mapSession);

    const seedingCfg = seedingConfigRows.length > 0
      ? { enabled: Boolean(seedingConfigRows[0].enabled), seedThreshold: Number(seedingConfigRows[0].seed_threshold) }
      : null;

    const overview: DiscordBotOverview = {
      tickets: { openByTier, recentlyClosed },
      prospects: { open: prospectOpen, accepted: prospectAccepted, denied: prospectDenied, recentActivity },
      seeding: { activeSession, recentSessions, config: seedingCfg },
    };

    return c.json<ApiResponse<DiscordBotOverview>>({ success: true, data: overview });
  }
);

// GET /discord-bot/seeding/config
discordBot.get(
  "/seeding/config",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const rows: any[] = await getSecretaryDb().$queryRawUnsafe(
      `SELECT id, enabled, channel_id, role_id, seed_threshold, reset_threshold,
              daily_time, timezone, server_name
       FROM seeding_config WHERE id = 1`
    );

    if (rows.length === 0) {
      return c.json<ApiResponse<never>>({ success: false, error: "Seeding config not found" }, 404);
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

    return c.json<ApiResponse<SeedingConfig>>({ success: true, data: config });
  }
);

// PUT /discord-bot/seeding/config
discordBot.put(
  "/seeding/config",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const body = await c.req.json<Partial<SeedingConfig>>();

    await getSecretaryDb().$queryRawUnsafe(
      `UPDATE seeding_config SET
        enabled = ?,
        seed_threshold = ?,
        reset_threshold = ?,
        daily_time = ?,
        timezone = ?,
        server_name = ?
       WHERE id = 1`,
      body.enabled ? 1 : 0,
      body.seedThreshold ?? 40,
      body.resetThreshold ?? 20,
      body.dailyTime ?? null,
      body.timezone ?? null,
      body.serverName ?? null
    );

    return c.json<ApiResponse<{ updated: true }>>({ success: true, data: { updated: true } });
  }
);

// GET /discord-bot/seeding/sessions
discordBot.get(
  "/seeding/sessions",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);

    const rows: any[] = await getSecretaryDb().$queryRawUnsafe(
      `SELECT id, started_at, completed_at, duration_minutes, start_players,
              peak_players, end_players, map_name, layer_name, status,
              call_message_id, completion_message_id
       FROM seeding_sessions ORDER BY started_at DESC LIMIT ?`,
      limit
    );

    const sessions: SeedingSession[] = rows.map(mapSession);
    return c.json<ApiResponse<SeedingSession[]>>({ success: true, data: sessions });
  }
);

// POST /discord-bot/prospects/:id/pause
discordBot.post(
  "/prospects/:id/pause",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const db = getSecretaryDb();

    await db.$queryRawUnsafe(`UPDATE prospects SET paused_at = NOW() WHERE id = ?`, id);
    await db.$queryRawUnsafe(
      `INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
       VALUES (?, 'paused', ?, 'Period paused via dashboard', NOW())`,
      id, userId
    );

    return c.json<ApiResponse<{ updated: true }>>({ success: true, data: { updated: true } });
  }
);

// POST /discord-bot/prospects/:id/unpause
discordBot.post(
  "/prospects/:id/unpause",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const db = getSecretaryDb();

    await db.$queryRawUnsafe(`UPDATE prospects SET paused_at = NULL WHERE id = ?`, id);
    await db.$queryRawUnsafe(
      `INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
       VALUES (?, 'unpaused', ?, 'Period unpaused via dashboard', NOW())`,
      id, userId
    );

    return c.json<ApiResponse<{ updated: true }>>({ success: true, data: { updated: true } });
  }
);

// POST /discord-bot/prospects/:id/extend
discordBot.post(
  "/prospects/:id/extend",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const { days } = await c.req.json<{ days: number }>();

    if (!days || days < 1 || days > 30) {
      return c.json<ApiResponse<never>>({ success: false, error: "days must be between 1 and 30" }, 400);
    }

    const db = getSecretaryDb();

    await db.$queryRawUnsafe(
      `UPDATE prospects SET extra_days = COALESCE(extra_days, 0) + ? WHERE id = ?`,
      days, id
    );
    await db.$queryRawUnsafe(
      `INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
       VALUES (?, 'extended', ?, ?, NOW())`,
      id, userId, `Period extended by ${days} day(s) via dashboard`
    );

    return c.json<ApiResponse<{ updated: true }>>({ success: true, data: { updated: true } });
  }
);

export default discordBot;

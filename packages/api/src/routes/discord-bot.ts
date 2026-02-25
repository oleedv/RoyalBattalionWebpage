import { Hono } from "hono";
import type { ApiResponse, DiscordBotOverview, SeedingConfig, SeedingSession, BotMessage, BotLog, BotStatus, Paginated, TicketTimeout } from "shared";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission, getAllowedTicketTiers } from "../middleware/permissions";
import type { Permission } from "shared";
import { audit } from "../lib/audit";

const discordBot = new Hono();

discordBot.use("*", authMiddleware);

function mapBotStatus(r: any): BotStatus {
  return {
    status: r.status,
    uptimeSeconds: Number(r.uptime_seconds) || 0,
    guildCount: Number(r.guild_count) || 0,
    memberCount: Number(r.member_count) || 0,
    latencyMs: Number(r.latency_ms) || 0,
    dbConnected: Boolean(r.db_connected),
    squadjsConnected: Boolean(r.squadjs_connected),
    seedingSchedulerActive: Boolean(r.seeding_scheduler_active),
    prospectSchedulerActive: Boolean(r.prospect_scheduler_active),
    lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).toISOString() : new Date().toISOString(),
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
  };
}

function mapBotMessage(r: any): BotMessage {
  let attachments: unknown[] | null = null;
  if (r.attachments) {
    try {
      attachments = typeof r.attachments === "string" ? JSON.parse(r.attachments) : r.attachments;
    } catch { /* ignore */ }
  }
  return {
    id: Number(r.id),
    messageId: r.message_id,
    channelId: r.channel_id,
    channelName: r.channel_name,
    guildId: r.guild_id,
    authorId: r.author_id,
    authorTag: r.author_tag,
    content: r.content,
    attachments,
    isDm: Boolean(r.is_dm),
    direction: r.direction || "incoming",
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function mapBotLog(r: any): BotLog {
  let data: unknown | null = null;
  if (r.data) {
    try {
      data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    } catch { /* ignore */ }
  }
  return {
    id: Number(r.id),
    level: Number(r.level),
    levelLabel: r.level_label,
    module: r.module,
    message: r.message,
    data,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

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
      botStatusRows,
    ] = await Promise.all([
      db.$queryRawUnsafe<any[]>(
        `SELECT tier, COUNT(*) as count FROM tickets WHERE status = 'open' GROUP BY tier`
      ),
      db.$queryRawUnsafe<any[]>(
        `SELECT t.id, t.uuid, t.tier, t.closed_at, (SELECT content FROM ticket_messages WHERE ticket_id = t.id AND is_staff = 0 ORDER BY created_at ASC LIMIT 1) as first_message FROM tickets t WHERE t.status = 'closed' ORDER BY t.closed_at DESC LIMIT 5`
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
      db.$queryRawUnsafe<any[]>(
        `SELECT * FROM bot_status WHERE id = 1`
      ).catch(() => [] as any[]),
    ]);

    const userPermissions = c.get("permissions") as Permission[];
    const allowedTiers = getAllowedTicketTiers(userPermissions);

    const openByTier = { normal: 0, community_officer: 0, admin_officer: 0 };
    for (const r of ticketTierRows) {
      const tier = r.tier as keyof typeof openByTier;
      if (tier in openByTier) {
        if (allowedTiers === null || allowedTiers.includes(tier)) {
          openByTier[tier] = Number(r.count);
        }
      }
    }

    const recentlyClosed = recentClosedRows
      .filter((r: any) => allowedTiers === null || allowedTiers.includes(r.tier))
      .map((r: any) => ({
        id: r.id,
        uuid: r.uuid,
        tier: r.tier,
        closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : "",
        firstMessage: r.first_message || null,
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

    const botStatus: BotStatus | null = botStatusRows.length > 0 ? mapBotStatus(botStatusRows[0]) : null;

    const overview: DiscordBotOverview = {
      tickets: { openByTier, recentlyClosed },
      prospects: { open: prospectOpen, accepted: prospectAccepted, denied: prospectDenied, recentActivity },
      seeding: { activeSession, recentSessions, config: seedingCfg },
      botStatus,
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

    await audit(c, "discord_bot.update_seeding_config", "discord_bot");
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

    await audit(c, "discord_bot.pause_prospect", "prospect", String(id));
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

    await audit(c, "discord_bot.unpause_prospect", "prospect", String(id));
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

    await audit(c, "discord_bot.extend_prospect", "prospect", String(id), { days });
    return c.json<ApiResponse<{ updated: true }>>({ success: true, data: { updated: true } });
  }
);

// GET /discord-bot/status
discordBot.get(
  "/status",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRawUnsafe(
        `SELECT * FROM bot_status WHERE id = 1`
      ).catch(() => [] as any[]);

      if (rows.length === 0) {
        return c.json<ApiResponse<null>>({ success: true, data: null });
      }

      return c.json<ApiResponse<BotStatus>>({ success: true, data: mapBotStatus(rows[0]) });
    } catch (err: any) {
      console.error("discord-bot/status error:", err);
      return c.json<ApiResponse<never>>({ success: false, error: "Failed to query bot status" }, 500);
    }
  }
);

// GET /discord-bot/messages
discordBot.get(
  "/messages",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const limit = Math.min(Number(c.req.query("limit") || "50"), 200);
      const offset = Math.max(Number(c.req.query("offset") || "0"), 0);
      const author = c.req.query("author");
      const channel = c.req.query("channel");
      const dm = c.req.query("dm");
      const search = c.req.query("search");
      const from = c.req.query("from");
      const to = c.req.query("to");

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (author) { conditions.push("author_id = ?"); params.push(author); }
      if (channel) { conditions.push("channel_id = ?"); params.push(channel); }
      if (dm === "1") { conditions.push("is_dm = 1"); }
      if (search) { conditions.push("content LIKE ?"); params.push(`%${search}%`); }
      if (from) { conditions.push("created_at >= ?"); params.push(from); }
      if (to) { conditions.push("created_at <= ?"); params.push(to); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const db = getSecretaryDb();

      const [countRows, rows] = await Promise.all([
        db.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as total FROM bot_messages ${where}`, ...params),
        db.$queryRawUnsafe<any[]>(
          `SELECT id, message_id, channel_id, channel_name, guild_id, author_id, author_tag,
                  content, attachments, is_dm, direction, created_at
           FROM bot_messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          ...params, limit, offset
        ),
      ]);

      const total = Number(countRows[0]?.total || 0);
      const items: BotMessage[] = rows.map(mapBotMessage);

      return c.json<ApiResponse<Paginated<BotMessage>>>({ success: true, data: { items, total } });
    } catch (err: any) {
      console.error("discord-bot/messages error:", err);
      return c.json<ApiResponse<never>>({ success: false, error: "Failed to query messages" }, 500);
    }
  }
);

// GET /discord-bot/logs
discordBot.get(
  "/logs",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const limit = Math.min(Number(c.req.query("limit") || "100"), 500);
      const offset = Math.max(Number(c.req.query("offset") || "0"), 0);
      const level = c.req.query("level");
      const module = c.req.query("module");
      const search = c.req.query("search");
      const from = c.req.query("from");
      const to = c.req.query("to");

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (level) { conditions.push("level = ?"); params.push(Number(level)); }
      if (module) { conditions.push("module = ?"); params.push(module); }
      if (search) { conditions.push("message LIKE ?"); params.push(`%${search}%`); }
      if (from) { conditions.push("created_at >= ?"); params.push(from); }
      if (to) { conditions.push("created_at <= ?"); params.push(to); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const db = getSecretaryDb();

      const [countRows, rows] = await Promise.all([
        db.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as total FROM bot_logs ${where}`, ...params),
        db.$queryRawUnsafe<any[]>(
          `SELECT id, level, level_label, module, message, data, created_at
           FROM bot_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          ...params, limit, offset
        ),
      ]);

      const total = Number(countRows[0]?.total || 0);
      const items: BotLog[] = rows.map(mapBotLog);

      return c.json<ApiResponse<Paginated<BotLog>>>({ success: true, data: { items, total } });
    } catch (err: any) {
      console.error("discord-bot/logs error:", err);
      return c.json<ApiResponse<never>>({ success: false, error: "Failed to query logs" }, 500);
    }
  }
);

// GET /discord-bot/timeouts
discordBot.get(
  "/timeouts",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRawUnsafe(
        `SELECT id, user_id, timed_out_by, expires_at, created_at
         FROM ticket_timeouts
         WHERE expires_at > NOW()
         ORDER BY expires_at ASC`
      );

      const timeouts: TicketTimeout[] = rows.map((r) => ({
        id: Number(r.id),
        userId: r.user_id,
        timedOutBy: r.timed_out_by,
        expiresAt: new Date(r.expires_at).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
      }));

      return c.json<ApiResponse<TicketTimeout[]>>({ success: true, data: timeouts });
    } catch (err: any) {
      console.error("discord-bot/timeouts error:", err);
      return c.json<ApiResponse<never>>({ success: false, error: "Failed to query timeouts" }, 500);
    }
  }
);

// POST /discord-bot/timeouts
discordBot.post(
  "/timeouts",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const { userId, hours } = await c.req.json<{ userId: string; hours: number }>();

    if (!userId || typeof userId !== "string" || userId.length < 1 || userId.length > 20) {
      return c.json<ApiResponse<never>>({ success: false, error: "Invalid user ID" }, 400);
    }
    if (!hours || hours < 1 || hours > 8760) {
      return c.json<ApiResponse<never>>({ success: false, error: "Hours must be between 1 and 8760" }, 400);
    }

    const actorId = c.get("userId") as string;
    const db = getSecretaryDb();

    await db.$queryRawUnsafe(
      `INSERT INTO ticket_timeouts (user_id, timed_out_by, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      userId, actorId, hours
    );

    await audit(c, "discord_bot.create_ticket_timeout", "ticket_timeout", undefined, { userId, hours });
    return c.json<ApiResponse<{ created: true }>>({ success: true, data: { created: true } });
  }
);

// POST /discord-bot/timeouts/:id/expire
discordBot.post(
  "/timeouts/:id/expire",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const db = getSecretaryDb();

    await db.$queryRawUnsafe(
      `UPDATE ticket_timeouts SET expires_at = NOW() WHERE id = ?`,
      id
    );

    await audit(c, "discord_bot.expire_ticket_timeout", "ticket_timeout", String(id));
    return c.json<ApiResponse<{ updated: true }>>({ success: true, data: { updated: true } });
  }
);

export default discordBot;

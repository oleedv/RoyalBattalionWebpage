import { Hono } from "hono";
import { Prisma } from "../../generated/prisma/client";
import type { SeedingConfig, SeedingSession } from "shared";
import getSecretaryDb from "../../lib/secretary-db";
import { requirePermission } from "../../middleware/permissions";
import { audit } from "../../lib/audit";
import { success, fail } from "../../lib/crud-helpers";

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
  }
);

// PUT /seeding/config
seeding.put(
  "/seeding/config",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const body = await c.req.json<Partial<SeedingConfig>>();

    await getSecretaryDb().$queryRaw(Prisma.sql`
      UPDATE seeding_config SET
        enabled = ${body.enabled ? 1 : 0},
        seed_threshold = ${body.seedThreshold ?? 40},
        reset_threshold = ${body.resetThreshold ?? 20},
        daily_time = ${body.dailyTime ?? null},
        timezone = ${body.timezone ?? null},
        server_name = ${body.serverName ?? null}
       WHERE id = 1`
    );

    await audit(c, "discord_bot.update_seeding_config", "discord_bot");
    return success(c, { updated: true as const });
  }
);

// GET /seeding/sessions
seeding.get(
  "/seeding/sessions",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const limit = Math.min(Number(c.req.query("limit") || "50"), 100);

    const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, started_at, completed_at, duration_minutes, start_players,
              peak_players, end_players, map_name, layer_name, status,
              call_message_id, completion_message_id
       FROM seeding_sessions ORDER BY started_at DESC LIMIT ${limit}`
    );

    const sessions: SeedingSession[] = rows.map(mapSession);
    return success(c, sessions);
  }
);

// POST /prospects/:id/pause
seeding.post(
  "/prospects/:id/pause",
  requirePermission("manage:discord-bot"),
  async (c) => {
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
  }
);

// POST /prospects/:id/unpause
seeding.post(
  "/prospects/:id/unpause",
  requirePermission("manage:discord-bot"),
  async (c) => {
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
  }
);

// POST /prospects/:id/extend
seeding.post(
  "/prospects/:id/extend",
  requirePermission("manage:discord-bot"),
  async (c) => {
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
  }
);

export default seeding;

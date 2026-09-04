import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import type {
  TempVoiceEvent,
  TempVoiceManageOp,
  TempVoiceOverview,
  TempVoicePreset,
} from "shared";
import getSecretaryDb, { resetSecretaryDb } from "../../lib/secretary-db";
import prisma from "../../lib/db";
import { env } from "../../lib/env";
import { requirePermission } from "../../middleware/permissions";
import { validate } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { success, fail } from "../../lib/crud-helpers";
import { parsePageParams, paginate } from "../../lib/pagination";
import { logger } from "../../lib/logger";
import {
  mapChannel,
  mapConfig,
  mapEvent,
  mapPreset,
  statsFromChannels,
} from "./tempvoice-map";

const tempvoice = new Hono();

const SNOWFLAKE = /^\d{5,25}$/;
const MANAGE_OPS = [
  "rename", "limit", "lock", "unlock", "invisible", "visible",
  "closechat", "openchat", "dnd", "bitrate", "region",
  "delete", "transfer", "kick",
] as const satisfies readonly TempVoiceManageOp[];

const manageSchema = z.object({
  op: z.enum(MANAGE_OPS),
  name: z.string().min(2).max(100).optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
  enabled: z.boolean().optional(),
  bitrate: z.number().int().optional(),
  region: z.string().min(1).max(20).optional(),
  newOwnerId: z.string().regex(SNOWFLAKE).optional(),
  userId: z.string().regex(SNOWFLAKE).optional(),
});

const configSchema = z.object({
  triggerChannelId: z.string().regex(SNOWFLAKE).nullable().optional(),
  categoryId: z.string().regex(SNOWFLAKE).nullable().optional(),
  logChannelId: z.string().regex(SNOWFLAKE).nullable().optional(),
  maxChannelsPerUser: z.number().int().min(1).max(10).optional(),
  defaultAllowVad: z.boolean().optional(),
});

const EVENT_FILTER = z.string().max(40).optional();

const BITRATES = new Set([32000, 48000, 64000, 80000, 96000, 128000, 256000, 384000]);
const REGIONS = new Set([
  "auto", "us-east", "us-west", "us-central", "us-south", "brazil",
  "singapore", "sydney", "russia", "south-africa", "hongkong",
  "india", "japan", "rotterdam", "south-korea",
]);

const presetPatchSchema = z.object({
  channelName: z.string().min(2).max(100).nullable().optional(),
  userLimit: z.number().int().min(0).max(99).nullable().optional(),
  bitrate: z.number().int().nullable().optional(),
  region: z.string().min(1).max(20).nullable().optional(),
  isLocked: z.boolean().optional(),
  isInvisible: z.boolean().optional(),
  isChatClosed: z.boolean().optional(),
  isDnd: z.boolean().optional(),
  applyLive: z.boolean().optional(),
});

const presetCreateSchema = presetPatchSchema.extend({
  userId: z.string().regex(SNOWFLAKE),
});

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  const msg = err instanceof Error ? err.message : String(err);
  return code === "ER_NO_SUCH_TABLE" || /doesn't exist|does not exist/i.test(msg);
}

async function actorDiscordId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true },
  });
  return user?.discordId ?? null;
}

async function enqueue(
  actionType: string,
  payload: Record<string, unknown>,
  actorId: string,
) {
  const json = JSON.stringify(payload);
  await getSecretaryDb().$executeRaw(Prisma.sql`
    INSERT INTO pending_actions (action_type, target_type, target_id, payload, actor_id)
    VALUES (${actionType}, 'tempvoice', 0, ${json}, ${actorId})
  `);
}

// GET /tempvoice — live board + stats + config
tempvoice.get(
  "/tempvoice",
  requirePermission("view:temp-voice", "manage:temp-voice", "view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const db = getSecretaryDb();
      const [channelRows, configRows, createdRows, deletedRows, hourlyRows] = await Promise.all([
        db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT * FROM temp_channels ORDER BY created_at ASC
        `).catch((err: unknown): Record<string, unknown>[] => {
          if (isMissingTable(err)) return [];
          throw err;
        }),
        db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT * FROM temp_voice_config WHERE id = 1
        `).catch((err: unknown): Record<string, unknown>[] => {
          if (isMissingTable(err)) return [];
          throw err;
        }),
        db.$queryRaw<{ count: number | bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS count FROM temp_voice_events
           WHERE event_type = 'created' AND created_at >= CURDATE()
        `).catch((): { count: number | bigint }[] => [{ count: 0 }]),
        db.$queryRaw<{ count: number | bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS count FROM temp_voice_events
           WHERE event_type = 'deleted' AND created_at >= CURDATE()
        `).catch((): { count: number | bigint }[] => [{ count: 0 }]),
        db.$queryRaw<{ h: number | bigint; c: number | bigint }[]>(Prisma.sql`
          SELECT HOUR(created_at) AS h, COUNT(*) AS c
            FROM temp_voice_events
           WHERE event_type = 'created' AND created_at >= CURDATE()
           GROUP BY HOUR(created_at)
        `).catch((): { h: number | bigint; c: number | bigint }[] => []),
      ]);

      const channels = channelRows.map(mapChannel);
      const hourlyCreated = Array(24).fill(0);
      for (const row of hourlyRows) {
        const h = Number(row.h);
        if (h >= 0 && h < 24) hourlyCreated[h] = Number(row.c) || 0;
      }

      const data: TempVoiceOverview = {
        config: mapConfig(configRows[0] ?? null, env.DISCORD_GUILD_ID ?? null),
        stats: statsFromChannels(
          channels,
          Number(createdRows[0]?.count) || 0,
          Number(deletedRows[0]?.count) || 0,
          hourlyCreated,
        ),
        channels,
      };

      return success(c, data);
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Temp voice overview error", err);
      return fail(c, "Failed to load temp voice", 500);
    }
  },
);

// GET /tempvoice/events
tempvoice.get(
  "/tempvoice/events",
  requirePermission("view:temp-voice", "manage:temp-voice", "view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const { page, limit, skip } = parsePageParams(c, 50, 100);
    const type = EVENT_FILTER.parse(c.req.query("type") || undefined);
    const search = (c.req.query("search") || "").trim().slice(0, 100);

    try {
      const db = getSecretaryDb();
      const filters: Prisma.Sql[] = [];
      if (type) filters.push(Prisma.sql`event_type = ${type}`);
      if (search) {
        const like = `%${search}%`;
        filters.push(Prisma.sql`(channel_name LIKE ${like} OR channel_id LIKE ${like} OR actor_id LIKE ${like} OR owner_id LIKE ${like})`);
      }
      const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}` : Prisma.empty;

      const [rows, countRows] = await Promise.all([
        db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT * FROM temp_voice_events ${where}
           ORDER BY created_at DESC, id DESC
           LIMIT ${limit} OFFSET ${skip}
        `),
        db.$queryRaw<{ count: number | bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS count FROM temp_voice_events ${where}
        `),
      ]);

      const items: TempVoiceEvent[] = rows.map(mapEvent);
      const total = Number(countRows[0]?.count) || 0;
      return success(c, paginate(items, total, page, limit));
    } catch (err: unknown) {
      if (isMissingTable(err)) {
        return success(c, paginate<TempVoiceEvent>([], 0, page, limit));
      }
      resetSecretaryDb();
      logger.error("discord-bot", "Temp voice events error", err);
      return fail(c, "Failed to load temp voice events", 500);
    }
  },
);

async function fetchPreset(db: ReturnType<typeof getSecretaryDb>, userId: string): Promise<TempVoicePreset | null> {
  const rows: Record<string, unknown>[] = await db.$queryRaw(Prisma.sql`
    SELECT * FROM temp_voice_presets WHERE user_id = ${userId} LIMIT 1
  `);
  return rows[0] ? mapPreset(rows[0]) : null;
}

async function liveChannelsForOwner(db: ReturnType<typeof getSecretaryDb>, userId: string) {
  return db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT channel_id FROM temp_channels WHERE owner_id = ${userId}
  `);
}

async function recordPresetEvent(
  db: ReturnType<typeof getSecretaryDb>,
  opts: { actorId: string | null; ownerId: string; channelName: string | null; details: Record<string, unknown> },
) {
  const json = JSON.stringify(opts.details);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO temp_voice_events (event_type, channel_id, channel_name, actor_id, owner_id, details)
    VALUES ('preset', NULL, ${opts.channelName}, ${opts.actorId}, ${opts.ownerId}, ${json})
  `).catch(() => null);
}

type PresetBody = z.infer<typeof presetPatchSchema>;

async function upsertPreset(
  c: Context,
  userId: string,
  body: PresetBody,
  creating: boolean,
) {
  const actorId = c.get("userId") as string;
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId) return fail(c, "DISCORD_GUILD_ID is not configured", 503);

  if (body.bitrate != null && !BITRATES.has(body.bitrate)) {
    return fail(c, "Unsupported bitrate");
  }
  if (body.region != null && !REGIONS.has(body.region)) {
    return fail(c, "Unsupported region");
  }

  const hasField =
    body.channelName !== undefined
    || body.userLimit !== undefined
    || body.bitrate !== undefined
    || body.region !== undefined
    || body.isLocked !== undefined
    || body.isInvisible !== undefined
    || body.isChatClosed !== undefined
    || body.isDnd !== undefined;
  if (!hasField && !creating) return fail(c, "No updatable fields provided");

  try {
    const db = getSecretaryDb();
    const existing = await fetchPreset(db, userId);
    if (!creating && !existing) return fail(c, "Preset not found", 404);
    const presetGuildId = existing?.guildId || guildId;

    const next = {
      channelName: body.channelName !== undefined ? body.channelName : existing?.channelName ?? null,
      userLimit: body.userLimit !== undefined ? body.userLimit : existing?.userLimit ?? null,
      bitrate: body.bitrate !== undefined ? body.bitrate : existing?.bitrate ?? null,
      region: body.region !== undefined ? body.region : existing?.region ?? null,
      isLocked: body.isLocked !== undefined ? body.isLocked : existing?.isLocked ?? false,
      isInvisible: body.isInvisible !== undefined ? body.isInvisible : existing?.isInvisible ?? false,
      isChatClosed: body.isChatClosed !== undefined ? body.isChatClosed : existing?.isChatClosed ?? false,
      isDnd: body.isDnd !== undefined ? body.isDnd : existing?.isDnd ?? false,
    };

    await db.$executeRaw(Prisma.sql`
      INSERT INTO temp_voice_presets (
        user_id, guild_id, channel_name, bitrate, region, user_limit,
        is_locked, is_invisible, is_chat_closed, is_dnd
      ) VALUES (
        ${userId}, ${presetGuildId}, ${next.channelName}, ${next.bitrate}, ${next.region}, ${next.userLimit},
        ${next.isLocked ? 1 : 0}, ${next.isInvisible ? 1 : 0}, ${next.isChatClosed ? 1 : 0}, ${next.isDnd ? 1 : 0}
      )
      ON DUPLICATE KEY UPDATE
        channel_name = VALUES(channel_name),
        bitrate = VALUES(bitrate),
        region = VALUES(region),
        user_limit = VALUES(user_limit),
        is_locked = VALUES(is_locked),
        is_invisible = VALUES(is_invisible),
        is_chat_closed = VALUES(is_chat_closed),
        is_dnd = VALUES(is_dnd)
    `);

    const discordUserId = await actorDiscordId(actorId);
    await recordPresetEvent(db, {
      actorId: discordUserId,
      ownerId: userId,
      channelName: next.channelName,
      details: { title: creating && !existing ? "Preset Created" : "Preset Updated", kind: "update", patch: body },
    });

    const applyLive = body.applyLive !== false;
    let liveQueued = 0;
    if (applyLive) {
      const live = await liveChannelsForOwner(db, userId);
      for (const row of live) {
        const channelId = String(row.channel_id);
        const ops: Array<Record<string, unknown>> = [];
        if (body.channelName) ops.push({ op: "rename", name: body.channelName });
        if (body.userLimit !== undefined && body.userLimit !== null) {
          ops.push({ op: "limit", userLimit: body.userLimit });
        }
        if (body.isLocked !== undefined) ops.push({ op: body.isLocked ? "lock" : "unlock" });
        if (body.isInvisible !== undefined) ops.push({ op: body.isInvisible ? "invisible" : "visible" });
        if (body.isChatClosed !== undefined) ops.push({ op: body.isChatClosed ? "closechat" : "openchat" });
        if (body.isDnd !== undefined) ops.push({ op: "dnd", enabled: body.isDnd });
        if (body.bitrate != null) ops.push({ op: "bitrate", bitrate: body.bitrate });
        if (body.region) ops.push({ op: "region", region: body.region });
        for (const op of ops) {
          await enqueue("tempvoice_manage", { channelId, ...op, discordUserId }, actorId);
          liveQueued++;
        }
      }
    }

    await audit(c, creating ? "discord_bot.tempvoice_preset_create" : "discord_bot.tempvoice_preset_update", "tempvoice", userId, body as Record<string, unknown>);

    const saved = await fetchPreset(db, userId);
    return success(c, { preset: saved, liveQueued }, creating && !existing ? 201 : 200);
  } catch (err: unknown) {
    resetSecretaryDb();
    logger.error("discord-bot", "Temp voice preset upsert error", err);
    return fail(c, "Failed to save temp voice preset", 500);
  }
}

// GET /tempvoice/presets
tempvoice.get(
  "/tempvoice/presets",
  requirePermission("view:temp-voice", "manage:temp-voice", "view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: Record<string, unknown>[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT * FROM temp_voice_presets ORDER BY updated_at DESC LIMIT 200
      `);
      const data: TempVoicePreset[] = rows.map(mapPreset);
      return success(c, data);
    } catch (err: unknown) {
      if (isMissingTable(err)) return success(c, [] as TempVoicePreset[]);
      resetSecretaryDb();
      logger.error("discord-bot", "Temp voice presets error", err);
      return fail(c, "Failed to load temp voice presets", 500);
    }
  },
);

// POST /tempvoice/presets — create or overwrite a user's saved defaults
tempvoice.post(
  "/tempvoice/presets",
  requirePermission("manage:temp-voice", "manage:discord-bot"),
  validate("json", presetCreateSchema),
  async (c) => {
    const body = c.req.valid("json");
    return upsertPreset(c, body.userId, body, true);
  },
);

// PATCH /tempvoice/presets/:userId
tempvoice.patch(
  "/tempvoice/presets/:userId",
  requirePermission("manage:temp-voice", "manage:discord-bot"),
  validate("json", presetPatchSchema),
  async (c) => {
    const userId = c.req.param("userId");
    if (!SNOWFLAKE.test(userId)) return fail(c, "Invalid user id", 400);
    const body = c.req.valid("json");
    return upsertPreset(c, userId, body, false);
  },
);

// DELETE /tempvoice/presets/:userId
tempvoice.delete(
  "/tempvoice/presets/:userId",
  requirePermission("manage:temp-voice", "manage:discord-bot"),
  async (c) => {
    const userId = c.req.param("userId");
    if (!SNOWFLAKE.test(userId)) return fail(c, "Invalid user id", 400);
    const actorId = c.get("userId") as string;

    try {
      const db = getSecretaryDb();
      const existing = await fetchPreset(db, userId);
      if (!existing) return fail(c, "Preset not found", 404);

      await db.$executeRaw(Prisma.sql`
        DELETE FROM temp_voice_presets WHERE user_id = ${userId}
      `);
      const discordUserId = await actorDiscordId(actorId);
      await recordPresetEvent(db, {
        actorId: discordUserId,
        ownerId: userId,
        channelName: existing.channelName,
        details: { title: "Preset Cleared", kind: "destroy" },
      });
      await audit(c, "discord_bot.tempvoice_preset_clear", "tempvoice", userId, {});
      return success(c, { cleared: true as const });
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Temp voice preset delete error", err);
      return fail(c, "Failed to clear temp voice preset", 500);
    }
  },
);

// PATCH /tempvoice/config
tempvoice.patch(
  "/tempvoice/config",
  requirePermission("manage:temp-voice", "manage:discord-bot"),
  validate("json", configSchema),
  async (c) => {
    const body = c.req.valid("json");
    const actorId = c.get("userId") as string;

    if (
      body.triggerChannelId === undefined
      && body.categoryId === undefined
      && body.logChannelId === undefined
      && body.maxChannelsPerUser === undefined
      && body.defaultAllowVad === undefined
    ) {
      return fail(c, "No updatable fields provided");
    }

    try {
      const db = getSecretaryDb();
      const sets: Prisma.Sql[] = [];
      if (body.triggerChannelId !== undefined) {
        sets.push(Prisma.sql`trigger_channel_id = ${body.triggerChannelId}`);
      }
      if (body.categoryId !== undefined) {
        sets.push(Prisma.sql`category_id = ${body.categoryId}`);
      }
      if (body.logChannelId !== undefined) {
        sets.push(Prisma.sql`log_channel_id = ${body.logChannelId}`);
      }
      if (body.maxChannelsPerUser !== undefined) {
        sets.push(Prisma.sql`max_channels_per_user = ${body.maxChannelsPerUser}`);
      }
      if (body.defaultAllowVad !== undefined) {
        sets.push(Prisma.sql`default_allow_vad = ${body.defaultAllowVad ? 1 : 0}`);
      }

      if (sets.length > 0) {
        await db.$executeRaw(Prisma.sql`
          INSERT IGNORE INTO temp_voice_config (id) VALUES (1)
        `);
        await db.$executeRaw(Prisma.sql`
          UPDATE temp_voice_config SET ${Prisma.join(sets)} WHERE id = 1
        `);
      }

      const discordUserId = await actorDiscordId(actorId);
      await enqueue("tempvoice_update_config", { ...body, discordUserId }, actorId);
      await audit(c, "discord_bot.update_tempvoice_config", "tempvoice", undefined, body);

      const rows: Record<string, unknown>[] = await db.$queryRaw(Prisma.sql`
        SELECT * FROM temp_voice_config WHERE id = 1
      `);
      return success(c, mapConfig(rows[0] ?? null, env.DISCORD_GUILD_ID ?? null));
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Temp voice config update error", err);
      return fail(c, "Failed to update temp voice config", 500);
    }
  },
);

// POST /tempvoice/channels/:channelId — queue a staff op (202)
tempvoice.post(
  "/tempvoice/channels/:channelId",
  requirePermission("manage:temp-voice", "manage:discord-bot"),
  validate("json", manageSchema),
  async (c) => {
    const channelId = c.req.param("channelId");
    if (!SNOWFLAKE.test(channelId)) {
      return fail(c, "Invalid channel id", 400);
    }

    const body = c.req.valid("json");
    if (body.op === "rename" && !body.name) return fail(c, "name is required");
    if (body.op === "limit" && body.userLimit === undefined) return fail(c, "userLimit is required");
    if (body.op === "dnd" && body.enabled === undefined) return fail(c, "enabled is required");
    if (body.op === "bitrate" && body.bitrate === undefined) return fail(c, "bitrate is required");
    if (body.op === "region" && !body.region) return fail(c, "region is required");
    if (body.op === "transfer" && !body.newOwnerId) return fail(c, "newOwnerId is required");
    if (body.op === "kick" && !body.userId) return fail(c, "userId is required");

    const actorId = c.get("userId") as string;

    try {
      const existing: Record<string, unknown>[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT channel_id FROM temp_channels WHERE channel_id = ${channelId} LIMIT 1
      `);
      if (existing.length === 0 && body.op !== "delete") {
        return fail(c, "Temp channel not found", 404);
      }

      const discordUserId = await actorDiscordId(actorId);
      const payload = { channelId, ...body, discordUserId };
      await enqueue("tempvoice_manage", payload, actorId);
      await audit(c, `discord_bot.tempvoice_${body.op}`, "tempvoice", channelId, body);

      return success(c, { queued: true as const }, 202);
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Temp voice manage error", err);
      return fail(c, "Failed to queue temp voice action", 500);
    }
  },
);

export default tempvoice;

import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import type { Prospect, ProspectEvent, DiscordEmbed, ProspectConfig, ProspectCooldown, Permission } from "shared";
import { DEFAULT_PROSPECT_CONFIG, validateProspectConfigPatch } from "shared";
import prisma from "../lib/db";
import { env } from "../lib/env";
import { fetchDiscordDisplayName } from "../lib/discord";
import getSecretaryDb, { resetSecretaryDb } from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { rateLimit } from "../middleware/rate-limit";
import { audit } from "../lib/audit";
import { success, fail } from "../lib/crud-helpers";
import { logger } from "../lib/logger";
import { validate } from "../lib/validate";

const PROSPECTS_CAP = 500;

function deniedById(closedBy: string | null, eventRows: { event_type: string; actor_id: string | null }[]): string | null {
  for (let i = eventRows.length - 1; i >= 0; i--) {
    if (eventRows[i].event_type === "denied" && eventRows[i].actor_id) {
      return eventRows[i].actor_id;
    }
  }
  return closedBy;
}

async function resolveNameMap(
  discordIds: string[],
  localFallbacks: Record<string, string> = {},
): Promise<Record<string, string>> {
  const unique = [...new Set(discordIds.filter(Boolean))];
  const map: Record<string, string> = {};
  if (unique.length === 0) return map;

  try {
    const found = await prisma.user.findMany({
      where: { discordId: { in: unique } },
      select: { discordId: true, displayName: true, discordName: true },
    });
    for (const u of found) {
      const name = u.displayName?.trim() || u.discordName?.trim();
      if (name) map[u.discordId] = name;
    }
  } catch (err) {
    logger.warn("discord-bot", "Failed to resolve Discord names from users table", err);
  }

  for (const [id, name] of Object.entries(localFallbacks)) {
    if (id && name && !map[id]) map[id] = name;
  }

  const missing = unique.filter((id) => !map[id]);
  const botToken = env.DISCORD_BOT_TOKEN;
  if (!botToken || missing.length === 0) return map;

  await Promise.all(missing.map(async (id) => {
    try {
      const name = await fetchDiscordDisplayName(botToken, id, env.DISCORD_GUILD_ID);
      if (name) map[id] = name;
    } catch (err) {
      logger.warn("discord-bot", `Failed to resolve Discord name for ${id}`, err);
    }
  }));

  return map;
}

function localNameFallbacks(
  userId: string | null,
  alias: string | null,
  messageRows: { author_id?: string | null; author_tag?: string | null }[],
  forumRows: { author_id?: string | null; author_tag?: string | null }[] = [],
): Record<string, string> {
  const fallbacks: Record<string, string> = {};
  if (userId && alias) fallbacks[userId] = alias;
  for (const row of [...messageRows, ...forumRows]) {
    if (row.author_id && row.author_tag && !fallbacks[row.author_id]) {
      fallbacks[row.author_id] = row.author_tag;
    }
  }
  return fallbacks;
}

function mapEvents(eventRows: any[], nameMap: Record<string, string>): ProspectEvent[] {
  return eventRows.map((e) => ({
    id: e.id,
    prospectId: e.prospect_id,
    eventType: e.event_type,
    actorId: e.actor_id,
    actorName: nameMap[e.actor_id] ?? null,
    detail: e.detail,
    createdAt: new Date(e.created_at).toISOString(),
  }));
}

function parseEmbeds(raw: unknown): DiscordEmbed[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as DiscordEmbed[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as DiscordEmbed[]; } catch { return null; }
  }
  return null;
}

const prospects = new Hono();

// GET / - list all prospects
prospects.get(
  "/",
  authMiddleware,
  rateLimit(30),
  requirePermission("view:prospects", "manage:prospects"),
  async (c) => {
    const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
              squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
              steam_id, mentor_id, paused_at, extra_days, created_at, closed_at, closed_by
       FROM prospects
       ORDER BY created_at DESC
       LIMIT ${PROSPECTS_CAP}`
    );

    const result: Prospect[] = rows.map((r) => ({
      id: r.id,
      uuid: r.uuid,
      channelId: r.channel_id,
      userId: r.user_id,
      status: r.status,
      alias: r.alias,
      nationality: r.nationality,
      dateOfBirth: r.date_of_birth,
      squadHours: r.squad_hours,
      preferredRoles: r.preferred_roles,
      prevClan: r.prev_clan,
      whyRb: r.why_rb,
      activeHours: r.active_hours,
      competitive: r.competitive,
      steamId: r.steam_id,
      mentorId: r.mentor_id,
      pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
      extraDays: Number(r.extra_days) || 0,
      createdAt: new Date(r.created_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      closedBy: r.closed_by,
    }));

    return success(c, result);
  }
);

// GET /mentors - open prospects grouped by mentor (registered before /:id)
prospects.get(
  "/mentors",
  authMiddleware,
  requirePermission("view:prospects", "manage:prospects"),
  async (c) => {
    try {
      const db = getSecretaryDb();

      const rows: any[] = await db.$queryRaw(Prisma.sql`
        SELECT id, uuid, user_id, status, alias, nationality, squad_hours,
                preferred_roles, steam_id, mentor_id, paused_at, extra_days,
                created_at
         FROM prospects
         WHERE status = 'open'
         ORDER BY COALESCE(mentor_id, '') ASC, alias ASC`
      );

      interface MentorGroup {
        mentorId: string | null;
        prospects: typeof mapped;
      }

      const mapped = rows.map((r: any) => ({
        id: r.id,
        uuid: r.uuid,
        userId: r.user_id,
        alias: r.alias,
        nationality: r.nationality,
        squadHours: r.squad_hours,
        preferredRoles: r.preferred_roles,
        steamId: r.steam_id,
        mentorId: r.mentor_id,
        pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
        extraDays: Number(r.extra_days) || 0,
        createdAt: new Date(r.created_at).toISOString(),
      }));

      // Group by mentor
      const grouped = new Map<string, typeof mapped>();
      for (const p of mapped) {
        const key = p.mentorId || "__unclaimed";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(p);
      }

      const result: MentorGroup[] = [];

      // Unclaimed first
      const unclaimed = grouped.get("__unclaimed");
      if (unclaimed) {
        result.push({ mentorId: null, prospects: unclaimed });
        grouped.delete("__unclaimed");
      }

      // Then each mentor group
      for (const [mentorId, prospectGroup] of grouped) {
        result.push({ mentorId, prospects: prospectGroup });
      }

      return success(c, result);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Prospects mentors endpoint error", err);
      return fail(c, "Failed to load prospect mentors", 500);
    }
  }
);

const VIEW_SETTINGS: Permission[] = ["view:prospects", "view:prospect-settings", "manage:prospects"];

function mapConfigRow(r: any | undefined): ProspectConfig {
  if (!r) return { ...DEFAULT_PROSPECT_CONFIG };
  return {
    voteStartHours: Number(r.vote_start_hours) || DEFAULT_PROSPECT_CONFIG.voteStartHours,
    voteAcceptHours: Number(r.vote_accept_hours) || DEFAULT_PROSPECT_CONFIG.voteAcceptHours,
    periodDays: Number(r.period_days) || DEFAULT_PROSPECT_CONFIG.periodDays,
    cooldownDays: Number(r.cooldown_days) || DEFAULT_PROSPECT_CONFIG.cooldownDays,
    minYesVotes: Number(r.min_yes_votes) || DEFAULT_PROSPECT_CONFIG.minYesVotes,
    minYesRate: Number(r.min_yes_rate) || DEFAULT_PROSPECT_CONFIG.minYesRate,
  };
}

function mapCooldownRow(r: any): ProspectCooldown {
  return {
    id: Number(r.id),
    userId: r.user_id,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdBy: r.created_by,
    reason: r.reason ?? null,
    prospectId: r.prospect_id != null ? Number(r.prospect_id) : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// GET /config — singleton; defaults when the row does not exist
prospects.get(
  "/config",
  authMiddleware,
  rateLimit(30),
  requirePermission(...VIEW_SETTINGS),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT vote_start_hours, vote_accept_hours, period_days, cooldown_days, min_yes_votes, min_yes_rate
         FROM prospect_config WHERE id = 1`
      );
      return success(c, mapConfigRow(rows[0]));
    } catch (err) {
      resetSecretaryDb();
      logger.warn("prospects", "Failed to read prospect_config, returning defaults", err);
      return success(c, { ...DEFAULT_PROSPECT_CONFIG });
    }
  }
);

const configPatchSchema = z.object({
  voteStartHours: z.number().int().optional(),
  voteAcceptHours: z.number().int().optional(),
  periodDays: z.number().int().optional(),
  cooldownDays: z.number().int().optional(),
  minYesVotes: z.number().int().optional(),
  minYesRate: z.number().optional(),
});

// PATCH /config
prospects.patch(
  "/config",
  authMiddleware,
  rateLimit(20),
  requirePermission("manage:prospects"),
  validate("json", configPatchSchema),
  async (c) => {
    const body = c.req.valid("json");
    let current: ProspectConfig = { ...DEFAULT_PROSPECT_CONFIG };
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT vote_start_hours, vote_accept_hours, period_days, cooldown_days, min_yes_votes, min_yes_rate
         FROM prospect_config WHERE id = 1`
      );
      current = mapConfigRow(rows[0]);
    } catch {
      current = { ...DEFAULT_PROSPECT_CONFIG };
    }

    const checked = validateProspectConfigPatch(body, current);
    if (!checked.ok) return fail(c, checked.error, 400);
    const next = checked.value;

    try {
      const db = getSecretaryDb();
      await db.$queryRaw(Prisma.sql`
        INSERT INTO prospect_config
          (id, vote_start_hours, vote_accept_hours, period_days, cooldown_days, min_yes_votes, min_yes_rate)
        VALUES
          (1, ${next.voteStartHours}, ${next.voteAcceptHours}, ${next.periodDays}, ${next.cooldownDays}, ${next.minYesVotes}, ${next.minYesRate})
        ON DUPLICATE KEY UPDATE
          vote_start_hours = VALUES(vote_start_hours),
          vote_accept_hours = VALUES(vote_accept_hours),
          period_days = VALUES(period_days),
          cooldown_days = VALUES(cooldown_days),
          min_yes_votes = VALUES(min_yes_votes),
          min_yes_rate = VALUES(min_yes_rate)`
      );
      await audit(c, "prospect.update_config", "prospect", null, next as unknown as Record<string, unknown>);
      return success(c, next);
    } catch (err) {
      resetSecretaryDb();
      logger.error("prospects", "Failed to save prospect_config", err);
      return fail(c, "Failed to save prospect settings", 500);
    }
  }
);

const COOLDOWNS_CAP = 500;

prospects.get(
  "/cooldowns",
  authMiddleware,
  rateLimit(30),
  requirePermission(...VIEW_SETTINGS),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT id, user_id, expires_at, created_by, reason, prospect_id, created_at
         FROM prospect_cooldowns
         WHERE expires_at > NOW()
         ORDER BY expires_at ASC
         LIMIT ${COOLDOWNS_CAP}`
      );
      return success(c, rows.map(mapCooldownRow));
    } catch (err) {
      resetSecretaryDb();
      logger.error("prospects", "Failed to list prospect cooldowns", err);
      return fail(c, "Failed to load cooldowns", 500);
    }
  }
);

const cooldownCreateSchema = z.object({
  userId: z.string().min(1).max(20),
  days: z.number().int().min(1).max(365),
  reason: z.string().max(500).optional(),
});

prospects.post(
  "/cooldowns",
  authMiddleware,
  rateLimit(20),
  requirePermission("manage:prospects"),
  validate("json", cooldownCreateSchema),
  async (c) => {
    const { userId, days, reason } = c.req.valid("json");
    const actorId = c.get("userId") as string;
    try {
      const db = getSecretaryDb();
      const created = await db.$transaction(async (tx) => {
        const existing: any[] = await tx.$queryRaw(Prisma.sql`
          SELECT id FROM prospect_cooldowns
           WHERE user_id = ${userId} AND expires_at > NOW()
           ORDER BY expires_at DESC LIMIT 1`
        );
        if (existing[0]) {
          await tx.$queryRaw(Prisma.sql`
            UPDATE prospect_cooldowns
               SET expires_at = DATE_ADD(NOW(), INTERVAL ${days} DAY),
                   created_by = ${actorId},
                   reason = ${reason ?? null}
             WHERE id = ${existing[0].id}`
          );
          const rows: any[] = await tx.$queryRaw(Prisma.sql`
            SELECT id, user_id, expires_at, created_by, reason, prospect_id, created_at
             FROM prospect_cooldowns WHERE id = ${existing[0].id}`
          );
          return rows[0];
        }
        await tx.$queryRaw(Prisma.sql`
          INSERT INTO prospect_cooldowns (user_id, expires_at, created_by, reason)
           VALUES (${userId}, DATE_ADD(NOW(), INTERVAL ${days} DAY), ${actorId}, ${reason ?? null})`
        );
        const rows: any[] = await tx.$queryRaw(Prisma.sql`
          SELECT id, user_id, expires_at, created_by, reason, prospect_id, created_at
           FROM prospect_cooldowns WHERE id = LAST_INSERT_ID()`
        );
        return rows[0];
      });
      const mapped = mapCooldownRow(created);
      await audit(c, "prospect.cooldown_create", "prospect", String(mapped.id), { userId, days, reason });
      return success(c, mapped, 201);
    } catch (err) {
      resetSecretaryDb();
      logger.error("prospects", "Failed to create prospect cooldown", err);
      return fail(c, "Failed to create cooldown", 500);
    }
  }
);

const cooldownPatchSchema = z.object({
  days: z.number().int().min(1).max(365),
});

prospects.patch(
  "/cooldowns/:id",
  authMiddleware,
  rateLimit(20),
  requirePermission("manage:prospects"),
  validate("json", cooldownPatchSchema),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return fail(c, "Invalid cooldown id", 400);
    const { days } = c.req.valid("json");
    try {
      const db = getSecretaryDb();
      const existing: any[] = await db.$queryRaw(Prisma.sql`
        SELECT id FROM prospect_cooldowns WHERE id = ${id}`
      );
      if (existing.length === 0) return fail(c, "Cooldown not found", 404);
      await db.$queryRaw(Prisma.sql`
        UPDATE prospect_cooldowns
           SET expires_at = DATE_ADD(NOW(), INTERVAL ${days} DAY)
         WHERE id = ${id}`
      );
      const rows: any[] = await db.$queryRaw(Prisma.sql`
        SELECT id, user_id, expires_at, created_by, reason, prospect_id, created_at
         FROM prospect_cooldowns WHERE id = ${id}`
      );
      await audit(c, "prospect.cooldown_update", "prospect", String(id), { days });
      return success(c, mapCooldownRow(rows[0]));
    } catch (err) {
      resetSecretaryDb();
      logger.error("prospects", "Failed to update prospect cooldown", err);
      return fail(c, "Failed to update cooldown", 500);
    }
  }
);

prospects.delete(
  "/cooldowns/:id",
  authMiddleware,
  rateLimit(20),
  requirePermission("manage:prospects"),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return fail(c, "Invalid cooldown id", 400);
    try {
      const db = getSecretaryDb();
      const existing: any[] = await db.$queryRaw(Prisma.sql`
        SELECT id FROM prospect_cooldowns WHERE id = ${id}`
      );
      if (existing.length === 0) return fail(c, "Cooldown not found", 404);
      await db.$queryRaw(Prisma.sql`DELETE FROM prospect_cooldowns WHERE id = ${id}`);
      await audit(c, "prospect.cooldown_delete", "prospect", String(id));
      return success(c, { deleted: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("prospects", "Failed to delete prospect cooldown", err);
      return fail(c, "Failed to delete cooldown", 500);
    }
  }
);

// GET /:id - get prospect with events, messages, votes
prospects.get(
  "/:id",
  authMiddleware,
  rateLimit(30),
  requirePermission("view:prospects", "manage:prospects"),
  async (c) => {
    const id = Number(c.req.param("id"));

    const prospectRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
              squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
              steam_id, mentor_id, paused_at, extra_days, created_at, closed_at, closed_by
       FROM prospects WHERE id = ${id}`
    );

    if (prospectRows.length === 0) {
      return fail(c, "Prospect not found", 404);
    }

    const r = prospectRows[0];

    const eventRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, prospect_id, event_type, actor_id, detail, created_at
       FROM prospect_events WHERE prospect_id = ${id} ORDER BY created_at ASC`
    );

    const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, prospect_id, author_id, author_tag, content, attachments, is_staff, created_at
       FROM prospect_messages WHERE prospect_id = ${id} ORDER BY created_at ASC`
    );

    const voteRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, prospect_id, voter_id, voter_tag, vote, reason, created_at
       FROM prospect_votes WHERE prospect_id = ${id} ORDER BY created_at ASC`
    );

    const nameMap = await resolveNameMap(
      [r.closed_by, r.mentor_id, r.user_id, ...eventRows.map((e: any) => e.actor_id)],
      localNameFallbacks(r.user_id, r.alias, messageRows),
    );
    const closerId = deniedById(r.closed_by, eventRows);
    const closedByName = (closerId && nameMap[closerId]) || nameMap[r.closed_by] || null;

    const prospect: Prospect = {
      id: r.id,
      uuid: r.uuid,
      channelId: r.channel_id,
      userId: r.user_id,
      status: r.status,
      alias: r.alias,
      nationality: r.nationality,
      dateOfBirth: r.date_of_birth,
      squadHours: r.squad_hours,
      preferredRoles: r.preferred_roles,
      prevClan: r.prev_clan,
      whyRb: r.why_rb,
      activeHours: r.active_hours,
      competitive: r.competitive,
      steamId: r.steam_id,
      mentorId: r.mentor_id,
      pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
      extraDays: Number(r.extra_days) || 0,
      createdAt: new Date(r.created_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      closedBy: r.closed_by,
      closedByName,
      events: mapEvents(eventRows, nameMap),
      messages: messageRows.map((m) => ({
        id: m.id,
        prospectId: m.prospect_id,
        authorId: m.author_id,
        authorTag: m.author_tag,
        content: m.content,
        attachments: m.attachments,
        isStaff: Boolean(m.is_staff),
        createdAt: new Date(m.created_at).toISOString(),
      })),
      votes: voteRows.map((v) => ({
        id: v.id,
        prospectId: v.prospect_id,
        voterId: v.voter_id,
        voterTag: v.voter_tag,
        vote: v.vote,
        reason: v.reason,
        createdAt: new Date(v.created_at).toISOString(),
      })),
    };

    return success(c, prospect);
  }
);

// GET /by-uuid/:uuid - public lookup of a prospect by UUID
prospects.get("/by-uuid/:uuid", rateLimit(30), async (c) => {
  const uuid = c.req.param("uuid");

  const prospectRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
            squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
            steam_id, mentor_id, paused_at, extra_days, created_at, closed_at, closed_by
     FROM prospects WHERE uuid = ${uuid}`
  );

  if (prospectRows.length === 0) {
    return fail(c, "Prospect not found", 404);
  }

  const r = prospectRows[0];
  const id = r.id;

  const eventRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, event_type, actor_id, detail, created_at
     FROM prospect_events WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM prospect_messages WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const voteRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, voter_id, voter_tag, vote, reason, created_at
     FROM prospect_votes WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const forumRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, message_id, author_id, author_tag, author_avatar,
           is_bot, content, attachments, embeds, created_at
      FROM prospect_forum_messages
     WHERE prospect_id = ${id}
     ORDER BY created_at ASC`
  );

  const nameMap = await resolveNameMap(
    [r.closed_by, r.mentor_id, r.user_id, ...eventRows.map((e: any) => e.actor_id)],
    localNameFallbacks(r.user_id, r.alias, messageRows, forumRows),
  );
  const closerId = deniedById(r.closed_by, eventRows);
  const closedByName = (closerId && nameMap[closerId]) || nameMap[r.closed_by] || null;

  const prospect: Prospect = {
    id: r.id,
    uuid: r.uuid,
    channelId: r.channel_id,
    userId: r.user_id,
    status: r.status,
    alias: r.alias,
    nationality: r.nationality,
    dateOfBirth: r.date_of_birth,
    squadHours: r.squad_hours,
    preferredRoles: r.preferred_roles,
    prevClan: r.prev_clan,
    whyRb: r.why_rb,
    activeHours: r.active_hours,
    competitive: r.competitive,
    steamId: r.steam_id,
    mentorId: r.mentor_id,
    pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
    extraDays: Number(r.extra_days) || 0,
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
    closedByName,
    events: mapEvents(eventRows, nameMap),
    messages: messageRows.map((m) => ({
      id: m.id,
      prospectId: m.prospect_id,
      authorId: m.author_id,
      authorTag: m.author_tag,
      content: m.content,
      attachments: m.attachments,
      isStaff: Boolean(m.is_staff),
      createdAt: new Date(m.created_at).toISOString(),
    })),
    votes: voteRows.map((v) => ({
      id: v.id,
      prospectId: v.prospect_id,
      voterId: v.voter_id,
      voterTag: v.voter_tag,
      vote: v.vote,
      reason: v.reason,
      createdAt: new Date(v.created_at).toISOString(),
    })),
    forumMessages: forumRows.map((f) => ({
      id: f.id,
      prospectId: f.prospect_id,
      messageId: f.message_id,
      authorId: f.author_id,
      authorTag: f.author_tag,
      authorAvatar: f.author_avatar,
      isBot: Boolean(f.is_bot),
      content: f.content,
      attachments: f.attachments,
      embeds: parseEmbeds(f.embeds),
      createdAt: new Date(f.created_at).toISOString(),
    })),
  };

  return success(c, prospect);
});

// PATCH /:id - pause / unpause / extend a prospect period (merged mutations)
prospects.patch(
  "/:id",
  authMiddleware,
  requirePermission("manage:prospects"),
  async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const userId = c.get("userId") as string;
      const body = await c.req.json<{ paused?: boolean; extendDays?: number }>();

      const hasPaused = typeof body.paused === "boolean";
      const hasExtend = body.extendDays !== undefined && body.extendDays !== null;

      if (!hasPaused && !hasExtend) {
        return fail(c, "No updatable fields provided (paused and/or extendDays)");
      }

      let extendDays = 0;
      if (hasExtend) {
        extendDays = Number(body.extendDays);
        if (!Number.isFinite(extendDays) || extendDays < 1 || extendDays > 30) {
          return fail(c, "extendDays must be between 1 and 30");
        }
      }

      const db = getSecretaryDb();

      // 404 if the prospect doesn't exist (don't report a 0-row update as success)
      const existing: any[] = await db.$queryRaw(Prisma.sql`
        SELECT id FROM prospects WHERE id = ${id}`
      );
      if (existing.length === 0) {
        return fail(c, "Prospect not found", 404);
      }

      if (hasPaused) {
        if (body.paused) {
          await db.$queryRaw(Prisma.sql`UPDATE prospects SET paused_at = NOW() WHERE id = ${id}`);
          await db.$queryRaw(Prisma.sql`
            INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
             VALUES (${id}, 'paused', ${userId}, 'Period paused via dashboard', NOW())`
          );
          await audit(c, "discord_bot.pause_prospect", "prospect", String(id));
        } else {
          await db.$queryRaw(Prisma.sql`UPDATE prospects SET paused_at = NULL WHERE id = ${id}`);
          await db.$queryRaw(Prisma.sql`
            INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
             VALUES (${id}, 'unpaused', ${userId}, 'Period unpaused via dashboard', NOW())`
          );
          await audit(c, "discord_bot.unpause_prospect", "prospect", String(id));
        }
      }

      if (hasExtend) {
        await db.$queryRaw(Prisma.sql`
          UPDATE prospects SET extra_days = COALESCE(extra_days, 0) + ${extendDays} WHERE id = ${id}`
        );
        await db.$queryRaw(Prisma.sql`
          INSERT INTO prospect_events (prospect_id, event_type, actor_id, detail, created_at)
           VALUES (${id}, 'extended', ${userId}, ${`Period extended by ${extendDays} day(s) via dashboard`}, NOW())`
        );
        await audit(c, "discord_bot.extend_prospect", "prospect", String(id), { days: extendDays });
      }

      return success(c, { updated: true as const });
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Update prospect error", err);
      return fail(c, "Failed to update prospect", 500);
    }
  }
);

// POST /:id/mentor-reassignment - enqueue mentor reassignment (async -> 202)
prospects.post(
  "/:id/mentor-reassignment",
  authMiddleware,
  requirePermission("manage:prospects"),
  async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const userId = c.get("userId") as string;
      const { mentorId } = await c.req.json<{ mentorId: string }>();

      if (!mentorId) return fail(c, "mentorId is required");

      const db = getSecretaryDb();
      const rows: any[] = await db.$queryRaw(Prisma.sql`
        SELECT id, status, mentor_id FROM prospects WHERE id = ${id}`);
      if (rows.length === 0) return fail(c, "Prospect not found", 404);
      if (rows[0].status !== "open") return fail(c, "Prospect is not open");
      if (rows[0].mentor_id === mentorId) return fail(c, "Prospect is already assigned to this mentor");

      await db.$queryRaw(Prisma.sql`
        INSERT INTO pending_actions (action_type, target_type, target_id, payload, actor_id)
        VALUES ('reassign_mentor', 'prospect', ${id}, ${JSON.stringify({ newMentorId: mentorId })}, ${userId})`
      );
      await audit(c, "discord_bot.reassign_mentor_queued", "prospect", String(id), { mentorId });
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("discord-bot", "Reassign mentor error", err);
      return fail(c, "Failed to queue mentor reassignment", 500);
    }
  }
);

export default prospects;

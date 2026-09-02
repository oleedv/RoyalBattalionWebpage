import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import type {
  GiveawayConfig,
  GiveawayRecord,
  GiveawaySnapshot,
  GiveawayHistoryItem,
  GiveawayLeaderboardRow,
  GiveawayVoteEvent,
} from "shared";
import { computeTickets, windowStartIso } from "shared";
import getSecretaryDb, { resetSecretaryDb } from "../lib/secretary-db";
import { getSquadJSPool } from "../lib/squadjs-db";
import prisma from "../lib/db";
import { requirePermission } from "../middleware/permissions";
import { authMiddleware } from "../middleware/auth";
import { audit } from "../lib/audit";
import { success, fail } from "../lib/crud-helpers";
import { validate } from "../lib/validate";
import { logger } from "../lib/logger";

const giveaway = new Hono();
giveaway.use("*", authMiddleware);

const snowflake = z.string().regex(/^\d{5,25}$/, "Must be a Discord snowflake");

const rulesFields = {
  windowDays: z.number().int().min(1).max(365).optional(),
  minHours: z.number().min(0).max(1000).optional(),
  hoursWeight: z.number().min(0).max(50).optional(),
  seedWeight: z.number().min(0).max(50).optional(),
  voteWeight: z.number().int().min(0).max(50).optional(),
  votesPerVoter: z.number().int().min(1).max(10).optional(),
};

const configPatchSchema = z.object({
  defaultEntryChannelId: snowflake.nullable().optional(),
  defaultVoteChannelId: snowflake.nullable().optional(),
  ...rulesFields,
});

const activePatchSchema = z.object({
  prize: z.string().min(1).max(255).optional(),
  drawAt: z.string().min(10).max(40).optional(),
  ...rulesFields,
});

const startSchema = z.object({
  prize: z.string().min(1).max(255),
  monthLabel: z.string().min(1).max(32).optional(),
  drawAt: z.string().min(10).max(40).optional(),
  entryChannelId: snowflake.optional(),
  ...rulesFields,
});

const openVoteSchema = z.object({
  channelId: snowflake.optional(),
});

const addEntrySchema = z.object({
  userId: snowflake,
  hours: z.number().min(0).max(10000),
  seed: z.number().min(0).max(10000),
});

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : v;
  }
  return String(v ?? "");
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = iso(v);
  return s || null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapGiveaway(r: Record<string, unknown>): GiveawayRecord {
  return {
    id: Number(r.id),
    prize: String(r.prize),
    monthLabel: String(r.month_label),
    scope: (r.scope as GiveawayRecord["scope"]) || "rb_only",
    status: r.status as GiveawayRecord["status"],
    drawAt: iso(r.draw_at),
    windowDays: num(r.window_days, 30),
    minHours: num(r.min_hours, 5),
    hoursWeight: num(r.hours_weight, 1),
    seedWeight: num(r.seed_weight, 2),
    voteWeight: num(r.vote_weight, 5),
    votesPerVoter: num(r.votes_per_voter, 2),
    entryChannelId: r.entry_channel_id ? String(r.entry_channel_id) : null,
    entryMessageId: r.entry_message_id ? String(r.entry_message_id) : null,
    voteChannelId: r.vote_channel_id ? String(r.vote_channel_id) : null,
    voteMessageId: r.vote_message_id ? String(r.vote_message_id) : null,
    winnerUserId: r.winner_user_id ? String(r.winner_user_id) : null,
    createdBy: String(r.created_by),
    createdAt: iso(r.created_at),
    drawnAt: isoOrNull(r.drawn_at),
  };
}

function mapConfig(r: Record<string, unknown>): GiveawayConfig {
  return {
    defaultEntryChannelId: r.default_entry_channel_id ? String(r.default_entry_channel_id) : null,
    defaultVoteChannelId: r.default_vote_channel_id ? String(r.default_vote_channel_id) : null,
    windowDays: num(r.window_days, 30),
    minHours: num(r.min_hours, 5),
    hoursWeight: num(r.hours_weight, 1),
    seedWeight: num(r.seed_weight, 2),
    voteWeight: num(r.vote_weight, 5),
    votesPerVoter: num(r.votes_per_voter, 2),
  };
}

async function ensureConfigTable() {
  const db = getSecretaryDb();
  await db.$executeRaw(Prisma.sql`
    CREATE TABLE IF NOT EXISTS giveaway_config (
      id INT PRIMARY KEY,
      default_entry_channel_id VARCHAR(20) NULL,
      default_vote_channel_id VARCHAR(20) NULL,
      window_days INT DEFAULT 30,
      min_hours DECIMAL(5,2) DEFAULT 5.00,
      hours_weight DECIMAL(4,2) DEFAULT 1.00,
      seed_weight DECIMAL(4,2) DEFAULT 2.00,
      vote_weight INT DEFAULT 5,
      votes_per_voter INT DEFAULT 2
    )
  `);
  await db.$executeRaw(Prisma.sql`INSERT IGNORE INTO giveaway_config (id) VALUES (1)`);
}

async function loadConfig(): Promise<GiveawayConfig> {
  await ensureConfigTable();
  const rows = await getSecretaryDb().$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT * FROM giveaway_config WHERE id = 1
  `);
  if (!rows[0]) {
    return {
      defaultEntryChannelId: null,
      defaultVoteChannelId: null,
      windowDays: 30,
      minHours: 5,
      hoursWeight: 1,
      seedWeight: 2,
      voteWeight: 5,
      votesPerVoter: 2,
    };
  }
  return mapConfig(rows[0]);
}

async function loadGiveawayById(id: number): Promise<GiveawayRecord | null> {
  const rows = await getSecretaryDb().$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT * FROM giveaways WHERE id = ${id}
  `);
  return rows[0] ? mapGiveaway(rows[0]) : null;
}

async function loadActiveGiveaway(): Promise<GiveawayRecord | null> {
  const rows = await getSecretaryDb().$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT * FROM giveaways WHERE status IN ('open','voting') ORDER BY id DESC LIMIT 1
  `);
  return rows[0] ? mapGiveaway(rows[0]) : null;
}

async function batchPlaytime(
  steamIds: string[],
  startDate: string,
): Promise<Map<string, { playtimeHours: number; seedHours: number }>> {
  const map = new Map<string, { playtimeHours: number; seedHours: number }>();
  if (steamIds.length === 0) return map;
  const pool = getSquadJSPool();
  const placeholders = steamIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT
       p.steam_id AS steamId,
       COALESCE(SUM(c.session_duration), 0) AS totalSession,
       COALESCE(SUM(c.seed_duration), 0) AS totalSeed
     FROM squadjs_connections c
     JOIN squadjs_players p ON p.id = c.player_id
     WHERE p.steam_id IN (${placeholders})
       AND c.event_type = 'leave'
       AND c.time >= ?
       AND c.time < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY p.steam_id`,
    [...steamIds, startDate, new Date().toISOString().slice(0, 10)],
  );
  for (const r of rows as Record<string, unknown>[]) {
    map.set(String(r.steamId), {
      playtimeHours: Math.round((Number(r.totalSession) / 3600) * 10) / 10,
      seedHours: Math.round((Number(r.totalSeed) / 3600) * 10) / 10,
    });
  }
  return map;
}

async function buildSnapshot(giveawayRow: GiveawayRecord): Promise<GiveawaySnapshot> {
  const db = getSecretaryDb();
  const entries = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT * FROM giveaway_entries WHERE giveaway_id = ${giveawayRow.id} ORDER BY entered_at ASC
  `);
  const voteRows = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT voter_id AS voterId, target_id AS targetId, created_at AS createdAt
      FROM giveaway_votes
     WHERE giveaway_id = ${giveawayRow.id}
     ORDER BY created_at ASC
  `);

  const votes: GiveawayVoteEvent[] = voteRows.map((r) => ({
    voterId: String(r.voterId),
    targetId: String(r.targetId),
    createdAt: iso(r.createdAt),
  }));

  const voteCounts = new Map<string, number>();
  for (const v of votes) voteCounts.set(v.targetId, (voteCounts.get(v.targetId) || 0) + 1);

  const steamIds = [
    ...new Set(
      entries
        .filter((e) => e.steam_id && e.manual_hours == null)
        .map((e) => String(e.steam_id)),
    ),
  ];
  const live = await batchPlaytime(steamIds, windowStartIso(giveawayRow.windowDays));
  const weights = {
    hours: giveawayRow.hoursWeight,
    seed: giveawayRow.seedWeight,
    vote: giveawayRow.voteWeight,
  };

  const leaderboard: GiveawayLeaderboardRow[] = entries.map((e) => {
    const steamId = e.steam_id ? String(e.steam_id) : null;
    const manual = e.manual_hours != null;
    const play = steamId ? live.get(steamId) ?? null : null;
    const voteN = voteCounts.get(String(e.user_id)) || 0;
    const hours = manual ? num(e.manual_hours) : num(play?.playtimeHours);
    const seed = manual ? num(e.manual_seed) : num(play?.seedHours);
    const tickets = computeTickets(
      { manualHours: manual ? num(e.manual_hours) : null, manualSeed: manual ? num(e.manual_seed) : null },
      play,
      voteN,
      weights,
    );
    return {
      userId: String(e.user_id),
      steamId,
      manual,
      hours,
      seed,
      votes: voteN,
      tickets,
      enteredAt: isoOrNull(e.entered_at),
    };
  });
  leaderboard.sort((a, b) => b.tickets - a.tickets || a.userId.localeCompare(b.userId));

  return {
    giveaway: giveawayRow,
    leaderboard,
    votes,
    totalTickets: leaderboard.reduce((s, r) => s + r.tickets, 0),
    votesCast: votes.length,
  };
}

async function queueAction(
  actionType: string,
  payload: Record<string, unknown>,
  actorId: string,
  targetId = 0,
) {
  await getSecretaryDb().$executeRaw(Prisma.sql`
    INSERT INTO pending_actions (action_type, target_type, target_id, payload, actor_id)
    VALUES (${actionType}, 'giveaway', ${targetId}, ${JSON.stringify(payload)}, ${actorId})
  `);
}

async function discordIdFor(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true },
  });
  return user?.discordId || userId;
}

giveaway.get(
  "/config",
  requirePermission("view:giveaway", "manage:giveaway"),
  async (c) => {
    try {
      return success(c, await loadConfig());
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to load config", err);
      return fail(c, "Failed to load giveaway config", 500);
    }
  },
);

giveaway.patch(
  "/config",
  requirePermission("manage:giveaway"),
  validate("json", configPatchSchema),
  async (c) => {
    try {
      const body = c.req.valid("json");
      await ensureConfigTable();
      const sets: Prisma.Sql[] = [];
      if (body.defaultEntryChannelId !== undefined) {
        sets.push(Prisma.sql`default_entry_channel_id = ${body.defaultEntryChannelId}`);
      }
      if (body.defaultVoteChannelId !== undefined) {
        sets.push(Prisma.sql`default_vote_channel_id = ${body.defaultVoteChannelId}`);
      }
      if (body.windowDays !== undefined) sets.push(Prisma.sql`window_days = ${body.windowDays}`);
      if (body.minHours !== undefined) sets.push(Prisma.sql`min_hours = ${body.minHours}`);
      if (body.hoursWeight !== undefined) sets.push(Prisma.sql`hours_weight = ${body.hoursWeight}`);
      if (body.seedWeight !== undefined) sets.push(Prisma.sql`seed_weight = ${body.seedWeight}`);
      if (body.voteWeight !== undefined) sets.push(Prisma.sql`vote_weight = ${body.voteWeight}`);
      if (body.votesPerVoter !== undefined) sets.push(Prisma.sql`votes_per_voter = ${body.votesPerVoter}`);
      if (sets.length === 0) return fail(c, "No updatable fields provided");

      await getSecretaryDb().$executeRaw(Prisma.sql`
        UPDATE giveaway_config SET ${Prisma.join(sets)} WHERE id = 1
      `);
      await audit(c, "giveaway.update_config", "giveaway");
      return success(c, await loadConfig());
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to update config", err);
      return fail(c, "Failed to update giveaway config", 500);
    }
  },
);

giveaway.get(
  "/active",
  requirePermission("view:giveaway", "manage:giveaway"),
  async (c) => {
    try {
      const active = await loadActiveGiveaway();
      if (!active) return success(c, null);
      return success(c, await buildSnapshot(active));
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to load active giveaway", err);
      return fail(c, "Failed to load active giveaway", 500);
    }
  },
);

giveaway.patch(
  "/active",
  requirePermission("manage:giveaway"),
  validate("json", activePatchSchema),
  async (c) => {
    try {
      const active = await loadActiveGiveaway();
      if (!active) return fail(c, "No active giveaway", 404);
      const body = c.req.valid("json");
      const sets: Prisma.Sql[] = [];
      if (body.prize !== undefined) sets.push(Prisma.sql`prize = ${body.prize}`);
      if (body.drawAt !== undefined) sets.push(Prisma.sql`draw_at = ${body.drawAt}`);
      if (body.windowDays !== undefined) sets.push(Prisma.sql`window_days = ${body.windowDays}`);
      if (body.minHours !== undefined) sets.push(Prisma.sql`min_hours = ${body.minHours}`);
      if (body.hoursWeight !== undefined) sets.push(Prisma.sql`hours_weight = ${body.hoursWeight}`);
      if (body.seedWeight !== undefined) sets.push(Prisma.sql`seed_weight = ${body.seedWeight}`);
      if (body.voteWeight !== undefined) sets.push(Prisma.sql`vote_weight = ${body.voteWeight}`);
      if (body.votesPerVoter !== undefined) sets.push(Prisma.sql`votes_per_voter = ${body.votesPerVoter}`);
      if (sets.length === 0) return fail(c, "No updatable fields provided");

      await getSecretaryDb().$executeRaw(Prisma.sql`
        UPDATE giveaways SET ${Prisma.join(sets)} WHERE id = ${active.id}
      `);
      const userId = c.get("userId") as string;
      await queueAction("giveaway_refresh_entry", {}, userId, active.id);
      await audit(c, "giveaway.update_active", "giveaway", String(active.id), body);
      const updated = await loadGiveawayById(active.id);
      return success(c, updated ? await buildSnapshot(updated) : null);
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to update active giveaway", err);
      return fail(c, "Failed to update giveaway", 500);
    }
  },
);

giveaway.get(
  "/history",
  requirePermission("view:giveaway", "manage:giveaway"),
  async (c) => {
    try {
      const rows = await getSecretaryDb().$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT g.id, g.prize, g.month_label, g.status, g.draw_at, g.winner_user_id,
               g.created_at, g.drawn_at,
               (SELECT COUNT(*) FROM giveaway_entries e WHERE e.giveaway_id = g.id) AS entry_count
          FROM giveaways g
         ORDER BY g.id DESC
         LIMIT 50
      `);
      const items: GiveawayHistoryItem[] = rows.map((r) => ({
        id: Number(r.id),
        prize: String(r.prize),
        monthLabel: String(r.month_label),
        status: r.status as GiveawayHistoryItem["status"],
        drawAt: iso(r.draw_at),
        winnerUserId: r.winner_user_id ? String(r.winner_user_id) : null,
        entryCount: num(r.entry_count),
        createdAt: iso(r.created_at),
        drawnAt: isoOrNull(r.drawn_at),
      }));
      return success(c, items);
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to load history", err);
      return fail(c, "Failed to load giveaway history", 500);
    }
  },
);

giveaway.get(
  "/:id",
  requirePermission("view:giveaway", "manage:giveaway"),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id < 1) return fail(c, "Invalid giveaway id");
    try {
      const row = await loadGiveawayById(id);
      if (!row) return fail(c, "Giveaway not found", 404);
      return success(c, await buildSnapshot(row));
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to load giveaway", err);
      return fail(c, "Failed to load giveaway", 500);
    }
  },
);

giveaway.post(
  "/start",
  requirePermission("manage:giveaway"),
  validate("json", startSchema),
  async (c) => {
    try {
      const existing = await loadActiveGiveaway();
      if (existing) {
        return fail(c, `A giveaway is already active (id ${existing.id}, status ${existing.status})`);
      }
      const body = c.req.valid("json");
      const config = await loadConfig();
      const entryChannelId = body.entryChannelId || config.defaultEntryChannelId;
      if (!entryChannelId) {
        return fail(c, "Set a default entry channel in settings, or pass entryChannelId");
      }
      const userId = c.get("userId") as string;
      const discordUserId = await discordIdFor(userId);
      await queueAction(
        "giveaway_start",
        { ...body, entryChannelId, discordUserId },
        userId,
      );
      await audit(c, "giveaway.start", "giveaway", undefined, { prize: body.prize, entryChannelId });
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to queue start", err);
      return fail(c, "Failed to queue giveaway start", 500);
    }
  },
);

giveaway.post(
  "/open-vote",
  requirePermission("manage:giveaway"),
  validate("json", openVoteSchema),
  async (c) => {
    try {
      const active = await loadActiveGiveaway();
      if (!active) return fail(c, "No active giveaway", 404);
      if (active.status !== "open") {
        return fail(c, `Giveaway is in status '${active.status}'; expected 'open'`);
      }
      const body = c.req.valid("json");
      const config = await loadConfig();
      const channelId = body.channelId || config.defaultVoteChannelId || active.entryChannelId || undefined;
      const userId = c.get("userId") as string;
      await queueAction("giveaway_open_vote", { channelId }, userId, active.id);
      await audit(c, "giveaway.open_vote", "giveaway", String(active.id), { channelId });
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to queue open-vote", err);
      return fail(c, "Failed to queue open vote", 500);
    }
  },
);

giveaway.post(
  "/draw",
  requirePermission("manage:giveaway"),
  async (c) => {
    try {
      const active = await loadActiveGiveaway();
      if (!active) return fail(c, "No active giveaway", 404);
      const userId = c.get("userId") as string;
      await queueAction("giveaway_draw", {}, userId, active.id);
      await audit(c, "giveaway.draw", "giveaway", String(active.id));
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to queue draw", err);
      return fail(c, "Failed to queue draw", 500);
    }
  },
);

giveaway.post(
  "/cancel",
  requirePermission("manage:giveaway"),
  async (c) => {
    try {
      const active = await loadActiveGiveaway();
      if (!active) return fail(c, "No active giveaway", 404);
      const userId = c.get("userId") as string;
      await queueAction("giveaway_cancel", {}, userId, active.id);
      await audit(c, "giveaway.cancel", "giveaway", String(active.id));
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to queue cancel", err);
      return fail(c, "Failed to queue cancel", 500);
    }
  },
);

giveaway.post(
  "/entries",
  requirePermission("manage:giveaway"),
  validate("json", addEntrySchema),
  async (c) => {
    try {
      const active = await loadActiveGiveaway();
      if (!active) return fail(c, "No active giveaway", 404);
      if (active.status === "drawn" || active.status === "cancelled") {
        return fail(c, `Giveaway is ${active.status}; cannot add entries`);
      }
      const body = c.req.valid("json");
      const userId = c.get("userId") as string;
      const discordUserId = await discordIdFor(userId);
      await queueAction(
        "giveaway_add_entry",
        { userId: body.userId, hours: body.hours, seed: body.seed, discordUserId },
        userId,
        active.id,
      );
      await audit(c, "giveaway.add_entry", "giveaway", String(active.id), body);
      return success(c, { queued: true as const }, 202);
    } catch (err) {
      resetSecretaryDb();
      logger.error("giveaway", "Failed to queue add-entry", err);
      return fail(c, "Failed to queue manual entry", 500);
    }
  },
);

export default giveaway;

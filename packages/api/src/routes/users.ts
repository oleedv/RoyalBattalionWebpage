import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { UserWithRoles, UserWithRolesAndComments, MemberComment } from "shared";
import { validateCountry } from "shared";
import prisma from "../lib/db";
import { env } from "../lib/env";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { syncAllUserRoles } from "../lib/role-sync";
import { clearSyncCache } from "./auth";
import { audit } from "../lib/audit";
import { rateLimit } from "../middleware/rate-limit";
import { getSquadJSPool } from "../lib/squadjs-db";
import { logger } from "../lib/logger";
import type { RowDataPacket } from "mysql2/promise";

const users = new Hono();

const linkSteamSchema = z.object({
  steamId: z.string().regex(/^\d{17}$/, "Steam ID must be a 17-digit number"),
});

users.post("/link-steam", authMiddleware, rateLimit(10), zValidator("json", linkSteamSchema), async (c) => {
  const userId = c.get("userId");
  const { steamId } = c.req.valid("json");

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { steamId },
    });

    return success(c, { steamId: user.steamId! });
  } catch (err) {
    return fail(c, "Failed to link Steam ID. It may already be linked to another account.");
  }
});

function mapUser(u: any): UserWithRoles {
  return {
    id: u.id,
    discordId: u.discordId,
    discordName: u.discordName,
    steamId: u.steamId,
    eosId: u.eosId ?? null,
    avatarUrl: u.avatarUrl,
    country: u.country ?? null,
    membershipDate: u.membershipDate?.toISOString() ?? null,
    dateOfBirth: u.dateOfBirth?.toISOString() ?? null,
    hasLoggedIn: u.hasLoggedIn ?? false,
    disabled: u.disabled ?? false,
    disabledAt: u.disabledAt?.toISOString() ?? null,
    disabledReason: u.disabledReason ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    roles: u.roles.map((ur: any) => ({
      id: ur.role.id,
      discordRoleId: ur.role.discordRoleId,
      name: ur.role.name,
    })),
  };
}

function mapComment(c: any): MemberComment {
  return {
    id: c.id,
    userId: c.userId,
    authorId: c.authorId,
    authorName: c.authorName,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
  };
}

function mapUserWithComments(
  u: any,
  activityMap: Map<string, { activity30: number; activity90: number }>,
  playtimeMap: Map<string, { playtime30: number; playtime90: number; seed30: number; seed90: number }>,
): UserWithRolesAndComments {
  const activity = (u.steamId && activityMap.get(u.steamId)) || { activity30: 0, activity90: 0 };
  const playtime = (u.steamId && playtimeMap.get(u.steamId)) || { playtime30: 0, playtime90: 0, seed30: 0, seed90: 0 };
  return {
    ...mapUser(u),
    comments: (u.comments || []).map(mapComment),
    activity30: activity.activity30,
    activity90: activity.activity90,
    playtime30: playtime.playtime30,
    playtime90: playtime.playtime90,
    seed30: playtime.seed30,
    seed90: playtime.seed90,
  };
}

interface ActivityRow extends RowDataPacket {
  steam_id: string;
  matches_30d: number;
  matches_90d: number;
}

async function fetchActivityMap(): Promise<Map<string, { activity30: number; activity90: number }>> {
  const map = new Map<string, { activity30: number; activity90: number }>();
  try {
    const pool = getSquadJSPool();
    const [rows] = await pool.query<ActivityRow[]>(`
      SELECT
        sb.steam_id,
        COUNT(DISTINCT CASE WHEN m.startTime >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN sb.match_id END) AS matches_30d,
        COUNT(DISTINCT CASE WHEN m.startTime >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN sb.match_id END) AS matches_90d
      FROM squadjs_scoreboard sb
      JOIN squadjs_matches m ON m.id = sb.match_id
      WHERE m.startTime >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        AND sb.steam_id IS NOT NULL
        AND sb.steam_id != ''
      GROUP BY sb.steam_id
    `);
    for (const row of rows) {
      map.set(row.steam_id, {
        activity30: Number(row.matches_30d),
        activity90: Number(row.matches_90d),
      });
    }
  } catch (err) {
    logger.error("users", "Failed to fetch activity from SquadJS DB", err);
  }
  return map;
}

interface PlaytimeRow extends RowDataPacket {
  steam_id: string;
  session30: number;
  session90: number;
  seed30: number;
  seed90: number;
}

async function fetchBulkPlaytimeMap(): Promise<Map<string, { playtime30: number; playtime90: number; seed30: number; seed90: number }>> {
  const map = new Map<string, { playtime30: number; playtime90: number; seed30: number; seed90: number }>();
  try {
    const pool = getSquadJSPool();
    const [rows] = await pool.query<PlaytimeRow[]>(`
      SELECT
        p.steam_id,
        COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN c.session_duration ELSE 0 END), 0) AS session30,
        COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN c.session_duration ELSE 0 END), 0) AS session90,
        COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN c.seed_duration ELSE 0 END), 0) AS seed30,
        COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN c.seed_duration ELSE 0 END), 0) AS seed90
      FROM squadjs_connections c
      JOIN squadjs_players p ON p.id = c.player_id
      WHERE c.event_type = 'leave'
        AND c.time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        AND p.steam_id IS NOT NULL
        AND p.steam_id != ''
      GROUP BY p.steam_id
    `);
    for (const row of rows) {
      map.set(row.steam_id, {
        playtime30: Math.round((Number(row.session30) / 3600) * 10) / 10,
        playtime90: Math.round((Number(row.session90) / 3600) * 10) / 10,
        seed30: Math.round((Number(row.seed30) / 3600) * 10) / 10,
        seed90: Math.round((Number(row.seed90) / 3600) * 10) / 10,
      });
    }
  } catch (err) {
    logger.error("users", "Failed to fetch bulk playtime from SquadJS DB", err);
  }
  return map;
}

users.post("/sync-roles", authMiddleware, requirePermission("manage:members"), async (c) => {
  if (!env.DISCORD_BOT_TOKEN) {
    return fail(c, "DISCORD_BOT_TOKEN is not configured", 503);
  }

  try {
    const result = await syncAllUserRoles();
    await audit(c, "member.sync_roles", "user", null, result);
    return success(c, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return fail(c, message, 500);
  }
});

// --- Bulk endpoints (must be registered BEFORE /:id routes) ---

const bulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  data: z.object({
    country: z.string().max(100).optional(),
    membershipDate: z.string().nullable().optional(),
  }),
});

users.post("/bulk-update", authMiddleware, requirePermission("manage:members"), rateLimit(10), zValidator("json", bulkUpdateSchema), async (c) => {
  const { ids, data } = c.req.valid("json");

  const updateData: Record<string, unknown> = {};
  if (data.country !== undefined) {
    if (data.country) {
      const result = validateCountry(data.country);
      if (!result.valid) return fail(c, "Invalid country name", 400);
      updateData.country = result.country;
    } else {
      updateData.country = null;
    }
  }
  if (data.membershipDate !== undefined) {
    updateData.membershipDate = data.membershipDate ? new Date(data.membershipDate) : null;
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: updateData,
  });

  await audit(c, "member.bulk_update", "user", null, { count: result.count, changes: data });
  return success(c, { updated: result.count });
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
});

users.post("/bulk-delete", authMiddleware, requirePermission("manage:members"), rateLimit(10), zValidator("json", bulkDeleteSchema), async (c) => {
  const { ids } = c.req.valid("json");

  const toDelete = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, discordName: true },
  });

  const result = await prisma.user.deleteMany({
    where: { id: { in: ids } },
  });

  await audit(c, "member.bulk_delete", "user", null, {
    count: result.count,
    names: toDelete.map((u) => u.discordName),
  });
  return success(c, { deleted: result.count });
});

const bulkCommentSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  text: z.string().min(1).max(2000),
});

users.post("/bulk-comment", authMiddleware, requirePermission("manage:members"), rateLimit(10), zValidator("json", bulkCommentSchema), async (c) => {
  const { ids, text } = c.req.valid("json");
  const authorId = c.get("userId") as string;

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { discordName: true },
  });

  await prisma.memberComment.createMany({
    data: ids.map((userId) => ({
      userId,
      authorId,
      authorName: author?.discordName ?? "Unknown",
      text,
    })),
  });

  await audit(c, "member.bulk_comment", "user", null, { count: ids.length });
  return success(c, { commented: ids.length });
});

// --- Disable / Enable (developer only) ---

const disableSchema = z.object({
  reason: z.string().min(1).max(500),
});

users.post("/:id/disable", authMiddleware, requirePermission("developer"), zValidator("json", disableSchema), async (c) => {
  const id = c.req.param("id");
  const actorId = c.get("userId") as string;
  const { reason } = c.req.valid("json");

  const target = await findOrThrow(prisma.user, { id }, "User");

  if (target.id === actorId) {
    return fail(c, "You cannot disable your own account", 400);
  }

  const adminIds = env.ADMIN_DISCORD_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  if (adminIds.includes(target.discordId)) {
    return fail(c, "Cannot disable a developer account", 400);
  }

  await prisma.user.update({
    where: { id },
    data: { disabled: true, disabledAt: new Date(), disabledReason: reason },
  });

  clearSyncCache(target.discordId);

  await audit(c, "member.disable", "user", id, { reason, targetName: target.discordName });
  return success(c, { disabled: true as const });
});

users.post("/:id/enable", authMiddleware, requirePermission("developer"), async (c) => {
  const id = c.req.param("id");

  const target = await findOrThrow(prisma.user, { id }, "User");

  await prisma.user.update({
    where: { id },
    data: { disabled: false, disabledAt: null, disabledReason: null },
  });

  await audit(c, "member.enable", "user", id, { targetName: target.discordName });
  return success(c, { enabled: true as const });
});

// --- Bulk Disable / Enable (developer only) ---

const bulkDisableSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  reason: z.string().min(1).max(500),
});

users.post("/bulk-disable", authMiddleware, requirePermission("developer"), rateLimit(10), zValidator("json", bulkDisableSchema), async (c) => {
  const actorId = c.get("userId") as string;
  const { ids, reason } = c.req.valid("json");

  const adminIds = env.ADMIN_DISCORD_IDS.split(",").map((s) => s.trim()).filter(Boolean);

  // Filter out self and developer accounts
  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, discordId: true, discordName: true },
  });
  const safeTargets = targets.filter((t) => t.id !== actorId && !adminIds.includes(t.discordId));

  if (safeTargets.length === 0) {
    return fail(c, "No eligible accounts to disable", 400);
  }

  const safeIds = safeTargets.map((t) => t.id);
  const result = await prisma.user.updateMany({
    where: { id: { in: safeIds } },
    data: { disabled: true, disabledAt: new Date(), disabledReason: reason },
  });

  for (const t of safeTargets) {
    clearSyncCache(t.discordId);
  }

  await audit(c, "member.bulk_disable", "user", null, {
    count: result.count,
    reason,
    names: safeTargets.map((t) => t.discordName),
  });
  return success(c, { disabled: result.count });
});

const bulkEnableSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
});

users.post("/bulk-enable", authMiddleware, requirePermission("developer"), rateLimit(10), zValidator("json", bulkEnableSchema), async (c) => {
  const { ids } = c.req.valid("json");

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, discordName: true },
  });

  const result = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { disabled: false, disabledAt: null, disabledReason: null },
  });

  await audit(c, "member.bulk_enable", "user", null, {
    count: result.count,
    names: targets.map((t) => t.discordName),
  });
  return success(c, { enabled: result.count });
});

// --- Standard CRUD ---

users.get("/", authMiddleware, requirePermission("view:members", "manage:members"), async (c) => {
  const [dbUsers, activityMap, playtimeMap] = await Promise.all([
    prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        comments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    fetchActivityMap(),
    fetchBulkPlaytimeMap(),
  ]);

  const result: UserWithRolesAndComments[] = dbUsers.map((u) => mapUserWithComments(u, activityMap, playtimeMap));

  return success(c, result);
});

const updateUserSchema = z.object({
  steamId: z.string().optional(),
  eosId: z.string().optional(),
  country: z.string().max(100).optional(),
  membershipDate: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
});

users.put("/:id", authMiddleware, requirePermission("manage:members"), zValidator("json", updateUserSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  await findOrThrow(prisma.user, { id }, "User");

  let normalizedCountry: string | null | undefined = undefined;
  if (body.country !== undefined) {
    if (body.country) {
      const result = validateCountry(body.country);
      if (!result.valid) {
        return fail(c, "Invalid country name", 400);
      }
      normalizedCountry = result.country;
    } else {
      normalizedCountry = null;
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.steamId !== undefined && { steamId: body.steamId || null }),
        ...(body.eosId !== undefined && { eosId: body.eosId || null }),
        ...(normalizedCountry !== undefined && { country: normalizedCountry }),
        ...(body.membershipDate !== undefined && { membershipDate: body.membershipDate ? new Date(body.membershipDate) : null }),
        ...(body.dateOfBirth !== undefined && { dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null }),
      },
      include: {
        roles: { include: { role: true } },
        comments: { orderBy: { createdAt: "desc" } },
      },
    });

    await audit(c, "member.update", "user", id, { changes: body });

    const [activityMap, playtimeMap] = await Promise.all([fetchActivityMap(), fetchBulkPlaytimeMap()]);
    return success(c, mapUserWithComments(updated, activityMap, playtimeMap));
  } catch {
    return fail(c, "Failed to update user. The Steam ID may already be linked to another account.");
  }
});

const resolveIdsSchema = z.object({
  discordIds: z.array(z.string()).min(1).max(200),
});

users.post("/resolve-ids", authMiddleware, zValidator("json", resolveIdsSchema), async (c) => {
  const { discordIds } = c.req.valid("json");

  const found = await prisma.user.findMany({
    where: { discordId: { in: discordIds } },
    select: { discordId: true, discordName: true },
  });

  const nameMap: Record<string, string> = {};
  for (const u of found) {
    nameMap[u.discordId] = u.discordName;
  }

  return success(c, nameMap);
});

users.delete("/:id", authMiddleware, requirePermission("manage:members"), async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.user, { id }, "User");

  await prisma.user.delete({ where: { id } });
  await audit(c, "member.delete", "user", id, { discordName: existing.discordName });

  return success(c, { deleted: true as const });
});

// --- Member Comments ---

const addCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

users.post("/:id/comments", authMiddleware, requirePermission("manage:members"), zValidator("json", addCommentSchema), async (c) => {
  const userId = c.req.param("id");
  const authorId = c.get("userId") as string;
  const { text } = c.req.valid("json");

  await findOrThrow(prisma.user, { id: userId }, "User");

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { discordName: true },
  });

  const comment = await prisma.memberComment.create({
    data: {
      userId,
      authorId,
      authorName: author?.discordName ?? "Unknown",
      text,
    },
  });

  await audit(c, "member.comment.add", "user", userId, { commentId: comment.id });

  return success(c, mapComment(comment), 201);
});

users.delete("/:userId/comments/:commentId", authMiddleware, requirePermission("manage:members"), async (c) => {
  const userId = c.req.param("userId");
  const commentId = c.req.param("commentId");

  await findOrThrow(prisma.memberComment, { id: commentId }, "Comment");

  await prisma.memberComment.delete({ where: { id: commentId } });
  await audit(c, "member.comment.delete", "user", userId, { commentId });

  return success(c, { deleted: true as const });
});

export default users;

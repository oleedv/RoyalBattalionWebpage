import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { UserWithRoles, UserWithRolesAndComments, MemberComment } from "shared";
import prisma from "../lib/db";
import { env } from "../lib/env";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { syncAllUserRoles } from "../lib/role-sync";
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
): UserWithRolesAndComments {
  const activity = (u.steamId && activityMap.get(u.steamId)) || { activity30: 0, activity90: 0 };
  return {
    ...mapUser(u),
    comments: (u.comments || []).map(mapComment),
    activity30: activity.activity30,
    activity90: activity.activity90,
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

users.post("/sync-roles", authMiddleware, requirePermission("manage:members"), async (c) => {
  if (!env.DISCORD_BOT_TOKEN) {
    return fail(c, "DISCORD_BOT_TOKEN is not configured", 503);
  }

  try {
    const updated = await syncAllUserRoles();
    await audit(c, "member.sync_roles", "user", null, { updated });
    return success(c, { updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return fail(c, message, 500);
  }
});

users.get("/", authMiddleware, requirePermission("view:members", "manage:members"), async (c) => {
  const [dbUsers, activityMap] = await Promise.all([
    prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        comments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    fetchActivityMap(),
  ]);

  const result: UserWithRolesAndComments[] = dbUsers.map((u) => mapUserWithComments(u, activityMap));

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

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.steamId !== undefined && { steamId: body.steamId || null }),
        ...(body.eosId !== undefined && { eosId: body.eosId || null }),
        ...(body.country !== undefined && { country: body.country || null }),
        ...(body.membershipDate !== undefined && { membershipDate: body.membershipDate ? new Date(body.membershipDate) : null }),
        ...(body.dateOfBirth !== undefined && { dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null }),
      },
      include: {
        roles: { include: { role: true } },
        comments: { orderBy: { createdAt: "desc" } },
      },
    });

    await audit(c, "member.update", "user", id, { changes: body });

    const activityMap = await fetchActivityMap();
    return success(c, mapUserWithComments(updated, activityMap));
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

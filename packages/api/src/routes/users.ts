import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import type {
  UserWithRoles,
  UserWithRolesAndComments,
  MemberComment,
  LinkedWhitelistEntry,
  LiveStatus,
  UserProfile,
} from "shared";
import { validateCountry } from "shared";
import prisma from "../lib/db";
import { env } from "../lib/env";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { parsePageParams, paginate } from "../lib/pagination";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { syncAllUserRoles } from "../lib/role-sync";
import { clearSyncCache } from "./auth";
import { audit } from "../lib/audit";
import { triggerSftpDeploy } from "../lib/sftp-deploy";
import { rateLimit } from "../middleware/rate-limit";
import { getSquadJSPool } from "../lib/squadjs-db";
import { logger } from "../lib/logger";
import { squadjsSocket, type SquadJSPlayer } from "../lib/squadjs-socket";
import type { RowDataPacket } from "mysql2/promise";

function deployInBackground(server?: string) {
  triggerSftpDeploy(server).catch((err) =>
    logger.error("sftp", "Deploy failed", err)
  );
}

const users = new Hono();

const linkSteamSchema = z.object({
  steamId: z.string().regex(/^\d{17}$/, "Steam ID must be a 17-digit number"),
});

users.post("/link-steam", authMiddleware, rateLimit(10), validate("json", linkSteamSchema), async (c) => {
  const userId = c.get("userId");
  const { steamId } = c.req.valid("json");

  const collision = await prisma.user.findUnique({
    where: { steamId },
    select: { id: true, discordName: true },
  });
  if (collision && collision.id !== userId) {
    return fail(c, `Steam ID ${steamId} is already linked to Discord user @${collision.discordName}.`, 409);
  }

  try {
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true } });
    const user = await prisma.user.update({
      where: { id: userId },
      data: { steamId },
    });
    await relinkWhitelistEntries(userId, before?.steamId ?? null, user.steamId);

    return success(c, { steamId: user.steamId! });
  } catch (err) {
    logger.error("users", "Failed to link Steam ID", { userId, steamId, err });
    return fail(c, "Failed to link Steam ID.", 500);
  }
});

const birthdayPrefsSchema = z
  .object({
    birthdayOptOut: z.boolean().optional(),
    birthdayShowAge: z.boolean().optional(),
  })
  .refine((d) => d.birthdayOptOut !== undefined || d.birthdayShowAge !== undefined, {
    message: "Provide at least one of birthdayOptOut or birthdayShowAge",
  });

// Self-service: a member edits only their OWN birthday privacy flags (mirrors
// /link-steam — auth only, keyed on the session user id, no admin permission).
users.patch("/me/birthday-prefs", authMiddleware, rateLimit(20), validate("json", birthdayPrefsSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.birthdayOptOut !== undefined && { birthdayOptOut: body.birthdayOptOut }),
        ...(body.birthdayShowAge !== undefined && { birthdayShowAge: body.birthdayShowAge }),
      },
      select: { birthdayOptOut: true, birthdayShowAge: true },
    });
    return success(c, updated);
  } catch (err) {
    logger.error("users", "Failed to update birthday prefs", { userId, err });
    return fail(c, "Failed to update birthday preferences.", 500);
  }
});

function mapUser(u: any): UserWithRoles {
  return {
    id: u.id,
    discordId: u.discordId,
    discordName: u.discordName,
    displayName: u.displayName ?? null,
    steamId: u.steamId,
    eosId: u.eosId ?? null,
    avatarUrl: u.avatarUrl,
    country: u.country ?? null,
    membershipDate: u.membershipDate?.toISOString() ?? null,
    dateOfBirth: u.dateOfBirth?.toISOString() ?? null,
    birthdayOptOut: u.birthdayOptOut ?? false,
    birthdayShowAge: u.birthdayShowAge ?? false,
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

interface ActivityStats {
  playtime30: number;
  playtime90: number;
  seed30: number;
  seed90: number;
}

const ZERO_ACTIVITY: ActivityStats = { playtime30: 0, playtime90: 0, seed30: 0, seed90: 0 };

function mapUserWithComments(
  u: any,
  activityMap: Map<string, ActivityStats>,
): UserWithRolesAndComments {
  const stats = (u.steamId && activityMap.get(u.steamId)) || ZERO_ACTIVITY;
  return {
    ...mapUser(u),
    comments: (u.comments || []).map(mapComment),
    playtime30: stats.playtime30,
    playtime90: stats.playtime90,
    seed30: stats.seed30,
    seed90: stats.seed90,
  };
}

interface PlaytimeRow extends RowDataPacket {
  steam_id: string;
  session30: number;
  session90: number;
  seed30: number;
  seed90: number;
}

async function fetchActivityMap(): Promise<Map<string, ActivityStats>> {
  const map = new Map<string, ActivityStats>();
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
    logger.error("users", "Failed to fetch activity from SquadJS DB", err);
  }
  return map;
}

async function fetchActivityForSteamId(steamId: string): Promise<ActivityStats> {
  try {
    const pool = getSquadJSPool();
    const [rows] = await pool.query<PlaytimeRow[]>(
      `
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
        AND p.steam_id = ?
      GROUP BY p.steam_id
      LIMIT 1
    `,
      [steamId],
    );
    const row = rows[0];
    if (!row) return ZERO_ACTIVITY;
    return {
      playtime30: Math.round((Number(row.session30) / 3600) * 10) / 10,
      playtime90: Math.round((Number(row.session90) / 3600) * 10) / 10,
      seed30: Math.round((Number(row.seed30) / 3600) * 10) / 10,
      seed90: Math.round((Number(row.seed90) / 3600) * 10) / 10,
    };
  } catch (err) {
    logger.error("users", "Failed to fetch activity for steamId", { steamId, err });
    return ZERO_ACTIVITY;
  }
}

function findLivePlayer(opts: { steamId?: string | null; eosId?: string | null }): {
  player: SquadJSPlayer;
  serverKey: string;
} | null {
  const { steamId, eosId } = opts;
  if (!steamId && !eosId) return null;
  for (const serverKey of squadjsSocket.getServerKeys()) {
    const snap = squadjsSocket.getSnapshot(serverKey);
    if (!snap?.players) continue;
    const player = snap.players.find((p) => (steamId && p.steamID === steamId) || (eosId && p.eosID === eosId));
    if (player) return { player, serverKey };
  }
  return null;
}

function buildLiveStatus(opts: { steamId?: string | null; eosId?: string | null }): LiveStatus {
  const found = findLivePlayer(opts);
  if (!found) {
    return {
      online: false,
      steamId: opts.steamId ?? null,
      eosId: opts.eosId ?? null,
      name: null,
      teamID: null,
      squadID: null,
      squadName: null,
      role: null,
      isLeader: false,
      sessionPlaytime: null,
    };
  }
  const p = found.player;
  return {
    online: true,
    steamId: p.steamID,
    eosId: p.eosID,
    name: p.name,
    teamID: p.teamID,
    squadID: p.squadID,
    squadName: p.squad?.squadName ?? null,
    role: p.role,
    isLeader: p.isLeader,
    sessionPlaytime: p.playtime ?? null,
  };
}

async function fetchLinkedWhitelistEntries(opts: {
  userId?: string | null;
  steamId?: string | null;
}): Promise<LinkedWhitelistEntry[]> {
  const where = opts.userId
    ? { userId: opts.userId }
    : opts.steamId
      ? { steamId: opts.steamId }
      : null;
  if (!where) return [];

  const entries = await prisma.whitelistEntry.findMany({
    where,
    include: { group: true, clanRef: true },
    orderBy: { createdAt: "desc" },
  });

  const addedByIds = Array.from(new Set(entries.map((e) => e.addedBy).filter(Boolean)));
  const addedByUsers = addedByIds.length
    ? await prisma.user.findMany({
        where: { id: { in: addedByIds } },
        select: { id: true, discordName: true },
      })
    : [];
  const nameById = new Map(addedByUsers.map((u) => [u.id, u.discordName] as const));

  return entries.map((e) => ({
    id: e.id,
    steamId: e.steamId,
    server: e.server,
    name: e.name,
    clan: e.clan,
    clanName: e.clanRef?.name ?? null,
    role: e.role,
    groupName: e.group?.name ?? null,
    addedBy: e.addedBy,
    addedByName: nameById.get(e.addedBy) ?? null,
    reason: e.reason,
    expiresAt: e.expiresAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  }));
}

/**
 * Keep WhitelistEntry.userId in sync with User.steamId. Run after a User's steamId
 * is created, changed, or cleared.
 */
async function relinkWhitelistEntries(
  userId: string,
  oldSteamId: string | null,
  newSteamId: string | null,
): Promise<void> {
  if (oldSteamId && oldSteamId !== newSteamId) {
    await prisma.whitelistEntry.updateMany({
      where: { userId, steamId: { not: newSteamId ?? "__never__" } },
      data: { userId: null },
    });
  }
  if (newSteamId) {
    await prisma.whitelistEntry.updateMany({
      where: { steamId: newSteamId, userId: null },
      data: { userId },
    });
  }
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
    logger.error("users", "Failed to sync roles", err);
    return fail(c, "Failed to sync roles.", 500);
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

users.post("/bulk-update", authMiddleware, requirePermission("manage:members"), rateLimit(10), validate("json", bulkUpdateSchema), async (c) => {
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

users.post("/bulk-delete", authMiddleware, requirePermission("manage:members"), rateLimit(10), validate("json", bulkDeleteSchema), async (c) => {
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

users.post("/bulk-comment", authMiddleware, requirePermission("manage:members"), rateLimit(10), validate("json", bulkCommentSchema), async (c) => {
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

// --- Account status toggle (developer only) ---

const statusSchema = z.object({
  disabled: z.boolean(),
  reason: z.string().min(1).max(500).optional(),
});

users.patch("/:id/status", authMiddleware, requirePermission("developer"), validate("json", statusSchema), async (c) => {
  const id = c.req.param("id");
  const actorId = c.get("userId") as string;
  const { disabled, reason } = c.req.valid("json");

  const target = await findOrThrow(prisma.user, { id }, "User");

  if (disabled) {
    if (target.id === actorId) {
      return fail(c, "You cannot disable your own account", 400);
    }

    const adminIds = env.ADMIN_DISCORD_IDS.split(",").map((s) => s.trim()).filter(Boolean);
    if (adminIds.includes(target.discordId)) {
      return fail(c, "Cannot disable a developer account", 400);
    }

    if (!reason) {
      return fail(c, "A reason is required when disabling an account", 400);
    }

    const [, wl] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { disabled: true, disabledAt: new Date(), disabledReason: reason },
      }),
      prisma.whitelistEntry.updateMany({
        where: { userId: id, deactivatedAt: null },
        data: { deactivatedAt: new Date() },
      }),
    ]);

    clearSyncCache(target.discordId);
    if (wl.count > 0) deployInBackground();

    await audit(c, "member.disable", "user", id, { reason, targetName: target.discordName });
    if (wl.count > 0) {
      await audit(c, "whitelist.deactivate", "WhitelistEntry", id, {
        count: wl.count,
        triggeredBy: "member.disable",
      });
    }
    return success(c, { disabled: true as const });
  }

  const [, wl] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { disabled: false, disabledAt: null, disabledReason: null },
    }),
    prisma.whitelistEntry.updateMany({
      where: { userId: id, deactivatedAt: { not: null } },
      data: { deactivatedAt: null },
    }),
  ]);

  if (wl.count > 0) deployInBackground();

  await audit(c, "member.enable", "user", id, { targetName: target.discordName });
  if (wl.count > 0) {
    await audit(c, "whitelist.reactivate", "WhitelistEntry", id, {
      count: wl.count,
      triggeredBy: "member.enable",
    });
  }
  return success(c, { disabled: false as const });
});

// --- Bulk Disable / Enable (developer only) ---

const bulkDisableSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  reason: z.string().min(1).max(500),
});

users.post("/bulk-disable", authMiddleware, requirePermission("developer"), rateLimit(10), validate("json", bulkDisableSchema), async (c) => {
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
  const [userResult, wl] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: safeIds } },
      data: { disabled: true, disabledAt: new Date(), disabledReason: reason },
    }),
    prisma.whitelistEntry.updateMany({
      where: { userId: { in: safeIds }, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    }),
  ]);

  for (const t of safeTargets) {
    clearSyncCache(t.discordId);
  }
  if (wl.count > 0) deployInBackground();

  await audit(c, "member.bulk_disable", "user", null, {
    count: userResult.count,
    reason,
    names: safeTargets.map((t) => t.discordName),
  });
  if (wl.count > 0) {
    await audit(c, "whitelist.deactivate", "WhitelistEntry", null, {
      count: wl.count,
      triggeredBy: "member.bulk_disable",
    });
  }
  return success(c, { disabled: userResult.count });
});

const bulkEnableSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
});

users.post("/bulk-enable", authMiddleware, requirePermission("developer"), rateLimit(10), validate("json", bulkEnableSchema), async (c) => {
  const { ids } = c.req.valid("json");

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, discordName: true },
  });

  const [userResult, wl] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { disabled: false, disabledAt: null, disabledReason: null },
    }),
    prisma.whitelistEntry.updateMany({
      where: { userId: { in: ids }, deactivatedAt: { not: null } },
      data: { deactivatedAt: null },
    }),
  ]);

  if (wl.count > 0) deployInBackground();

  await audit(c, "member.bulk_enable", "user", null, {
    count: userResult.count,
    names: targets.map((t) => t.discordName),
  });
  if (wl.count > 0) {
    await audit(c, "whitelist.reactivate", "WhitelistEntry", null, {
      count: wl.count,
      triggeredBy: "member.bulk_enable",
    });
  }
  return success(c, { enabled: userResult.count });
});

// --- Standard CRUD ---

users.get("/", authMiddleware, requirePermission("view:members", "manage:members"), async (c) => {
  const { page, limit, skip } = parsePageParams(c);
  const steamId = c.req.query("steamId");
  const eosId = c.req.query("eosId");

  const where: { steamId?: string; eosId?: string } = {};
  if (steamId) where.steamId = steamId;
  if (eosId) where.eosId = eosId;

  const [dbUsers, total, activityMap] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        roles: { include: { role: true } },
        comments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
    fetchActivityMap(),
  ]);

  const items: UserWithRolesAndComments[] = dbUsers.map((u) => mapUserWithComments(u, activityMap));

  return success(c, paginate(items, total, page, limit));
});

const updateUserSchema = z.object({
  steamId: z.string().optional(),
  eosId: z.string().optional(),
  country: z.string().max(100).optional(),
  membershipDate: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
});

users.patch("/:id", authMiddleware, requirePermission("manage:members"), validate("json", updateUserSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await findOrThrow(prisma.user, { id }, "User");

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

  if (body.steamId) {
    const collision = await prisma.user.findUnique({
      where: { steamId: body.steamId },
      select: { id: true, discordName: true },
    });
    if (collision && collision.id !== id) {
      return fail(c, `Steam ID ${body.steamId} is already linked to Discord user @${collision.discordName}.`, 409);
    }
  }
  if (body.eosId) {
    const collision = await prisma.user.findUnique({
      where: { eosId: body.eosId },
      select: { id: true, discordName: true },
    });
    if (collision && collision.id !== id) {
      return fail(c, `EOS ID ${body.eosId} is already linked to Discord user @${collision.discordName}.`, 409);
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

    if (body.steamId !== undefined) {
      await relinkWhitelistEntries(id, existing.steamId, updated.steamId);
    }

    await audit(c, "member.update", "user", id, { changes: body });

    const activityMap = await fetchActivityMap();
    return success(c, mapUserWithComments(updated, activityMap));
  } catch (err) {
    logger.error("users", "Failed to update user", { id, err });
    return fail(c, "Failed to update user.", 500);
  }
});

const resolveIdsSchema = z.object({
  discordIds: z.array(z.string()).min(1).max(200),
});

users.post("/resolve-ids", authMiddleware, validate("json", resolveIdsSchema), async (c) => {
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

  return c.body(null, 204);
});

// --- Unified profile endpoints ---

users.get("/:id/profile", authMiddleware, requirePermission("view:members", "manage:members"), async (c) => {
  const id = c.req.param("id");

  const dbUser = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: { include: { role: true } },
      comments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!dbUser) return fail(c, "User not found", 404);

  const stats = dbUser.steamId ? await fetchActivityForSteamId(dbUser.steamId) : ZERO_ACTIVITY;
  const activityMap = new Map<string, ActivityStats>();
  if (dbUser.steamId) activityMap.set(dbUser.steamId, stats);

  const [whitelistEntries] = await Promise.all([
    fetchLinkedWhitelistEntries({ userId: dbUser.id }),
  ]);

  const liveStatus = buildLiveStatus({ steamId: dbUser.steamId, eosId: dbUser.eosId });

  const result: UserProfile = {
    user: mapUserWithComments(dbUser, activityMap),
    steamId: dbUser.steamId,
    eosId: dbUser.eosId,
    displayName: dbUser.displayName ?? dbUser.discordName,
    whitelistEntries,
    liveStatus,
  };
  return success(c, result);
});

users.get("/profile", authMiddleware, requirePermission("view:members", "manage:members"), async (c) => {
  const steamId = c.req.query("steamId");
  if (!steamId) return fail(c, "steamId query parameter is required", 400);

  // If a User exists with this steamId, redirect-by-data: return same shape but with full user.
  const dbUser = await prisma.user.findUnique({
    where: { steamId },
    include: {
      roles: { include: { role: true } },
      comments: { orderBy: { createdAt: "desc" } },
    },
  });

  const stats = await fetchActivityForSteamId(steamId);
  const activityMap = new Map<string, ActivityStats>([[steamId, stats]]);

  if (dbUser) {
    const whitelistEntries = await fetchLinkedWhitelistEntries({ userId: dbUser.id });
    const liveStatus = buildLiveStatus({ steamId: dbUser.steamId, eosId: dbUser.eosId });
    const result: UserProfile = {
      user: mapUserWithComments(dbUser, activityMap),
      steamId: dbUser.steamId,
      eosId: dbUser.eosId,
      displayName: dbUser.displayName ?? dbUser.discordName,
      whitelistEntries,
      liveStatus,
    };
    return success(c, result);
  }

  // No User row — pure steamId-keyed read aggregation, no rows written.
  const whitelistEntries = await fetchLinkedWhitelistEntries({ steamId });
  const liveStatus = buildLiveStatus({ steamId });

  // Best-effort name from any source we have.
  const displayName = liveStatus.name ?? whitelistEntries[0]?.name ?? null;
  const eosId = liveStatus.eosId ?? null;

  const result: UserProfile = {
    user: null,
    steamId,
    eosId,
    displayName,
    whitelistEntries,
    liveStatus,
  };
  return success(c, result);
});

// --- Member Comments ---

const addCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

users.post("/:id/comments", authMiddleware, requirePermission("manage:members"), validate("json", addCommentSchema), async (c) => {
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

users.delete("/:id/comments/:commentId", authMiddleware, requirePermission("manage:members"), async (c) => {
  const userId = c.req.param("id");
  const commentId = c.req.param("commentId");

  const comment = await prisma.memberComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.userId !== userId) {
    return fail(c, "Comment not found", 404);
  }

  await prisma.memberComment.delete({ where: { id: commentId } });
  await audit(c, "member.comment.delete", "user", userId, { commentId });

  return c.body(null, 204);
});

export default users;

// Exported helpers reused by the by-steamid profile route
export { fetchActivityForSteamId, fetchLinkedWhitelistEntries, buildLiveStatus, ZERO_ACTIVITY };

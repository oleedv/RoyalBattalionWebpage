import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import { SignJWT } from "jose";
import type { Permission, AuthSyncResponse } from "shared";
import prisma from "../lib/db";
import { env } from "../lib/env";
import { fetchDiscordUser, fetchGuildRoles } from "../lib/discord";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { success, fail } from "../lib/crud-helpers";
import { logger } from "../lib/logger";
import { mergePermissions } from "../lib/extra-permissions";

const auth = new Hono();

const syncSchema = z.object({
  accessToken: z.string().min(1),
});

const getSecret = () => new TextEncoder().encode(env.JWT_SECRET);

const SYNC_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const syncCache = new Map<string, { data: AuthSyncResponse; expiry: number }>();

export function clearSyncCache(discordId: string) {
  syncCache.delete(`discord:${discordId}`);
}

auth.post("/sync", rateLimit(10), validate("json", syncSchema), async (c) => {
  const { accessToken } = c.req.valid("json");
  const guildId = env.DISCORD_GUILD_ID;

  if (!guildId) {
    return fail(c, "DISCORD_GUILD_ID is not configured", 500);
  }

  // Prune expired entries
  const now = Date.now();
  for (const [key, entry] of syncCache) {
    if (entry.expiry <= now) syncCache.delete(key);
  }

  try {
    // Fetch Discord user first to get a stable cache key (Discord user ID)
    const discordUser = await fetchDiscordUser(accessToken);

    // Check cache by Discord user ID (survives token refreshes / tab switches)
    const cacheKey = `discord:${discordUser.id}`;
    const cached = syncCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      return success(c, cached.data);
    }

    const guildRoles = await fetchGuildRoles(accessToken, guildId);

    logger.info("auth", `User ${discordUser.username}(${discordUser.id}) has ${guildRoles.length} Discord roles`, guildRoles);

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    // Upsert user
    const user = await prisma.user.upsert({
      where: { discordId: discordUser.id },
      update: {
        discordName: discordUser.username,
        displayName: discordUser.displayName,
        avatarUrl,
        hasLoggedIn: true,
      },
      create: {
        discordId: discordUser.id,
        discordName: discordUser.username,
        displayName: discordUser.displayName,
        avatarUrl,
        hasLoggedIn: true,
      },
    });

    // Block disabled users
    if (user.disabled) {
      return fail(c, "ACCOUNT_DISABLED", 403);
    }

    // Find matching Discord roles in our database
    const knownRoles = await prisma.discordRole.findMany({
      where: { discordRoleId: { in: guildRoles } },
      include: { permissions: true },
    });

    logger.info("auth", `Matched ${knownRoles.length}/${guildRoles.length} roles to DB`, knownRoles.map((r) => `${r.name}(${r.discordRoleId})`));

    // Sync user roles: remove old, add new
    await prisma.userRole.deleteMany({ where: { userId: user.id } });

    if (knownRoles.length > 0) {
      await prisma.userRole.createMany({
        data: knownRoles.map((role) => ({
          userId: user.id,
          roleId: role.id,
        })),
      });
    }

    // Collect permissions from all matched roles, then per-user extras
    // (UserPermission must survive Discord role resync above).
    const extraRows = await prisma.userPermission.findMany({
      where: { userId: user.id },
      select: { permission: true },
    });
    const permissions: Permission[] = mergePermissions(
      knownRoles.flatMap((role) =>
        role.permissions.map((p) => p.permission as Permission)
      ),
      extraRows.map((r) => r.permission as Permission),
    );

    logger.info("auth", `Final permissions for ${discordUser.username}`, permissions);

    // Master users: always grant admin (configured via ADMIN_DISCORD_IDS env var)
    const adminIds = env.ADMIN_DISCORD_IDS.split(",").map((s) => s.trim()).filter(Boolean);
    if (adminIds.includes(discordUser.id) && !permissions.includes("developer")) {
      permissions.push("developer");
    }

    // Build JWT
    const token = await new SignJWT({ userId: user.id, permissions })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("4h")
      .setIssuedAt()
      .sign(getSecret());

    const userWithRoles = {
      ...user,
      disabledAt: user.disabledAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      roles: knownRoles.map((r) => ({
        id: r.id,
        discordRoleId: r.discordRoleId,
        name: r.name,
      })),
    };

    const payload: AuthSyncResponse = { token, user: userWithRoles, permissions };

    syncCache.set(cacheKey, { data: payload, expiry: Date.now() + SYNC_CACHE_TTL_MS });

    return success(c, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth sync failed";
    logger.error("auth", "Auth sync error", err);
    if (message.includes("guild member fetch failed: 404")) {
      return fail(c, "NOT_IN_GUILD", 403);
    }
    return fail(c, "Auth sync failed", 500);
  }
});

auth.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const permissions = c.get("permissions");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: { role: true },
      },
    },
  });

  if (!user) {
    return fail(c, "User not found", 404);
  }

  const userWithRoles = {
    id: user.id,
    discordId: user.discordId,
    discordName: user.discordName,
    displayName: user.displayName ?? null,
    steamId: user.steamId,
    eosId: user.eosId,
    avatarUrl: user.avatarUrl,
    country: user.country,
    membershipDate: user.membershipDate?.toISOString() ?? null,
    dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
    birthdayOptOut: user.birthdayOptOut,
    birthdayShowAge: user.birthdayShowAge,
    hasLoggedIn: user.hasLoggedIn,
    disabled: user.disabled,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    disabledReason: user.disabledReason,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    roles: user.roles.map((ur) => ({
      id: ur.role.id,
      discordRoleId: ur.role.discordRoleId,
      name: ur.role.name,
    })),
  };

  return success(c, { user: userWithRoles, permissions });
});

export default auth;

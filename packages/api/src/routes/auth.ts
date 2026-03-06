import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { SignJWT } from "jose";
import type { Permission, ApiResponse, AuthSyncResponse, AuthMeResponse } from "shared";
import prisma from "../lib/db";
import { env } from "../lib/env";
import { fetchDiscordUser, fetchGuildRoles } from "../lib/discord";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { logger } from "../lib/logger";

const auth = new Hono();

const syncSchema = z.object({
  accessToken: z.string().min(1),
});

const getSecret = () => new TextEncoder().encode(env.JWT_SECRET);

const SYNC_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const syncCache = new Map<string, { data: ApiResponse<AuthSyncResponse>; expiry: number }>();

auth.post("/sync", rateLimit(10), zValidator("json", syncSchema), async (c) => {
  const { accessToken } = c.req.valid("json");
  const guildId = env.DISCORD_GUILD_ID;

  if (!guildId) {
    return c.json<ApiResponse<never>>({ success: false, error: "DISCORD_GUILD_ID is not configured" }, 500);
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
      return c.json(cached.data);
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
        avatarUrl,
      },
      create: {
        discordId: discordUser.id,
        discordName: discordUser.username,
        avatarUrl,
      },
    });

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

    // Collect permissions from all matched roles
    const permissions: Permission[] = [
      ...new Set(
        knownRoles.flatMap((role) =>
          role.permissions.map((p) => p.permission as Permission)
        )
      ),
    ];

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
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      roles: knownRoles.map((r) => ({
        id: r.id,
        discordRoleId: r.discordRoleId,
        name: r.name,
      })),
    };

    const response: ApiResponse<AuthSyncResponse> = {
      success: true,
      data: { token, user: userWithRoles, permissions },
    };

    syncCache.set(cacheKey, { data: response, expiry: Date.now() + SYNC_CACHE_TTL_MS });

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth sync failed";
    logger.error("auth", "Auth sync error", err);
    if (message.includes("guild member fetch failed: 404")) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: "NOT_IN_GUILD",
      }, 403);
    }
    return c.json<ApiResponse<never>>({ success: false, error: "Auth sync failed" }, 500);
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
    return c.json<ApiResponse<never>>({ success: false, error: "User not found" }, 404);
  }

  const userWithRoles = {
    id: user.id,
    discordId: user.discordId,
    discordName: user.discordName,
    steamId: user.steamId,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    roles: user.roles.map((ur) => ({
      id: ur.role.id,
      discordRoleId: ur.role.discordRoleId,
      name: ur.role.name,
    })),
  };

  return c.json<ApiResponse<AuthMeResponse>>({
    success: true,
    data: { user: userWithRoles, permissions },
  });
});

export default auth;

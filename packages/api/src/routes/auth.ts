import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { SignJWT } from "jose";
import type { Permission, ApiResponse, AuthSyncResponse, AuthMeResponse } from "shared";
import prisma from "../lib/db";
import { fetchDiscordUser, fetchGuildRoles } from "../lib/discord";
import { authMiddleware } from "../middleware/auth";

const auth = new Hono();

const syncSchema = z.object({
  accessToken: z.string().min(1),
});

const getSecret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

auth.post("/sync", zValidator("json", syncSchema), async (c) => {
  const { accessToken } = c.req.valid("json");
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    return c.json<ApiResponse<never>>({ success: false, error: "DISCORD_GUILD_ID is not configured" }, 500);
  }

  try {
    const [discordUser, guildRoles] = await Promise.all([
      fetchDiscordUser(accessToken),
      fetchGuildRoles(accessToken, guildId),
    ]);

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

    // Master user: always grant admin
    if (discordUser.id === "195412349153312768" && !permissions.includes("admin")) {
      permissions.push("admin");
    }

    // Build JWT
    const token = await new SignJWT({ userId: user.id, permissions })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
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

    return c.json<ApiResponse<AuthSyncResponse>>({
      success: true,
      data: { token, user: userWithRoles, permissions },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth sync failed";
    console.error("[auth/sync] Error:", err);
    return c.json<ApiResponse<never>>({ success: false, error: message }, 500);
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

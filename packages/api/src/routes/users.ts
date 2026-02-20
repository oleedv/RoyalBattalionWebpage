import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, UserWithRoles } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const users = new Hono();

const linkSteamSchema = z.object({
  steamId: z.string().min(1),
});

users.post("/link-steam", authMiddleware, zValidator("json", linkSteamSchema), async (c) => {
  const userId = c.get("userId");
  const { steamId } = c.req.valid("json");

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { steamId },
    });

    return c.json<ApiResponse<{ steamId: string }>>({
      success: true,
      data: { steamId: user.steamId! },
    });
  } catch (err) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to link Steam ID. It may already be linked to another account.",
    }, 400);
  }
});

users.get("/", authMiddleware, requirePermission("manage:members"), async (c) => {
  const dbUsers = await prisma.user.findMany({
    include: {
      roles: {
        include: { role: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result: UserWithRoles[] = dbUsers.map((u) => ({
    id: u.id,
    discordId: u.discordId,
    discordName: u.discordName,
    steamId: u.steamId,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    roles: u.roles.map((ur) => ({
      id: ur.role.id,
      discordRoleId: ur.role.discordRoleId,
      name: ur.role.name,
    })),
  }));

  return c.json<ApiResponse<UserWithRoles[]>>({
    success: true,
    data: result,
  });
});

export default users;

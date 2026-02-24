import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, UserWithRoles } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { syncAllUserRoles } from "../lib/role-sync";
import { audit } from "../lib/audit";

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

function mapUser(u: any): UserWithRoles {
  return {
    id: u.id,
    discordId: u.discordId,
    discordName: u.discordName,
    steamId: u.steamId,
    eosId: u.eosId ?? null,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    roles: u.roles.map((ur: any) => ({
      id: ur.role.id,
      discordRoleId: ur.role.discordRoleId,
      name: ur.role.name,
    })),
  };
}

users.post("/sync-roles", authMiddleware, requirePermission("manage:members"), async (c) => {
  if (!process.env.DISCORD_BOT_TOKEN) {
    return c.json<ApiResponse<never>>(
      { success: false, error: "DISCORD_BOT_TOKEN is not configured" },
      503
    );
  }

  try {
    const updated = await syncAllUserRoles();
    await audit(c, "member.sync_roles", "user", null, { updated });
    return c.json<ApiResponse<{ updated: number }>>({
      success: true,
      data: { updated },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return c.json<ApiResponse<never>>({ success: false, error: message }, 500);
  }
});

users.get("/", authMiddleware, requirePermission("view:members", "manage:members"), async (c) => {
  const dbUsers = await prisma.user.findMany({
    include: {
      roles: {
        include: { role: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result: UserWithRoles[] = dbUsers.map(mapUser);

  return c.json<ApiResponse<UserWithRoles[]>>({
    success: true,
    data: result,
  });
});

const updateUserSchema = z.object({
  steamId: z.string().optional(),
  eosId: z.string().optional(),
});

users.put("/:id", authMiddleware, requirePermission("manage:members"), zValidator("json", updateUserSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "User not found" }, 404);
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.steamId !== undefined && { steamId: body.steamId || null }),
        ...(body.eosId !== undefined && { eosId: body.eosId || null }),
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    await audit(c, "member.update", "user", id, { changes: body });

    return c.json<ApiResponse<UserWithRoles>>({
      success: true,
      data: mapUser(updated),
    });
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to update user. The Steam ID may already be linked to another account.",
    }, 400);
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

  return c.json<ApiResponse<Record<string, string>>>({
    success: true,
    data: nameMap,
  });
});

users.delete("/:id", authMiddleware, requirePermission("manage:members"), async (c) => {
  const id = c.req.param("id");

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "User not found" }, 404);
  }

  await prisma.user.delete({ where: { id } });
  await audit(c, "member.delete", "user", id, { discordName: existing.discordName });

  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default users;

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { UserWithRoles } from "shared";
import prisma from "../lib/db";
import { env } from "../lib/env";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { syncAllUserRoles } from "../lib/role-sync";
import { audit } from "../lib/audit";
import { rateLimit } from "../middleware/rate-limit";

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
  const dbUsers = await prisma.user.findMany({
    include: {
      roles: {
        include: { role: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result: UserWithRoles[] = dbUsers.map(mapUser);

  return success(c, result);
});

const updateUserSchema = z.object({
  steamId: z.string().optional(),
  eosId: z.string().optional(),
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
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    await audit(c, "member.update", "user", id, { changes: body });

    return success(c, mapUser(updated));
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

export default users;

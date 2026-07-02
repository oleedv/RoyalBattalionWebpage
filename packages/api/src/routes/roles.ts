import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PERMISSIONS } from "shared";
import type { DiscordRole, Permission } from "shared";
import prisma from "../lib/db";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";

const roles = new Hono();

// All routes require auth + manage:roles
roles.use("*", authMiddleware, requirePermission("manage:roles"));

const createRoleSchema = z.object({
  discordRoleId: z.string().min(1),
  name: z.string().min(1),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
});

const updatePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)),
});

roles.get("/", async (c) => {
  const dbRoles = await prisma.discordRole.findMany({
    include: { permissions: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  const result: DiscordRole[] = dbRoles.map((r) => ({
    id: r.id,
    discordRoleId: r.discordRoleId,
    name: r.name,
    permissions: r.permissions.map((p) => p.permission as Permission),
    grantsWhitelist: r.grantsWhitelist,
    isMemberRole: r.isMemberRole,
  }));

  return success(c, result);
});

roles.post("/", zValidator("json", createRoleSchema), async (c) => {
  const { discordRoleId, name, permissions } = c.req.valid("json");

  const collision = await prisma.discordRole.findUnique({
    where: { discordRoleId },
    select: { name: true },
  });
  if (collision) {
    return fail(c, `Discord role ID ${discordRoleId} is already mapped to "${collision.name}".`, 409);
  }

  try {
    const role = await prisma.discordRole.create({
      data: {
        discordRoleId,
        name,
        permissions: {
          create: permissions.map((p) => ({ permission: p })),
        },
      },
      include: { permissions: true },
    });

    const result: DiscordRole = {
      id: role.id,
      discordRoleId: role.discordRoleId,
      name: role.name,
      permissions: role.permissions.map((p) => p.permission as Permission),
      grantsWhitelist: role.grantsWhitelist,
      isMemberRole: role.isMemberRole,
    };

    audit(c, "role.create", "DiscordRole", role.id, { name, discordRoleId, permissions });

    return success(c, result, 201);
  } catch (err) {
    logger.error("roles", "Failed to create role", { name, discordRoleId, err });
    return fail(c, "Failed to create role.", 500);
  }
});

roles.put("/:id/permissions", zValidator("json", updatePermissionsSchema), async (c) => {
  const id = c.req.param("id");
  const { permissions } = c.req.valid("json");

  const existing = await findOrThrow(prisma.discordRole, { id }, "Role");

  // Replace all permissions
  await prisma.rolePermission.deleteMany({ where: { roleId: id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: id, permission: p })),
  });

  const updated = await prisma.discordRole.findUnique({
    where: { id },
    include: { permissions: true },
  });

  const result: DiscordRole = {
    id: updated!.id,
    discordRoleId: updated!.discordRoleId,
    name: updated!.name,
    permissions: updated!.permissions.map((p) => p.permission as Permission),
    grantsWhitelist: updated!.grantsWhitelist,
    isMemberRole: updated!.isMemberRole,
  };

  audit(c, "role.update_permissions", "DiscordRole", id, { name: existing.name, permissions });

  return success(c, result);
});

const updateRoleSchema = z.object({
  isMemberRole: z.boolean().optional(),
  grantsWhitelist: z.boolean().optional(),
});

// Partial update of role flags (merges the former member-role + whitelist-grant toggles).
roles.patch("/:id", zValidator("json", updateRoleSchema), async (c) => {
  const id = c.req.param("id");
  const { isMemberRole, grantsWhitelist } = c.req.valid("json");

  const existing = await findOrThrow(prisma.discordRole, { id }, "Role");

  const data: { isMemberRole?: boolean; grantsWhitelist?: boolean } = {};
  if (isMemberRole !== undefined) data.isMemberRole = isMemberRole;
  if (grantsWhitelist !== undefined) data.grantsWhitelist = grantsWhitelist;

  await prisma.discordRole.update({ where: { id }, data });

  const updated = await prisma.discordRole.findUnique({
    where: { id },
    include: { permissions: true },
  });

  const result: DiscordRole = {
    id: updated!.id,
    discordRoleId: updated!.discordRoleId,
    name: updated!.name,
    permissions: updated!.permissions.map((p) => p.permission as Permission),
    grantsWhitelist: updated!.grantsWhitelist,
    isMemberRole: updated!.isMemberRole,
  };

  if (isMemberRole !== undefined) {
    audit(c, "role.update_member_role", "DiscordRole", id, { name: existing.name, isMemberRole });
  }
  if (grantsWhitelist !== undefined) {
    audit(c, "role.update_whitelist_grant", "DiscordRole", id, { name: existing.name, grantsWhitelist });
  }

  return success(c, result);
});

roles.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.discordRole, { id }, "Role");

  await prisma.discordRole.delete({ where: { id } });

  audit(c, "role.delete", "DiscordRole", id, { name: existing.name, discordRoleId: existing.discordRoleId });

  return c.body(null, 204);
});

export default roles;

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PERMISSIONS } from "shared";
import type { ApiResponse, DiscordRole, Permission } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

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
  });

  const result: DiscordRole[] = dbRoles.map((r) => ({
    id: r.id,
    discordRoleId: r.discordRoleId,
    name: r.name,
    permissions: r.permissions.map((p) => p.permission as Permission),
  }));

  return c.json<ApiResponse<DiscordRole[]>>({
    success: true,
    data: result,
  });
});

roles.post("/", zValidator("json", createRoleSchema), async (c) => {
  const { discordRoleId, name, permissions } = c.req.valid("json");

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
    };

    return c.json<ApiResponse<DiscordRole>>({ success: true, data: result }, 201);
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to create role. The Discord role ID may already be mapped.",
    }, 400);
  }
});

roles.put("/:id/permissions", zValidator("json", updatePermissionsSchema), async (c) => {
  const id = c.req.param("id");
  const { permissions } = c.req.valid("json");

  const existing = await prisma.discordRole.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Role not found" }, 404);
  }

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
  };

  return c.json<ApiResponse<DiscordRole>>({ success: true, data: result });
});

roles.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await prisma.discordRole.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Role not found" }, 404);
  }

  await prisma.discordRole.delete({ where: { id } });

  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default roles;

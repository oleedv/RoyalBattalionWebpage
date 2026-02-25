import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { AdminGroup } from "shared";
import prisma from "../lib/db";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { audit } from "../lib/audit";

const adminGroups = new Hono();

adminGroups.use("*", authMiddleware, requirePermission("manage:whitelist"));

const createGroupSchema = z.object({
  name: z.string().min(1),
  permissions: z.string(),
  sortOrder: z.number().int().default(0),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  permissions: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

function toAdminGroup(g: {
  id: string;
  name: string;
  permissions: string;
  sortOrder: number;
  createdAt: Date;
}): AdminGroup {
  return {
    id: g.id,
    name: g.name,
    permissions: g.permissions,
    sortOrder: g.sortOrder,
    createdAt: g.createdAt.toISOString(),
  };
}

adminGroups.get("/", async (c) => {
  const groups = await prisma.adminGroup.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return success(c, groups.map(toAdminGroup));
});

adminGroups.post("/", zValidator("json", createGroupSchema), async (c) => {
  const { name, permissions, sortOrder } = c.req.valid("json");

  try {
    const group = await prisma.adminGroup.create({
      data: { name, permissions, sortOrder },
    });

    await audit(c, "admin_group.create", "admin_group", group.id, { name });

    return success(c, toAdminGroup(group), 201);
  } catch {
    return fail(c, "Failed to create group. Name may already exist.");
  }
});

adminGroups.put("/:id", zValidator("json", updateGroupSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  await findOrThrow(prisma.adminGroup, { id }, "Admin group");

  try {
    const group = await prisma.adminGroup.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.permissions !== undefined && { permissions: body.permissions }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
    });

    await audit(c, "admin_group.update", "admin_group", id, { changes: body });

    return success(c, toAdminGroup(group));
  } catch {
    return fail(c, "Failed to update group");
  }
});

adminGroups.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.adminGroup, { id }, "Admin group");

  await prisma.adminGroup.delete({ where: { id } });
  await audit(c, "admin_group.delete", "admin_group", id, { name: existing.name });

  return success(c, { deleted: true as const });
});

export default adminGroups;

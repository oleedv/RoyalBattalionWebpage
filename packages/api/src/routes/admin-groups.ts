import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, AdminGroup } from "shared";
import prisma from "../lib/db";
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

  return c.json<ApiResponse<AdminGroup[]>>({
    success: true,
    data: groups.map(toAdminGroup),
  });
});

adminGroups.post("/", zValidator("json", createGroupSchema), async (c) => {
  const { name, permissions, sortOrder } = c.req.valid("json");

  try {
    const group = await prisma.adminGroup.create({
      data: { name, permissions, sortOrder },
    });

    await audit(c, "admin_group.create", "admin_group", group.id, { name });

    return c.json<ApiResponse<AdminGroup>>(
      { success: true, data: toAdminGroup(group) },
      201
    );
  } catch {
    return c.json<ApiResponse<never>>(
      { success: false, error: "Failed to create group. Name may already exist." },
      400
    );
  }
});

adminGroups.put("/:id", zValidator("json", updateGroupSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await prisma.adminGroup.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Group not found" }, 404);
  }

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

    return c.json<ApiResponse<AdminGroup>>({ success: true, data: toAdminGroup(group) });
  } catch {
    return c.json<ApiResponse<never>>(
      { success: false, error: "Failed to update group" },
      400
    );
  }
});

adminGroups.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await prisma.adminGroup.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Group not found" }, 404);
  }

  await prisma.adminGroup.delete({ where: { id } });
  await audit(c, "admin_group.delete", "admin_group", id, { name: existing.name });

  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default adminGroups;

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, Clan } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { audit } from "../lib/audit";

const clans = new Hono();

clans.use("*", authMiddleware, requirePermission("manage:whitelist"));

const createClanSchema = z.object({
  name: z.string().min(1),
  tag: z.string().min(1),
});

const updateClanSchema = z.object({
  name: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
});

function toClan(c: { id: string; name: string; tag: string; createdAt: Date }): Clan {
  return {
    id: c.id,
    name: c.name,
    tag: c.tag,
    createdAt: c.createdAt.toISOString(),
  };
}

clans.get("/", async (c) => {
  const rows = await prisma.clan.findMany({ orderBy: { name: "asc" } });
  return c.json<ApiResponse<Clan[]>>({ success: true, data: rows.map(toClan) });
});

clans.post("/", zValidator("json", createClanSchema), async (c) => {
  const { name, tag } = c.req.valid("json");
  try {
    const clan = await prisma.clan.create({ data: { name, tag } });
    await audit(c, "clan.create", "clan", clan.id, { name, tag });
    return c.json<ApiResponse<Clan>>({ success: true, data: toClan(clan) }, 201);
  } catch {
    return c.json<ApiResponse<never>>(
      { success: false, error: "Failed to create clan. Name or tag may already exist." },
      400
    );
  }
});

clans.put("/:id", zValidator("json", updateClanSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await prisma.clan.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Clan not found" }, 404);
  }

  try {
    const clan = await prisma.clan.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.tag !== undefined && { tag: body.tag }),
      },
    });
    await audit(c, "clan.update", "clan", id, { changes: body });
    return c.json<ApiResponse<Clan>>({ success: true, data: toClan(clan) });
  } catch {
    return c.json<ApiResponse<never>>({ success: false, error: "Failed to update clan" }, 400);
  }
});

clans.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await prisma.clan.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Clan not found" }, 404);
  }

  await prisma.clan.delete({ where: { id } });
  await audit(c, "clan.delete", "clan", id, { name: existing.name, tag: existing.tag });
  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default clans;

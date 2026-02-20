import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, WhitelistEntry } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const whitelist = new Hono();

// All routes require auth
whitelist.use("*", authMiddleware);

const addEntrySchema = z.object({
  steamId: z.string().min(1),
  reason: z.string().optional(),
});

const updateEntrySchema = z.object({
  steamId: z.string().min(1).optional(),
  reason: z.string().optional(),
});

whitelist.get("/", requirePermission("view:whitelist"), async (c) => {
  const entries = await prisma.whitelistEntry.findMany({
    orderBy: { createdAt: "desc" },
  });

  const result: WhitelistEntry[] = entries.map((e) => ({
    id: e.id,
    steamId: e.steamId,
    addedBy: e.addedBy,
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  }));

  return c.json<ApiResponse<WhitelistEntry[]>>({ success: true, data: result });
});

whitelist.post("/", requirePermission("manage:whitelist"), zValidator("json", addEntrySchema), async (c) => {
  const userId = c.get("userId");
  const { steamId, reason } = c.req.valid("json");

  try {
    const entry = await prisma.whitelistEntry.create({
      data: {
        steamId,
        addedBy: userId,
        reason: reason ?? null,
      },
    });

    const result: WhitelistEntry = {
      id: entry.id,
      steamId: entry.steamId,
      addedBy: entry.addedBy,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    };

    return c.json<ApiResponse<WhitelistEntry>>({ success: true, data: result }, 201);
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to add whitelist entry. The Steam ID may already be whitelisted.",
    }, 400);
  }
});

whitelist.put("/:id", requirePermission("manage:whitelist"), zValidator("json", updateEntrySchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await prisma.whitelistEntry.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Whitelist entry not found" }, 404);
  }

  try {
    const entry = await prisma.whitelistEntry.update({
      where: { id },
      data: {
        ...(body.steamId !== undefined && { steamId: body.steamId }),
        ...(body.reason !== undefined && { reason: body.reason || null }),
      },
    });

    const result: WhitelistEntry = {
      id: entry.id,
      steamId: entry.steamId,
      addedBy: entry.addedBy,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    };

    return c.json<ApiResponse<WhitelistEntry>>({ success: true, data: result });
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to update whitelist entry. The Steam ID may already be whitelisted.",
    }, 400);
  }
});

const bulkAddSchema = z.object({
  entries: z.array(z.object({
    steamId: z.string().min(1),
    reason: z.string().optional(),
  })).min(1).max(500),
});

whitelist.post("/bulk", requirePermission("manage:whitelist"), zValidator("json", bulkAddSchema), async (c) => {
  const userId = c.get("userId");
  const { entries } = c.req.valid("json");

  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    try {
      await prisma.whitelistEntry.create({
        data: {
          steamId: entry.steamId,
          addedBy: userId,
          reason: entry.reason ?? null,
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  return c.json<ApiResponse<{ created: number; skipped: number }>>({
    success: true,
    data: { created, skipped },
  }, 201);
});

whitelist.delete("/:id", requirePermission("manage:whitelist"), async (c) => {
  const id = c.req.param("id");

  const existing = await prisma.whitelistEntry.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Whitelist entry not found" }, 404);
  }

  await prisma.whitelistEntry.delete({ where: { id } });

  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default whitelist;

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, WhitelistEntry, WhitelistCandidate } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { triggerSftpDeploy } from "../lib/sftp-deploy";

const whitelist = new Hono();

// All routes require auth
whitelist.use("*", authMiddleware);

function toEntry(e: {
  id: string;
  steamId: string;
  server: string;
  name: string | null;
  clan: string | null;
  role: string | null;
  groupId: string | null;
  group?: { name: string } | null;
  addedBy: string;
  reason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}): WhitelistEntry {
  return {
    id: e.id,
    steamId: e.steamId,
    server: e.server,
    name: e.name,
    clan: e.clan,
    role: e.role,
    groupId: e.groupId,
    groupName: e.group?.name ?? null,
    addedBy: e.addedBy,
    reason: e.reason,
    expiresAt: e.expiresAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

function deployInBackground(server?: string) {
  triggerSftpDeploy(server).catch((err) =>
    console.error("[sftp-deploy] Failed:", err)
  );
}

const addEntrySchema = z.object({
  steamId: z.string().min(1),
  server: z.string().min(1).default("main"),
  name: z.string().optional(),
  clan: z.string().optional(),
  role: z.string().optional(),
  groupId: z.string().optional(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(),
});

const updateEntrySchema = z.object({
  steamId: z.string().min(1).optional(),
  name: z.string().optional(),
  clan: z.string().optional(),
  role: z.string().optional(),
  groupId: z.string().nullable().optional(),
  reason: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});

whitelist.get("/", requirePermission("view:whitelist"), async (c) => {
  const server = c.req.query("server");

  const entries = await prisma.whitelistEntry.findMany({
    where: server ? { server } : {},
    include: { group: true },
    orderBy: { createdAt: "desc" },
  });

  return c.json<ApiResponse<WhitelistEntry[]>>({
    success: true,
    data: entries.map(toEntry),
  });
});

whitelist.get("/candidates", requirePermission("manage:whitelist"), async (c) => {
  const server = c.req.query("server") || "main";

  const existingSteamIds = await prisma.whitelistEntry.findMany({
    where: { server },
    select: { steamId: true },
  });
  const existingSet = new Set(existingSteamIds.map((e) => e.steamId));

  const candidates = await prisma.user.findMany({
    where: {
      steamId: { not: null },
      roles: {
        some: {
          role: { grantsWhitelist: true },
        },
      },
    },
    include: {
      roles: { include: { role: true } },
    },
  });

  const result: WhitelistCandidate[] = candidates
    .filter((u) => u.steamId && !existingSet.has(u.steamId))
    .map((u) => ({
      userId: u.id,
      discordName: u.discordName,
      steamId: u.steamId!,
      roleName: u.roles.find((r) => r.role.grantsWhitelist)?.role.name || "",
    }));

  return c.json<ApiResponse<WhitelistCandidate[]>>({ success: true, data: result });
});

whitelist.post("/", requirePermission("manage:whitelist"), zValidator("json", addEntrySchema), async (c) => {
  const userId = c.get("userId");
  const { steamId, server, name, clan, role, groupId, reason, expiresAt } = c.req.valid("json");

  try {
    const entry = await prisma.whitelistEntry.create({
      data: {
        steamId,
        server,
        name: name ?? null,
        clan: clan ?? null,
        role: role ?? null,
        groupId: groupId ?? null,
        addedBy: userId,
        reason: reason ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: { group: true },
    });

    deployInBackground(server);

    return c.json<ApiResponse<WhitelistEntry>>({ success: true, data: toEntry(entry) }, 201);
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to add whitelist entry. The Steam ID may already be whitelisted on this server.",
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
        ...(body.name !== undefined && { name: body.name || null }),
        ...(body.clan !== undefined && { clan: body.clan || null }),
        ...(body.role !== undefined && { role: body.role || null }),
        ...(body.groupId !== undefined && { groupId: body.groupId }),
        ...(body.reason !== undefined && { reason: body.reason || null }),
        ...(body.expiresAt !== undefined && {
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        }),
      },
      include: { group: true },
    });

    deployInBackground(existing.server);

    return c.json<ApiResponse<WhitelistEntry>>({ success: true, data: toEntry(entry) });
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to update whitelist entry.",
    }, 400);
  }
});

const bulkAddSchema = z.object({
  server: z.string().min(1).default("main"),
  entries: z.array(z.object({
    steamId: z.string().min(1),
    name: z.string().optional(),
    clan: z.string().optional(),
    role: z.string().optional(),
    groupId: z.string().optional(),
    reason: z.string().optional(),
  })).min(1).max(500),
});

whitelist.post("/bulk", requirePermission("manage:whitelist"), zValidator("json", bulkAddSchema), async (c) => {
  const userId = c.get("userId");
  const { server, entries } = c.req.valid("json");

  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    try {
      await prisma.whitelistEntry.create({
        data: {
          steamId: entry.steamId,
          server,
          name: entry.name ?? null,
          clan: entry.clan ?? null,
          role: entry.role ?? null,
          groupId: entry.groupId ?? null,
          addedBy: userId,
          reason: entry.reason ?? null,
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  deployInBackground(server);

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

  deployInBackground(existing.server);

  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default whitelist;

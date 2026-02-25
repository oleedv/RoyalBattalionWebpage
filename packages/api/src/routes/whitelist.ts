import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { WhitelistEntry, WhitelistCandidate } from "shared";
import prisma from "../lib/db";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { triggerSftpDeploy } from "../lib/sftp-deploy";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { rateLimit } from "../middleware/rate-limit";

const whitelist = new Hono();

// All routes require auth
whitelist.use("*", authMiddleware);

function toEntry(e: {
  id: string;
  steamId: string;
  server: string;
  name: string | null;
  clan: string | null;
  clanId: string | null;
  clanRef?: { name: string } | null;
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
    clanId: e.clanId,
    clanName: e.clanRef?.name ?? null,
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
    logger.error("sftp", "Deploy failed", err)
  );
}

const addEntrySchema = z.object({
  steamId: z.string().regex(/^\d{17}$/, "Steam ID must be a 17-digit number"),
  server: z.string().min(1).default("main"),
  name: z.string().optional(),
  clan: z.string().optional(),
  clanId: z.string().optional(),
  role: z.string().optional(),
  groupId: z.string().optional(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(),
});

const updateEntrySchema = z.object({
  steamId: z.string().min(1).optional(),
  name: z.string().optional(),
  clan: z.string().optional(),
  clanId: z.string().nullable().optional(),
  role: z.string().optional(),
  groupId: z.string().nullable().optional(),
  reason: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});

whitelist.get("/", requirePermission("view:whitelist"), async (c) => {
  const server = c.req.query("server");

  const entries = await prisma.whitelistEntry.findMany({
    where: server ? { server } : {},
    include: { group: true, clanRef: true },
    orderBy: { createdAt: "desc" },
  });

  return success(c, entries.map(toEntry));
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

  return success(c, result);
});

whitelist.post("/", requirePermission("manage:whitelist"), rateLimit(30), zValidator("json", addEntrySchema), async (c) => {
  const userId = c.get("userId");
  const { steamId, server, name, clan, clanId, role, groupId, reason, expiresAt } = c.req.valid("json");

  try {
    const entry = await prisma.whitelistEntry.create({
      data: {
        steamId,
        server,
        name: name ?? null,
        clan: clan ?? null,
        clanId: clanId ?? null,
        role: role ?? null,
        groupId: groupId ?? null,
        addedBy: userId,
        reason: reason ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: { group: true, clanRef: true },
    });

    deployInBackground(server);
    audit(c, "whitelist.add", "WhitelistEntry", entry.id, { steamId, server, name, role });

    return success(c, toEntry(entry), 201);
  } catch {
    return fail(c, "Failed to add whitelist entry. The Steam ID may already be whitelisted on this server.");
  }
});

whitelist.put("/:id", requirePermission("manage:whitelist"), zValidator("json", updateEntrySchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await findOrThrow(prisma.whitelistEntry, { id }, "Whitelist entry");

  try {
    const entry = await prisma.whitelistEntry.update({
      where: { id },
      data: {
        ...(body.steamId !== undefined && { steamId: body.steamId }),
        ...(body.name !== undefined && { name: body.name || null }),
        ...(body.clan !== undefined && { clan: body.clan || null }),
        ...(body.clanId !== undefined && { clanId: body.clanId }),
        ...(body.role !== undefined && { role: body.role || null }),
        ...(body.groupId !== undefined && { groupId: body.groupId }),
        ...(body.reason !== undefined && { reason: body.reason || null }),
        ...(body.expiresAt !== undefined && {
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        }),
      },
      include: { group: true, clanRef: true },
    });

    deployInBackground(existing.server);
    audit(c, "whitelist.update", "WhitelistEntry", id, { steamId: existing.steamId, changes: body });

    return success(c, toEntry(entry));
  } catch {
    return fail(c, "Failed to update whitelist entry.");
  }
});

const bulkAddSchema = z.object({
  server: z.string().min(1).default("main"),
  entries: z.array(z.object({
    steamId: z.string().regex(/^\d{17}$/, "Steam ID must be a 17-digit number"),
    name: z.string().optional(),
    clan: z.string().optional(),
    clanId: z.string().optional(),
    role: z.string().optional(),
    groupId: z.string().optional(),
    reason: z.string().optional(),
  })).min(1).max(200),
});

whitelist.post("/bulk", requirePermission("manage:whitelist"), rateLimit(5), zValidator("json", bulkAddSchema), async (c) => {
  const userId = c.get("userId");
  const { server, entries } = c.req.valid("json");

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let skipped = 0;

    for (const entry of entries) {
      try {
        await tx.whitelistEntry.create({
          data: {
            steamId: entry.steamId,
            server,
            name: entry.name ?? null,
            clan: entry.clan ?? null,
            clanId: entry.clanId ?? null,
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

    return { created, skipped };
  });

  deployInBackground(server);
  audit(c, "whitelist.bulk_add", "WhitelistEntry", null, { server, created: result.created, skipped: result.skipped, total: entries.length });

  return success(c, { created: result.created, skipped: result.skipped }, 201);
});

whitelist.delete("/:id", requirePermission("manage:whitelist"), async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.whitelistEntry, { id }, "Whitelist entry");

  await prisma.whitelistEntry.delete({ where: { id } });

  deployInBackground(existing.server);
  audit(c, "whitelist.delete", "WhitelistEntry", id, { steamId: existing.steamId, name: existing.name, server: existing.server });

  return success(c, { deleted: true as const });
});

export default whitelist;

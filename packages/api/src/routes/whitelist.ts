import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { WhitelistEntry, WhitelistEntryWithComments, WhitelistComment, WhitelistCandidate } from "shared";
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
  userId?: string | null;
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
    userId: e.userId ?? null,
    addedBy: e.addedBy,
    reason: e.reason,
    expiresAt: e.expiresAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

function mapComment(c: {
  id: string;
  whitelistEntryId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Date;
}): WhitelistComment {
  return {
    id: c.id,
    whitelistEntryId: c.whitelistEntryId,
    authorId: c.authorId,
    authorName: c.authorName,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
  };
}

function deployInBackground(server?: string) {
  triggerSftpDeploy(server).catch((err) =>
    logger.error("sftp", "Deploy failed", err)
  );
}

async function findUserIdForSteam(steamId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { steamId }, select: { id: true } });
  return user?.id ?? null;
}

// Bot-created entries store a non-User `addedBy` (the bot's Discord client id, or a system
// tag) that the plain User.id lookup can't resolve, so the panel showed a raw id. Map those
// to friendly names, and fall back to a discordId lookup so a staff Discord id resolves too.
const SYSTEM_ACTOR_NAMES: Record<string, string> = {
  "1137723361779261542": "Royal Secretary Bot", // bot Discord client id (prospect grants)
  SeedTracker: "Seed Tracker", // seed-tracker reward grants
  "sl-reward-system": "SL Reward", // squad-leader reward grants
};

async function resolveAddedByName(addedBy: string): Promise<string | null> {
  const systemName = SYSTEM_ACTOR_NAMES[addedBy];
  if (systemName) return systemName;
  const byId = await prisma.user.findUnique({ where: { id: addedBy }, select: { discordName: true } });
  if (byId) return byId.discordName;
  const byDiscord = await prisma.user.findUnique({ where: { discordId: addedBy }, select: { discordName: true } });
  return byDiscord?.discordName ?? null;
}

function formatDuplicateError(
  steamId: string,
  server: string,
  existing: { name: string | null; expiresAt: Date | null },
): string {
  const who = existing.name ? ` as "${existing.name}"` : "";
  if (!existing.expiresAt) {
    return `Steam ID ${steamId} is already whitelisted on "${server}"${who} (no expiry).`;
  }
  const expIso = existing.expiresAt.toISOString().slice(0, 10);
  if (existing.expiresAt < new Date()) {
    return `Steam ID ${steamId} is already whitelisted on "${server}"${who} (expired ${expIso}). Enable "Show Expired" to edit or delete it.`;
  }
  return `Steam ID ${steamId} is already whitelisted on "${server}"${who} (expires ${expIso}).`;
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

const addCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  data: z.object({
    clanId: z.string().nullable().optional(),
    groupId: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  }),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
});

// ── List entries ──────────────────────────────────────────────

whitelist.get("/", requirePermission("view:whitelist"), async (c) => {
  const server = c.req.query("server");

  const entries = await prisma.whitelistEntry.findMany({
    where: { ...(server ? { server } : {}), deactivatedAt: null },
    include: { group: true, clanRef: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return success(c, entries.map(toEntry));
});

// ── Candidates ───────────────────────────────────────────────

whitelist.get("/candidates", requirePermission("manage:whitelist"), async (c) => {
  const server = c.req.query("server") || "main";

  const existingSteamIds = await prisma.whitelistEntry.findMany({
    where: { server },
    select: { steamId: true },
  });
  const existingSet = new Set(existingSteamIds.map((e) => e.steamId));

  const candidates = await prisma.user.findMany({
    where: {
      disabled: false,
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
    take: 1000,
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

// ── Add entry (with duplicate warning) ───────────────────────

whitelist.post("/", requirePermission("manage:whitelist"), rateLimit(30), zValidator("json", addEntrySchema), async (c) => {
  const userId = c.get("userId");
  const { steamId, server, name, clan, clanId, role, groupId, reason, expiresAt } = c.req.valid("json");

  // Explicit duplicate check on this server (unique constraint is [steamId, server])
  const existing = await prisma.whitelistEntry.findUnique({
    where: { steamId_server: { steamId, server } },
    select: { id: true, name: true, expiresAt: true },
  });
  if (existing) {
    return fail(c, formatDuplicateError(steamId, server, existing), 409);
  }

  try {
    // Check for duplicates on other servers (informational warning only).
    // Expired entries on other servers aren't really blocking anything, so omit them.
    const now = new Date();
    const duplicates = await prisma.whitelistEntry.findMany({
      where: {
        steamId,
        server: { not: server },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { server: true, name: true, expiresAt: true },
    });

    const linkedUserId = await findUserIdForSteam(steamId);
    const entry = await prisma.whitelistEntry.create({
      data: {
        steamId,
        server,
        name: name ?? null,
        clan: clan ?? null,
        clanId: clanId ?? null,
        role: role ?? null,
        groupId: groupId ?? null,
        userId: linkedUserId,
        addedBy: userId,
        reason: reason ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: { group: true, clanRef: true },
    });

    deployInBackground(server);
    audit(c, "whitelist.add", "WhitelistEntry", entry.id, { steamId, server, name, role });

    const result = toEntry(entry);
    const warnings = duplicates.length > 0
      ? [`This Steam ID is already whitelisted on: ${duplicates
          .map((d) => {
            const who = d.name ? ` as "${d.name}"` : "";
            const exp = d.expiresAt ? `, expires ${d.expiresAt.toISOString().slice(0, 10)}` : ", no expiry";
            return `${d.server}${who}${exp}`;
          })
          .join("; ")}`]
      : undefined;

    return success(c, { ...result, warnings }, 201);
  } catch (err) {
    logger.error("whitelist", "Failed to add whitelist entry", { steamId, server, err });
    return fail(c, "Failed to add whitelist entry.", 500);
  }
});

// ── Bulk add ─────────────────────────────────────────────────

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

  try {
  const submittedSteamIds = entries.map((e) => e.steamId);
  const existingRows = await prisma.whitelistEntry.findMany({
    where: { server, steamId: { in: submittedSteamIds } },
    select: { steamId: true, name: true, expiresAt: true },
  });
  const existingMap = new Map(existingRows.map((e) => [e.steamId, e]));

  const result = await prisma.$transaction(async (tx) => {
    const seenInBatch = new Set<string>();
    let created = 0;
    const skipped: {
      steamId: string;
      reason: "duplicate_existing" | "duplicate_in_batch";
      existingName?: string | null;
      existingExpiresAt?: string | null;
    }[] = [];

    for (const entry of entries) {
      const collision = existingMap.get(entry.steamId);
      if (collision) {
        skipped.push({
          steamId: entry.steamId,
          reason: "duplicate_existing",
          existingName: collision.name,
          existingExpiresAt: collision.expiresAt?.toISOString() ?? null,
        });
        continue;
      }
      if (seenInBatch.has(entry.steamId)) {
        skipped.push({ steamId: entry.steamId, reason: "duplicate_in_batch" });
        continue;
      }
      seenInBatch.add(entry.steamId);

      try {
        const linkedUser = await tx.user.findUnique({ where: { steamId: entry.steamId }, select: { id: true } });
        await tx.whitelistEntry.create({
          data: {
            steamId: entry.steamId,
            server,
            name: entry.name ?? null,
            clan: entry.clan ?? null,
            clanId: entry.clanId ?? null,
            role: entry.role ?? null,
            groupId: entry.groupId ?? null,
            userId: linkedUser?.id ?? null,
            addedBy: userId,
            reason: entry.reason ?? null,
          },
        });
        created++;
      } catch (err) {
        logger.warn("whitelist", "Bulk add race/duplicate classified as existing", { steamId: entry.steamId, server, err });
        skipped.push({ steamId: entry.steamId, reason: "duplicate_existing" });
      }
    }

    return { created, skipped };
  });

  deployInBackground(server);
  audit(c, "whitelist.bulk_add", "WhitelistEntry", null, { server, created: result.created, skipped: result.skipped.length, total: entries.length });

  return success(c, { created: result.created, skipped: result.skipped }, 201);
  } catch (err) {
    logger.error("whitelist", "Failed to bulk add whitelist entries", { server, err });
    return fail(c, "Failed to bulk add whitelist entries.", 500);
  }
});

// ── Bulk update ──────────────────────────────────────────────

whitelist.post("/bulk-update", requirePermission("manage:whitelist"), rateLimit(10), zValidator("json", bulkUpdateSchema), async (c) => {
  const { ids, data } = c.req.valid("json");

  try {
    const updateData: Record<string, unknown> = {};
    if (data.clanId !== undefined) {
      updateData.clanId = data.clanId;
      if (data.clanId) {
        const clan = await prisma.clan.findUnique({ where: { id: data.clanId }, select: { tag: true } });
        updateData.clan = clan?.tag ?? null;
      } else {
        updateData.clan = null;
      }
    }
    if (data.groupId !== undefined) updateData.groupId = data.groupId;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    const result = await prisma.whitelistEntry.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    const sampleEntry = await prisma.whitelistEntry.findFirst({ where: { id: { in: ids } }, select: { server: true } });
    if (sampleEntry) deployInBackground(sampleEntry.server);

    audit(c, "whitelist.bulk_update", "WhitelistEntry", null, { count: result.count, changes: data });

    return success(c, { updated: result.count });
  } catch (err) {
    logger.error("whitelist", "Failed to bulk update whitelist entries", { err });
    return fail(c, "Failed to bulk update whitelist entries.", 500);
  }
});

// ── Bulk delete ──────────────────────────────────────────────

whitelist.post("/bulk-delete", requirePermission("manage:whitelist"), rateLimit(10), zValidator("json", bulkDeleteSchema), async (c) => {
  const { ids } = c.req.valid("json");

  try {
    const entries = await prisma.whitelistEntry.findMany({
      where: { id: { in: ids } },
      select: { id: true, steamId: true, name: true, server: true },
    });

    const result = await prisma.whitelistEntry.deleteMany({
      where: { id: { in: ids } },
    });

    const servers = [...new Set(entries.map((e) => e.server))];
    for (const server of servers) deployInBackground(server);

    audit(c, "whitelist.bulk_delete", "WhitelistEntry", null, {
      count: result.count,
      steamIds: entries.map((e) => e.steamId),
    });

    return success(c, { deleted: result.count });
  } catch (err) {
    logger.error("whitelist", "Failed to bulk delete whitelist entries", { err });
    return fail(c, "Failed to bulk delete whitelist entries.", 500);
  }
});

// ── Get single entry with comments ──────────────────────────

whitelist.get("/:id", requirePermission("view:whitelist"), async (c) => {
  const id = c.req.param("id");

  const entry = await prisma.whitelistEntry.findUnique({
    where: { id },
    include: {
      group: true,
      clanRef: true,
      comments: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!entry) return fail(c, "Whitelist entry not found", 404);

  const addedByName = await resolveAddedByName(entry.addedBy);

  const result: WhitelistEntryWithComments = {
    ...toEntry(entry),
    comments: entry.comments.map(mapComment),
    addedByName,
  };

  return success(c, result);
});

// ── Update entry ─────────────────────────────────────────────

whitelist.patch("/:id", requirePermission("manage:whitelist"), zValidator("json", updateEntrySchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await findOrThrow(prisma.whitelistEntry, { id }, "Whitelist entry");

  // If steamId is being changed, enforce per-server uniqueness explicitly
  if (body.steamId !== undefined && body.steamId !== existing.steamId) {
    const collision = await prisma.whitelistEntry.findUnique({
      where: { steamId_server: { steamId: body.steamId, server: existing.server } },
      select: { id: true, name: true, expiresAt: true },
    });
    if (collision) {
      return fail(c, formatDuplicateError(body.steamId, existing.server, collision), 409);
    }
  }

  try {
    const newSteamId = body.steamId !== undefined ? body.steamId : existing.steamId;
    const linkedUserId =
      body.steamId !== undefined && body.steamId !== existing.steamId
        ? await findUserIdForSteam(newSteamId)
        : undefined;

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
        ...(linkedUserId !== undefined && { userId: linkedUserId }),
      },
      include: { group: true, clanRef: true },
    });

    deployInBackground(existing.server);

    const trackedFields = [
      "steamId", "name", "clan", "clanId", "role",
      "groupId", "reason", "expiresAt", "userId",
    ] as const;
    const serialize = (v: unknown): unknown =>
      v instanceof Date ? v.toISOString() : v ?? null;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of trackedFields) {
      const before = serialize((existing as Record<string, unknown>)[f]);
      const after = serialize((entry as Record<string, unknown>)[f]);
      if (before !== after) {
        changes[f] = { from: before, to: after };
      }
    }
    audit(c, "whitelist.update", "WhitelistEntry", id, { steamId: existing.steamId, changes });

    return success(c, toEntry(entry));
  } catch (err) {
    logger.error("whitelist", "Failed to update whitelist entry", { id, err });
    return fail(c, "Failed to update whitelist entry.", 500);
  }
});

// ── Delete entry ─────────────────────────────────────────────

whitelist.delete("/:id", requirePermission("manage:whitelist"), async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.whitelistEntry, { id }, "Whitelist entry");

  await prisma.whitelistEntry.delete({ where: { id } });

  deployInBackground(existing.server);
  audit(c, "whitelist.delete", "WhitelistEntry", id, { steamId: existing.steamId, name: existing.name, server: existing.server });

  return c.body(null, 204);
});

// ── Add comment ──────────────────────────────────────────────

whitelist.post("/:id/comments", requirePermission("manage:whitelist"), zValidator("json", addCommentSchema), async (c) => {
  const entryId = c.req.param("id");
  const authorId = c.get("userId") as string;
  const { text } = c.req.valid("json");

  await findOrThrow(prisma.whitelistEntry, { id: entryId }, "Whitelist entry");

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { discordName: true },
  });

  const comment = await prisma.whitelistComment.create({
    data: {
      whitelistEntryId: entryId,
      authorId,
      authorName: author?.discordName ?? "Unknown",
      text,
    },
  });

  audit(c, "whitelist.comment.add", "WhitelistEntry", entryId, {
    commentId: comment.id,
    textPreview: text.slice(0, 200),
  });

  return success(c, mapComment(comment), 201);
});

// ── Delete comment ───────────────────────────────────────────

whitelist.delete("/:id/comments/:commentId", requirePermission("manage:whitelist"), async (c) => {
  const entryId = c.req.param("id");
  const commentId = c.req.param("commentId");

  // Scope the lookup to BOTH the entry and the comment so a comment can only be
  // deleted via its owning entry's path (404 on any mismatch).
  const comment = await prisma.whitelistComment.findUnique({
    where: { id: commentId },
    select: { id: true, whitelistEntryId: true },
  });
  if (!comment || comment.whitelistEntryId !== entryId) {
    return fail(c, "Comment not found", 404);
  }

  await prisma.whitelistComment.delete({ where: { id: commentId } });
  audit(c, "whitelist.comment.delete", "WhitelistEntry", entryId, { commentId });

  return c.body(null, 204);
});

export default whitelist;

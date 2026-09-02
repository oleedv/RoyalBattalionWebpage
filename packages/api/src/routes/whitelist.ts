import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import type {
  WhitelistEntry,
  WhitelistEntryWithComments,
  WhitelistComment,
  WhitelistCandidate,
  DismissedWhitelistCandidate,
  WhitelistCandidateList,
  WhitelistCandidateSummary,
} from "shared";
import {
  WHITELIST_CANDIDATE_QUERY_LIMIT,
  dismissExpiresAt,
  isActiveDismissal,
  partitionCandidatesForServer,
  pendingCountsByServer,
} from "shared";
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

const dismissCandidateSchema = z.object({
  server: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const restoreCandidateSchema = z.object({
  server: z.string().min(1),
});

type UserWithGrantingRoles = {
  id: string;
  discordName: string;
  displayName: string | null;
  steamId: string | null;
  avatarUrl: string | null;
  membershipDate: Date | null;
  roles: { role: { name: string; grantsWhitelist: boolean } }[];
};

function grantingRoleNames(user: UserWithGrantingRoles): string[] {
  return user.roles.filter((r) => r.role.grantsWhitelist).map((r) => r.role.name);
}

function toCandidate(user: UserWithGrantingRoles & { steamId: string }): WhitelistCandidate {
  const roleNames = grantingRoleNames(user);
  return {
    userId: user.id,
    discordName: user.discordName,
    displayName: user.displayName,
    steamId: user.steamId,
    avatarUrl: user.avatarUrl,
    roleName: roleNames[0] || "",
    roleNames,
    membershipDate: user.membershipDate?.toISOString() ?? null,
  };
}

async function loadEligibleUsers() {
  const users = await prisma.user.findMany({
    where: {
      disabled: false,
      steamId: { not: null },
      roles: { some: { role: { grantsWhitelist: true } } },
    },
    include: { roles: { include: { role: true } } },
    take: WHITELIST_CANDIDATE_QUERY_LIMIT,
  });
  return users.filter((u): u is typeof u & { steamId: string } => !!u.steamId);
}

async function loadActiveEntries(server?: string) {
  const now = new Date();
  return prisma.whitelistEntry.findMany({
    where: {
      ...(server ? { server } : {}),
      deactivatedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { steamId: true, server: true },
  });
}

async function loadActiveDismissals(now: Date, server?: string) {
  return prisma.whitelistRequestDismissal.findMany({
    where: {
      ...(server ? { server } : {}),
      restoredAt: null,
      expiresAt: { gt: now },
    },
  });
}

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
  const started = performance.now();
  const now = new Date();

  const [users, activeEntries, dismissalRows] = await Promise.all([
    loadEligibleUsers(),
    loadActiveEntries(server),
    loadActiveDismissals(now, server),
  ]);

  const truncated = users.length >= WHITELIST_CANDIDATE_QUERY_LIMIT;
  const eligible = users.map((u) => ({ userId: u.id, steamId: u.steamId, user: u }));
  const part = partitionCandidatesForServer(
    eligible,
    server,
    activeEntries,
    dismissalRows.map((d) => ({ userId: d.userId, server: d.server })),
  );

  const dismissalByUser = new Map(dismissalRows.map((d) => [d.userId, d]));
  const byName = (a: WhitelistCandidate, b: WhitelistCandidate) =>
    a.discordName.localeCompare(b.discordName, undefined, { sensitivity: "base" });

  const pending = part.pending.map((e) => toCandidate(e.user)).sort(byName);
  const dismissed: DismissedWhitelistCandidate[] = part.dismissed
    .map((e) => {
      const d = dismissalByUser.get(e.userId);
      if (!d) return null;
      return {
        ...toCandidate(e.user),
        dismissedAt: d.dismissedAt.toISOString(),
        dismissedBy: d.dismissedBy,
        dismissedByName: d.dismissedByName,
        expiresAt: d.expiresAt.toISOString(),
        reason: d.reason,
      };
    })
    .filter((row): row is DismissedWhitelistCandidate => row !== null)
    .sort((a, b) => b.dismissedAt.localeCompare(a.dismissedAt));

  const result: WhitelistCandidateList = {
    pending,
    dismissed,
    meta: {
      server,
      pendingCount: pending.length,
      dismissedCount: dismissed.length,
      eligibleCount: users.length,
      alreadyWhitelistedCount: part.alreadyWhitelisted.length,
      truncated,
    },
  };

  const duration_ms = Math.round((performance.now() - started) * 10) / 10;
  logger.info("whitelist.candidates", "Listed whitelist candidates", {
    server,
    pendingCount: result.meta.pendingCount,
    dismissedCount: result.meta.dismissedCount,
    eligibleCount: result.meta.eligibleCount,
    alreadyWhitelistedCount: result.meta.alreadyWhitelistedCount,
    truncated,
    duration_ms,
  });
  if (truncated) {
    logger.warn("whitelist.candidates", "Eligible user query hit cap; candidate list may be incomplete", {
      server,
      limit: WHITELIST_CANDIDATE_QUERY_LIMIT,
    });
  }

  return success(c, result);
});

whitelist.get("/candidates/summary", requirePermission("manage:whitelist"), async (c) => {
  const started = performance.now();
  const now = new Date();

  const configs = await prisma.serverConfig.findMany({ select: { server: true } });
  const servers = configs.length > 0 ? configs.map((s) => s.server) : ["main"];

  const [users, activeEntries, dismissalRows] = await Promise.all([
    loadEligibleUsers(),
    loadActiveEntries(),
    loadActiveDismissals(now),
  ]);

  const byServer = pendingCountsByServer(
    users.map((u) => ({ userId: u.id, steamId: u.steamId })),
    servers,
    activeEntries,
    dismissalRows.map((d) => ({ userId: d.userId, server: d.server })),
  );
  const totalPending = byServer.reduce((sum, s) => sum + s.pending, 0);
  const truncated = users.length >= WHITELIST_CANDIDATE_QUERY_LIMIT;

  logger.info("whitelist.candidates", "Summarized whitelist candidates", {
    totalPending,
    byServer,
    eligibleCount: users.length,
    truncated,
    duration_ms: Math.round((performance.now() - started) * 10) / 10,
  });
  if (truncated) {
    logger.warn("whitelist.candidates", "Eligible user query hit cap; summary may be incomplete", {
      limit: WHITELIST_CANDIDATE_QUERY_LIMIT,
    });
  }

  const result: WhitelistCandidateSummary = { totalPending, byServer };
  return success(c, result);
});

whitelist.post(
  "/candidates/:userId/dismiss",
  requirePermission("manage:whitelist"),
  rateLimit(30),
  validate("json", dismissCandidateSchema),
  async (c) => {
    const targetUserId = c.req.param("userId");
    const actorId = c.get("userId");
    const { server, reason } = c.req.valid("json");
    const now = new Date();

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, discordName: true, steamId: true },
    });
    if (!target) return fail(c, "User not found", 404);
    if (!target.steamId) return fail(c, "User has no linked Steam ID", 400);

    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { discordName: true },
    });
    const dismissedByName = actor?.discordName ?? "Unknown";
    const expiresAt = dismissExpiresAt(now);

    const row = await prisma.whitelistRequestDismissal.upsert({
      where: { userId_server: { userId: targetUserId, server } },
      create: {
        userId: targetUserId,
        server,
        dismissedBy: actorId,
        dismissedByName,
        reason: reason ?? null,
        dismissedAt: now,
        expiresAt,
        restoredAt: null,
      },
      update: {
        dismissedBy: actorId,
        dismissedByName,
        reason: reason ?? null,
        dismissedAt: now,
        expiresAt,
        restoredAt: null,
      },
    });

    audit(c, "whitelist.request.dismiss", "WhitelistRequestDismissal", row.id, {
      name: target.discordName,
      steamId: target.steamId,
      server,
      expiresAt: expiresAt.toISOString(),
      reason: reason ?? null,
      userId: targetUserId,
    });
    logger.info("whitelist.candidates", "Dismissed whitelist request", {
      targetUserId,
      steamId: target.steamId,
      discordName: target.discordName,
      server,
      expiresAt: expiresAt.toISOString(),
      reason: reason ?? null,
      actorId,
    });

    return success(c, {
      id: row.id,
      userId: targetUserId,
      server,
      dismissedAt: row.dismissedAt.toISOString(),
      dismissedBy: row.dismissedBy,
      dismissedByName: row.dismissedByName,
      expiresAt: row.expiresAt.toISOString(),
      reason: row.reason,
    }, 201);
  },
);

whitelist.post(
  "/candidates/:userId/restore",
  requirePermission("manage:whitelist"),
  rateLimit(30),
  validate("json", restoreCandidateSchema),
  async (c) => {
    const targetUserId = c.req.param("userId");
    const { server } = c.req.valid("json");
    const now = new Date();

    const existing = await prisma.whitelistRequestDismissal.findUnique({
      where: { userId_server: { userId: targetUserId, server } },
    });
    if (!existing || !isActiveDismissal(existing, now)) {
      return fail(c, "No active dismissal found", 404);
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { discordName: true, steamId: true },
    });

    await prisma.whitelistRequestDismissal.update({
      where: { id: existing.id },
      data: { restoredAt: now },
    });

    audit(c, "whitelist.request.restore", "WhitelistRequestDismissal", existing.id, {
      name: target?.discordName ?? null,
      steamId: target?.steamId ?? null,
      server,
      userId: targetUserId,
    });
    logger.info("whitelist.candidates", "Restored dismissed whitelist request", {
      targetUserId,
      steamId: target?.steamId ?? null,
      discordName: target?.discordName ?? null,
      server,
    });

    return success(c, { restored: true, userId: targetUserId, server });
  },
);

// ── Add entry (with duplicate warning) ───────────────────────

whitelist.post("/", requirePermission("manage:whitelist"), rateLimit(30), validate("json", addEntrySchema), async (c) => {
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
    audit(c, "whitelist.add", "WhitelistEntry", entry.id, {
      steamId,
      server,
      name,
      role,
      clan: entry.clan,
      groupId: entry.groupId,
      reason: entry.reason,
      expiresAt: entry.expiresAt?.toISOString() ?? null,
    });

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

whitelist.post("/bulk", requirePermission("manage:whitelist"), rateLimit(5), validate("json", bulkAddSchema), async (c) => {
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
  audit(c, "whitelist.bulk_add", "WhitelistEntry", null, {
    server,
    created: result.created,
    skipped: result.skipped.length,
    total: entries.length,
    names: entries.map((e) => e.name).filter((n): n is string => !!n),
    steamIds: entries.map((e) => e.steamId),
  });

  return success(c, { created: result.created, skipped: result.skipped }, 201);
  } catch (err) {
    logger.error("whitelist", "Failed to bulk add whitelist entries", { server, err });
    return fail(c, "Failed to bulk add whitelist entries.", 500);
  }
});

// ── Bulk update ──────────────────────────────────────────────

whitelist.post("/bulk-update", requirePermission("manage:whitelist"), rateLimit(10), validate("json", bulkUpdateSchema), async (c) => {
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

    const targets = await prisma.whitelistEntry.findMany({
      where: { id: { in: ids } },
      select: { name: true, steamId: true },
    });
    audit(c, "whitelist.bulk_update", "WhitelistEntry", null, {
      count: result.count,
      changes: data,
      names: targets.map((e) => e.name).filter((n): n is string => !!n),
      steamIds: targets.map((e) => e.steamId),
    });

    return success(c, { updated: result.count });
  } catch (err) {
    logger.error("whitelist", "Failed to bulk update whitelist entries", { err });
    return fail(c, "Failed to bulk update whitelist entries.", 500);
  }
});

// ── Bulk delete ──────────────────────────────────────────────

whitelist.post("/bulk-delete", requirePermission("manage:whitelist"), rateLimit(10), validate("json", bulkDeleteSchema), async (c) => {
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
      names: entries.map((e) => e.name).filter((n): n is string => !!n),
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

whitelist.patch("/:id", requirePermission("manage:whitelist"), validate("json", updateEntrySchema), async (c) => {
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
    audit(c, "whitelist.update", "WhitelistEntry", id, { steamId: existing.steamId, name: existing.name, changes });

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

whitelist.post("/:id/comments", requirePermission("manage:whitelist"), validate("json", addCommentSchema), async (c) => {
  const entryId = c.req.param("id");
  const authorId = c.get("userId") as string;
  const { text } = c.req.valid("json");

  const existing = await findOrThrow(prisma.whitelistEntry, { id: entryId }, "Whitelist entry");

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
    steamId: existing.steamId,
    name: existing.name,
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

  const existing = await findOrThrow(prisma.whitelistEntry, { id: entryId }, "Whitelist entry");
  await prisma.whitelistComment.delete({ where: { id: commentId } });
  audit(c, "whitelist.comment.delete", "WhitelistEntry", entryId, {
    commentId,
    steamId: existing.steamId,
    name: existing.name,
  });

  return c.body(null, 204);
});

export default whitelist;

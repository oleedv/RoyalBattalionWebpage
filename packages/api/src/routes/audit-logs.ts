import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import type { AuditLogEntry } from "shared";
import prisma from "../lib/db";
import { success, fail } from "../lib/crud-helpers";
import { parsePageParams, paginate } from "../lib/pagination";
import { audit } from "../lib/audit";
import { fillMissingWhitelistTarget } from "../lib/whitelist-audit-enrich";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const auditLogs = new Hono();

auditLogs.use("*", authMiddleware, requirePermission("view:audit-logs"));

auditLogs.get("/", async (c) => {
  const { page, limit, skip } = parsePageParams(c);
  const action = c.req.query("action") || undefined;
  const resource = c.req.query("resource") || undefined;
  const userId = c.req.query("userId") || undefined;
  const resourceId = c.req.query("resourceId") || undefined;
  const from = c.req.query("from") || undefined;
  const to = c.req.query("to") || undefined;

  const where: Record<string, unknown> = {};

  if (action) {
    where.action = { startsWith: action };
  }
  if (resource) {
    where.resource = resource;
  }
  if (userId) {
    where.userId = userId;
  }
  if (resourceId) {
    where.resourceId = resourceId;
  }
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = new Date(from);
    if (to) createdAt.lte = new Date(to);
    where.createdAt = createdAt;
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const whitelistIds = [...new Set(
    items
      .filter((row) => row.resource === "WhitelistEntry" && row.resourceId)
      .map((row) => row.resourceId as string),
  )];
  const whitelistRows = whitelistIds.length
    ? await prisma.whitelistEntry.findMany({
        where: { id: { in: whitelistIds } },
        select: { id: true, steamId: true, name: true },
      })
    : [];
  const whitelistById = new Map(whitelistRows.map((e) => [e.id, e]));

  const entries: AuditLogEntry[] = items.map((row) => {
    const stored = row.detail as Record<string, unknown> | null;
    const target = row.resource === "WhitelistEntry" && row.resourceId
      ? whitelistById.get(row.resourceId)
      : undefined;
    return {
      id: row.id,
      userId: row.userId,
      userName: row.userName,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId,
      detail: fillMissingWhitelistTarget(stored, target),
      createdAt: row.createdAt.toISOString(),
    };
  });

  return success(c, paginate(entries, total, page, limit));
});

// --- Developer-only deletion ---

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
});

auditLogs.post("/bulk-delete", requirePermission("developer"), validate("json", bulkDeleteSchema), async (c) => {
  const { ids } = c.req.valid("json");
  const result = await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
  await audit(c, "audit-log.bulk-delete", "audit_log", null, { ids, count: result.count });
  return success(c, { deleted: result.count });
});

auditLogs.delete("/:id", requirePermission("developer"), async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.auditLog.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail(c, "Audit log entry not found", 404);
  await prisma.auditLog.delete({ where: { id } });
  await audit(c, "audit-log.delete", "audit_log", id, { deletedId: id });
  return c.body(null, 204);
});

export default auditLogs;

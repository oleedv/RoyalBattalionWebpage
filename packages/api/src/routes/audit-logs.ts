import { Hono } from "hono";
import type { ApiResponse, AuditLogEntry, Paginated } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const auditLogs = new Hono();

auditLogs.use("*", authMiddleware, requirePermission("view:audit-logs"));

auditLogs.get("/", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") || "1"));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));
  const action = c.req.query("action") || undefined;
  const resource = c.req.query("resource") || undefined;
  const userId = c.req.query("userId") || undefined;
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
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const entries: AuditLogEntry[] = items.map((row) => ({
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    detail: row.detail as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  }));

  return c.json<ApiResponse<Paginated<AuditLogEntry>>>({
    success: true,
    data: { items: entries, total },
  });
});

export default auditLogs;

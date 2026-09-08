import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { success, fail } from "../lib/crud-helpers";
import { generateApiToken, TOKEN_SCOPE_SERVER_STATUS } from "../lib/api-token";
import { audit } from "../lib/audit";
import type { Permission } from "shared";

const apiTokens = new Hono<{ Variables: { userId: string; permissions: Permission[] } }>();

apiTokens.use("*", authMiddleware, requirePermission("manage:api-tokens"));

function tokenStatus(row: { revokedAt: Date | null; expiresAt: Date | null }): "live" | "expired" | "revoked" {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return "expired";
  return "live";
}

function serializeToken(row: {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: string;
  userId: string | null;
  user: { id: string; discordName: string; displayName: string | null } | null;
  createdById: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  requestCount: number;
  createdAt: Date;
  usage?: Array<{ date: Date; okCount: number; errorCount: number; rateLimitedCount: number }>;
}) {
  const usage = (row.usage ?? []).map((u) => ({
    date: u.date.toISOString().slice(0, 10),
    okCount: u.okCount,
    errorCount: u.errorCount,
    rateLimitedCount: u.rateLimitedCount,
  }));
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scope: row.scope,
    userId: row.userId,
    user: row.user
      ? {
          id: row.user.id,
          discordName: row.user.discordName,
          displayName: row.user.displayName,
        }
      : null,
    createdById: row.createdById,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    requestCount: row.requestCount,
    createdAt: row.createdAt.toISOString(),
    status: tokenStatus(row),
    usage,
  };
}

const includeUser = {
  user: { select: { id: true, discordName: true, displayName: true } },
} as const;

apiTokens.get("/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return success(c, []);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { discordName: { contains: q } },
        { displayName: { contains: q } },
        { discordId: { contains: q } },
      ],
    },
    select: { id: true, discordName: true, displayName: true, discordId: true },
    take: 20,
    orderBy: { discordName: "asc" },
  });
  return success(c, users);
});

apiTokens.get("/", async (c) => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.apiToken.findMany({
    include: {
      ...includeUser,
      usage: { where: { date: { gte: since } }, orderBy: { date: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return success(c, rows.map(serializeToken));
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  userId: z.string().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

apiTokens.post("/", validate("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const createdById = c.get("userId") as string;

  if (body.userId) {
    const linked = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
    if (!linked) return fail(c, "User not found", 400);
  }

  const { secret, prefix, hash } = generateApiToken();
  const row = await prisma.apiToken.create({
    data: {
      name: body.name,
      tokenPrefix: prefix,
      tokenHash: hash,
      scope: TOKEN_SCOPE_SERVER_STATUS,
      userId: body.userId || null,
      createdById,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
    include: includeUser,
  });

  await audit(c, "api_token.create", "ApiToken", row.id, {
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    userId: row.userId,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  });

  return success(c, { ...serializeToken(row), secret }, 201);
});

apiTokens.get("/:id", async (c) => {
  const id = c.req.param("id");
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  since.setUTCHours(0, 0, 0, 0);
  const row = await prisma.apiToken.findUnique({
    where: { id },
    include: {
      ...includeUser,
      usage: { where: { date: { gte: since } }, orderBy: { date: "asc" } },
    },
  });
  if (!row) return fail(c, "Token not found", 404);
  return success(c, serializeToken(row));
});

apiTokens.post("/:id/revoke", async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.apiToken.findUnique({ where: { id } });
  if (!existing) return fail(c, "Token not found", 404);
  if (existing.revokedAt) return fail(c, "Token already revoked", 400);

  const row = await prisma.apiToken.update({
    where: { id },
    data: { revokedAt: new Date(), revokedById: c.get("userId") as string },
    include: includeUser,
  });

  await audit(c, "api_token.revoke", "ApiToken", row.id, {
    name: row.name,
    tokenPrefix: row.tokenPrefix,
  });

  return success(c, serializeToken(row));
});

export default apiTokens;

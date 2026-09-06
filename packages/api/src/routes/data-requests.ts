import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import type { DataDeletionRequest, DataDeletionRequestSummary } from "shared";
import prisma from "../lib/db";
import { success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { audit } from "../lib/audit";
import { rateLimit } from "../middleware/rate-limit";
import { logger } from "../lib/logger";

const dataRequests = new Hono();

function toRequest(row: {
  id: string;
  userId: string | null;
  discordId: string;
  discordName: string;
  displayName: string | null;
  steamId: string | null;
  status: string;
  handledAt: Date | null;
  handledBy: string | null;
  createdAt: Date;
}): DataDeletionRequest {
  return {
    id: row.id,
    userId: row.userId,
    discordId: row.discordId,
    discordName: row.discordName,
    displayName: row.displayName,
    steamId: row.steamId,
    status: row.status === "handled" ? "handled" : "pending",
    handledAt: row.handledAt?.toISOString() ?? null,
    handledBy: row.handledBy,
    createdAt: row.createdAt.toISOString(),
  };
}

dataRequests.get("/me", authMiddleware, rateLimit(20), async (c) => {
  const userId = c.get("userId");
  const row = await prisma.dataDeletionRequest.findFirst({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return success(c, { request: row ? toRequest(row) : null });
});

dataRequests.post("/", authMiddleware, rateLimit(5), async (c) => {
  const userId = c.get("userId");

  const existing = await prisma.dataDeletionRequest.findFirst({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return success(c, toRequest(existing));
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      discordId: true,
      discordName: true,
      displayName: true,
      steamId: true,
    },
  });
  if (!user) {
    return fail(c, "User not found.", 404);
  }

  try {
    const row = await prisma.dataDeletionRequest.create({
      data: {
        userId,
        discordId: user.discordId,
        discordName: user.discordName,
        displayName: user.displayName,
        steamId: user.steamId,
      },
    });
    await audit(c, "data_request.create", "data_request", row.id, {
      discordId: user.discordId,
      discordName: user.discordName,
    });
    return success(c, toRequest(row), 201);
  } catch (err) {
    logger.error("data-requests", "Failed to create deletion request", { userId, err });
    return fail(c, "Failed to create deletion request.", 500);
  }
});

dataRequests.get("/summary", authMiddleware, requirePermission("developer"), async (c) => {
  const pending = await prisma.dataDeletionRequest.count({
    where: { status: "pending" },
  });
  return success(c, { pending } satisfies DataDeletionRequestSummary);
});

dataRequests.get("/", authMiddleware, requirePermission("developer"), async (c) => {
  const rows = await prisma.dataDeletionRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const mapped = rows.map(toRequest);
  mapped.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return success(c, mapped);
});

const handleSchema = z.object({
  status: z.literal("handled"),
});

dataRequests.patch("/:id", authMiddleware, requirePermission("developer"), validate("json", handleSchema), async (c) => {
  const id = c.req.param("id");
  const handlerId = c.get("userId");

  const existing = await prisma.dataDeletionRequest.findUnique({ where: { id } });
  if (!existing) {
    return fail(c, "Request not found.", 404);
  }

  try {
    const row = await prisma.dataDeletionRequest.update({
      where: { id },
      data: {
        status: "handled",
        handledAt: new Date(),
        handledBy: handlerId,
      },
    });
    await audit(c, "data_request.handle", "data_request", id, {
      discordId: existing.discordId,
      discordName: existing.discordName,
    });
    return success(c, toRequest(row));
  } catch (err) {
    logger.error("data-requests", "Failed to handle deletion request", { id, err });
    return fail(c, "Failed to update deletion request.", 500);
  }
});

export default dataRequests;

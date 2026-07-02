import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Match } from "shared";
import prisma from "../lib/db";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { parsePageParams, paginate } from "../lib/pagination";
import { resyncAllMatches } from "../lib/match-sync";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";

const matches = new Hono();

// Public route (no auth) - must be registered before the wildcard auth middleware
matches.get("/public", async (c) => {
  const { page, limit, skip } = parsePageParams(c);

  const [entries, total] = await Promise.all([
    prisma.match.findMany({
      where: { hidden: false },
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.match.count({ where: { hidden: false } }),
  ]);

  return success(c, paginate(entries.map(toMatch), total, page, limit));
});

// All remaining routes require user auth
matches.use("*", authMiddleware);

const updateMatchSchema = z.object({
  date: z.string().optional(),
  map: z.string().optional(),
  layer: z.string().optional(),
  result: z.string().optional(),
  server: z.string().optional(),
  vodUrl: z.string().nullable().optional(),
  hidden: z.boolean().optional(),
});

function toMatch(e: {
  id: string;
  date: Date;
  map: string;
  layer: string;
  result: string;
  server: string;
  vodUrl: string | null;
  hidden: boolean;
  matchDetail?: any;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): Match {
  return {
    id: e.id,
    date: e.date.toISOString(),
    map: e.map,
    layer: e.layer,
    result: e.result,
    server: e.server,
    vodUrl: e.vodUrl,
    hidden: e.hidden,
    matchDetail: e.matchDetail ?? null,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

matches.get("/", requirePermission("manage:matches"), async (c) => {
  const { page, limit, skip } = parsePageParams(c);

  const [entries, total] = await Promise.all([
    prisma.match.findMany({
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.match.count(),
  ]);

  return success(c, paginate(entries.map(toMatch), total, page, limit));
});

matches.patch("/:id", requirePermission("manage:matches"), zValidator("json", updateMatchSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  await findOrThrow(prisma.match, { id }, "Match");

  try {
    const entry = await prisma.match.update({
      where: { id },
      data: {
        ...(body.date !== undefined && { date: new Date(body.date) }),
        ...(body.map !== undefined && { map: body.map }),
        ...(body.layer !== undefined && { layer: body.layer }),
        ...(body.result !== undefined && { result: body.result }),
        ...(body.server !== undefined && { server: body.server }),
        ...(body.vodUrl !== undefined && { vodUrl: body.vodUrl }),
        ...(body.hidden !== undefined && { hidden: body.hidden }),
      },
    });

    await audit(c, "match.update", "match", id, { changes: body });
    return success(c, toMatch(entry));
  } catch (err) {
    logger.error("matches", "Failed to update match", { id, err });
    return fail(c, "Failed to update match", 500);
  }
});

matches.post("/resync", requirePermission("manage:matches"), async (c) => {
  try {
    const result = await resyncAllMatches();
    await audit(c, "match.resync", "match");
    return success(c, result);
  } catch (err) {
    logger.error("matches", "Failed to resync matches", { err });
    return fail(c, "Failed to resync matches", 500);
  }
});

matches.delete("/:id", requirePermission("manage:matches"), async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.match, { id }, "Match");

  await prisma.match.delete({ where: { id } });
  await audit(c, "match.delete", "match", id, { map: existing.map, layer: existing.layer });

  return c.body(null, 204);
});

export default matches;

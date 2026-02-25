import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Match } from "shared";
import prisma from "../lib/db";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { resyncAllMatches } from "../lib/match-sync";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { audit } from "../lib/audit";

const matches = new Hono();

// Public route (no auth) - must be registered before the wildcard auth middleware
matches.get("/public", async (c) => {
  const entries = await prisma.match.findMany({
    where: { hidden: false },
    orderBy: { date: "desc" },
    take: 10,
  });

  const result: Match[] = entries.map(toMatch);

  return success(c, result);
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
  const entries = await prisma.match.findMany({
    orderBy: { date: "desc" },
  });

  return success(c, entries.map(toMatch));
});

matches.put("/:id", requirePermission("manage:matches"), zValidator("json", updateMatchSchema), async (c) => {
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
  } catch {
    return fail(c, "Failed to update match");
  }
});

matches.post("/resync", requirePermission("manage:matches"), async (c) => {
  try {
    const result = await resyncAllMatches();
    await audit(c, "match.resync", "match");
    return success(c, result);
  } catch (err) {
    return fail(c, err instanceof Error ? err.message : "Resync failed", 500);
  }
});

matches.delete("/:id", requirePermission("manage:matches"), async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.match, { id }, "Match");

  await prisma.match.delete({ where: { id } });
  await audit(c, "match.delete", "match", id, { map: existing.map, layer: existing.layer });

  return success(c, { deleted: true as const });
});

export default matches;

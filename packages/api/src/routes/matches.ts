import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, Match } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const matches = new Hono();

// Public route (no auth) - must be registered before the wildcard auth middleware
matches.get("/public", async (c) => {
  const entries = await prisma.match.findMany({
    where: { hidden: false },
    orderBy: { date: "desc" },
  });

  const result: Match[] = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString(),
    map: e.map,
    layer: e.layer,
    result: e.result,
    vodUrl: e.vodUrl,
    hidden: e.hidden,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }));

  return c.json<ApiResponse<Match[]>>({ success: true, data: result });
});

// All remaining routes require auth
matches.use("*", authMiddleware);

const createMatchSchema = z.object({
  date: z.string().min(1),
  map: z.string().min(1),
  layer: z.string().min(1),
  result: z.string().min(1),
  vodUrl: z.string().optional(),
  hidden: z.boolean().optional(),
});

const updateMatchSchema = z.object({
  date: z.string().optional(),
  map: z.string().optional(),
  layer: z.string().optional(),
  result: z.string().optional(),
  vodUrl: z.string().nullable().optional(),
  hidden: z.boolean().optional(),
});

function toMatch(e: {
  id: string;
  date: Date;
  map: string;
  layer: string;
  result: string;
  vodUrl: string | null;
  hidden: boolean;
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
    vodUrl: e.vodUrl,
    hidden: e.hidden,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

matches.get("/", requirePermission("manage:matches"), async (c) => {
  const entries = await prisma.match.findMany({
    orderBy: { date: "desc" },
  });

  return c.json<ApiResponse<Match[]>>({ success: true, data: entries.map(toMatch) });
});

matches.post("/", requirePermission("manage:matches"), zValidator("json", createMatchSchema), async (c) => {
  const userId = c.get("userId");
  const { date, map, layer, result, vodUrl, hidden } = c.req.valid("json");

  try {
    const entry = await prisma.match.create({
      data: {
        date: new Date(date),
        map,
        layer,
        result,
        vodUrl: vodUrl ?? null,
        hidden: hidden ?? false,
        createdBy: userId,
      },
    });

    return c.json<ApiResponse<Match>>({ success: true, data: toMatch(entry) }, 201);
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to create match",
    }, 400);
  }
});

matches.put("/:id", requirePermission("manage:matches"), zValidator("json", updateMatchSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await prisma.match.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Match not found" }, 404);
  }

  try {
    const entry = await prisma.match.update({
      where: { id },
      data: {
        ...(body.date !== undefined && { date: new Date(body.date) }),
        ...(body.map !== undefined && { map: body.map }),
        ...(body.layer !== undefined && { layer: body.layer }),
        ...(body.result !== undefined && { result: body.result }),
        ...(body.vodUrl !== undefined && { vodUrl: body.vodUrl }),
        ...(body.hidden !== undefined && { hidden: body.hidden }),
      },
    });

    return c.json<ApiResponse<Match>>({ success: true, data: toMatch(entry) });
  } catch {
    return c.json<ApiResponse<never>>({
      success: false,
      error: "Failed to update match",
    }, 400);
  }
});

matches.delete("/:id", requirePermission("manage:matches"), async (c) => {
  const id = c.req.param("id");

  const existing = await prisma.match.findUnique({ where: { id } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Match not found" }, 404);
  }

  await prisma.match.delete({ where: { id } });

  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default matches;

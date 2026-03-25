import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { Prisma } from "../../generated/prisma/client";
import type { TicketTimeout } from "shared";
import getSecretaryDb, { resetSecretaryDb } from "../../lib/secretary-db";
import { requirePermission } from "../../middleware/permissions";
import { audit } from "../../lib/audit";
import { success, fail } from "../../lib/crud-helpers";
import { logger } from "../../lib/logger";

const timeouts = new Hono();

const timeoutSchema = z.object({
  userId: z.string().min(1).max(20),
  hours: z.number().int().min(1).max(8760),
});

// GET /timeouts
timeouts.get(
  "/timeouts",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
        SELECT id, user_id, timed_out_by, expires_at, created_at
         FROM ticket_timeouts
         WHERE expires_at > NOW()
         ORDER BY expires_at ASC`
      );

      const data: TicketTimeout[] = rows.map((r) => ({
        id: Number(r.id),
        userId: r.user_id,
        timedOutBy: r.timed_out_by,
        expiresAt: new Date(r.expires_at).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
      }));

      return success(c, data);
    } catch (err: any) {
      resetSecretaryDb();
      logger.error("discord-bot", "Timeouts endpoint error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

// POST /timeouts
timeouts.post(
  "/timeouts",
  requirePermission("manage:discord-bot"),
  zValidator("json", timeoutSchema),
  async (c) => {
    try {
      const { userId, hours } = c.req.valid("json");
      const actorId = c.get("userId") as string;
      const db = getSecretaryDb();

      await db.$queryRaw(Prisma.sql`
        INSERT INTO ticket_timeouts (user_id, timed_out_by, expires_at)
         VALUES (${userId}, ${actorId}, DATE_ADD(NOW(), INTERVAL ${hours} HOUR))`
      );

      await audit(c, "discord_bot.create_ticket_timeout", "ticket_timeout", undefined, { userId, hours });
      return success(c, { created: true as const });
    } catch (err: any) {
      resetSecretaryDb();
      logger.error("discord-bot", "Create timeout error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

// POST /timeouts/:id/expire
timeouts.post(
  "/timeouts/:id/expire",
  requirePermission("manage:discord-bot"),
  async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const db = getSecretaryDb();

      await db.$queryRaw(Prisma.sql`
        UPDATE ticket_timeouts SET expires_at = NOW() WHERE id = ${id}`
      );

      await audit(c, "discord_bot.expire_ticket_timeout", "ticket_timeout", String(id));
      return success(c, { updated: true as const });
    } catch (err: any) {
      resetSecretaryDb();
      logger.error("discord-bot", "Expire timeout error", err);
      return fail(c, "Secretary database unavailable", 503);
    }
  }
);

export default timeouts;

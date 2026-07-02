import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { Prisma } from "../../generated/prisma/client";
import type { TicketTimeout } from "shared";
import getSecretaryDb, { resetSecretaryDb } from "../../lib/secretary-db";
import { requirePermission } from "../../middleware/permissions";
import { audit } from "../../lib/audit";
import { success, fail } from "../../lib/crud-helpers";
import { logger } from "../../lib/logger";

const timeouts = new Hono();

/** Defensive server-side cap for the bare-array list. */
const TIMEOUTS_CAP = 500;

const timeoutSchema = z.object({
  userId: z.string().min(1).max(20),
  hours: z.number().int().min(1).max(8760),
});

function mapTimeout(r: any): TicketTimeout {
  return {
    id: Number(r.id),
    userId: r.user_id,
    timedOutBy: r.timed_out_by,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

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
         ORDER BY expires_at ASC
         LIMIT ${TIMEOUTS_CAP}`
      );

      const data: TicketTimeout[] = rows.map(mapTimeout);
      return success(c, data);
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Timeouts endpoint error", err);
      return fail(c, "Failed to fetch ticket timeouts", 500);
    }
  }
);

// POST /timeouts
timeouts.post(
  "/timeouts",
  requirePermission("manage:discord-bot"),
  validate("json", timeoutSchema),
  async (c) => {
    try {
      const { userId, hours } = c.req.valid("json");
      const actorId = c.get("userId") as string;
      const db = getSecretaryDb();

      // Insert + read-back on a single pinned connection so LAST_INSERT_ID() is
      // reliable across the pool, letting us return the created row.
      const created = await db.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          INSERT INTO ticket_timeouts (user_id, timed_out_by, expires_at)
           VALUES (${userId}, ${actorId}, DATE_ADD(NOW(), INTERVAL ${hours} HOUR))`
        );
        const rows: any[] = await tx.$queryRaw(Prisma.sql`
          SELECT id, user_id, timed_out_by, expires_at, created_at
           FROM ticket_timeouts WHERE id = LAST_INSERT_ID()`
        );
        return rows[0] ?? null;
      });

      const timeout = created ? mapTimeout(created) : null;

      await audit(
        c,
        "discord_bot.create_ticket_timeout",
        "ticket_timeout",
        timeout ? String(timeout.id) : undefined,
        { userId, hours }
      );

      return success(c, timeout, 201);
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Create timeout error", err);
      return fail(c, "Failed to create ticket timeout", 500);
    }
  }
);

// DELETE /timeouts/:id — end the active timeout (expire it now)
timeouts.delete(
  "/timeouts/:id",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return fail(c, "Invalid timeout id", 400);
    }

    try {
      const db = getSecretaryDb();

      // Only an active (not-yet-expired) timeout can be ended; scoping the UPDATE
      // by expires_at > NOW() lets a 0-row result signal a genuine 404.
      const affected = await db.$executeRaw(Prisma.sql`
        UPDATE ticket_timeouts SET expires_at = NOW()
         WHERE id = ${id} AND expires_at > NOW()`
      );

      if (affected === 0) {
        return fail(c, "Active timeout not found", 404);
      }

      await audit(c, "discord_bot.expire_ticket_timeout", "ticket_timeout", String(id));
      return c.body(null, 204);
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Expire timeout error", err);
      return fail(c, "Failed to end ticket timeout", 500);
    }
  }
);

export default timeouts;

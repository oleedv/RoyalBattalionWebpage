import { Hono } from "hono";
import { Prisma } from "../../generated/prisma/client";
import getSecretaryDb from "../../lib/secretary-db";
import { requirePermission } from "../../middleware/permissions";
import { audit } from "../../lib/audit";
import { success, fail } from "../../lib/crud-helpers";

const ticketActions = new Hono();

// Helper to queue an action for the bot to process
async function queueAction(
  actionType: string,
  targetType: string,
  targetId: number,
  actorId: string,
  payload: Record<string, unknown> = {}
) {
  const db = getSecretaryDb();
  await db.$queryRaw(Prisma.sql`
    INSERT INTO pending_actions (action_type, target_type, target_id, payload, actor_id)
    VALUES (${actionType}, ${targetType}, ${targetId}, ${JSON.stringify(payload)}, ${actorId})`
  );
}

// POST /ticket-actions/:id/close
ticketActions.post(
  "/ticket-actions/:id/close",
  requirePermission("manage:tickets"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const db = getSecretaryDb();

    // Validate ticket exists and is open
    const rows: any[] = await db.$queryRaw(Prisma.sql`
      SELECT id, status FROM tickets WHERE id = ${id}`);
    if (rows.length === 0) return fail(c, "Ticket not found", 404);
    if (rows[0].status !== "open") return fail(c, "Ticket is not open");

    await queueAction("close_ticket", "ticket", id, userId);
    await audit(c, "ticket.close_queued", "ticket", String(id));
    return success(c, { queued: true as const });
  }
);

// POST /ticket-actions/:id/escalate
ticketActions.post(
  "/ticket-actions/:id/escalate",
  requirePermission("manage:tickets"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const { tier } = await c.req.json<{ tier: string }>();

    const validTiers = ["community_officer", "admin_officer", "comp_team", "whitelist"];
    if (!validTiers.includes(tier)) {
      return fail(c, `Invalid tier. Must be one of: ${validTiers.join(", ")}`);
    }

    const db = getSecretaryDb();
    const rows: any[] = await db.$queryRaw(Prisma.sql`
      SELECT id, status, tier FROM tickets WHERE id = ${id}`);
    if (rows.length === 0) return fail(c, "Ticket not found", 404);
    if (rows[0].status !== "open") return fail(c, "Ticket is not open");

    await queueAction("escalate_ticket", "ticket", id, userId, { tier });
    await audit(c, "ticket.escalate_queued", "ticket", String(id), { tier });
    return success(c, { queued: true as const });
  }
);

// POST /ticket-actions/:id/reopen
ticketActions.post(
  "/ticket-actions/:id/reopen",
  requirePermission("manage:tickets"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const db = getSecretaryDb();

    const rows: any[] = await db.$queryRaw(Prisma.sql`
      SELECT id, status FROM tickets WHERE id = ${id}`);
    if (rows.length === 0) return fail(c, "Ticket not found", 404);
    if (rows[0].status !== "closing") return fail(c, "Ticket is not in closing state");

    await queueAction("reopen_ticket", "ticket", id, userId);
    await audit(c, "ticket.reopen_queued", "ticket", String(id));
    return success(c, { queued: true as const });
  }
);

// POST /ticket-actions/:id/force-close
ticketActions.post(
  "/ticket-actions/:id/force-close",
  requirePermission("manage:tickets"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const db = getSecretaryDb();

    const rows: any[] = await db.$queryRaw(Prisma.sql`
      SELECT id, status FROM tickets WHERE id = ${id}`);
    if (rows.length === 0) return fail(c, "Ticket not found", 404);
    if (rows[0].status !== "closing") return fail(c, "Ticket is not in closing state");

    await queueAction("force_close_ticket", "ticket", id, userId);
    await audit(c, "ticket.force_close_queued", "ticket", String(id));
    return success(c, { queued: true as const });
  }
);

export default ticketActions;

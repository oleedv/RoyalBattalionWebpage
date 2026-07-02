import { Hono } from "hono";
import { Prisma } from "../generated/prisma/client";
import type { LegacyTicket } from "shared";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { rateLimit } from "../middleware/rate-limit";
import { success, fail } from "../lib/crud-helpers";

const LEGACY_TICKETS_CAP = 500;

const legacyTickets = new Hono();

// GET / - list all legacy tickets
legacyTickets.get(
  "/",
  authMiddleware,
  rateLimit(30),
  requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"),
  async (c) => {
    const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, uuid, thread_number, user_id, username, nickname, previous_threads, started_at, closed_at
      FROM legacy_tickets ORDER BY started_at DESC LIMIT ${LEGACY_TICKETS_CAP}`
    );

    const result: LegacyTicket[] = rows.map((r) => ({
      id: r.id,
      uuid: r.uuid,
      threadNumber: r.thread_number,
      userId: r.user_id,
      username: r.username,
      nickname: r.nickname,
      previousThreads: r.previous_threads,
      startedAt: new Date(r.started_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    }));

    return success(c, result);
  }
);

// GET /:id - get legacy ticket with messages
legacyTickets.get(
  "/:id",
  authMiddleware,
  rateLimit(30),
  requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"),
  async (c) => {
    const id = Number(c.req.param("id"));

    const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, uuid, thread_number, user_id, username, nickname, previous_threads, started_at, closed_at
       FROM legacy_tickets WHERE id = ${id}`
    );

    if (ticketRows.length === 0) {
      return fail(c, "Legacy ticket not found", 404);
    }

    const r = ticketRows[0];

    const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
      SELECT id, ticket_id, type, author, content, created_at
       FROM legacy_ticket_messages WHERE ticket_id = ${id} ORDER BY created_at ASC`
    );

    const ticket: LegacyTicket = {
      id: r.id,
      uuid: r.uuid,
      threadNumber: r.thread_number,
      userId: r.user_id,
      username: r.username,
      nickname: r.nickname,
      previousThreads: r.previous_threads,
      startedAt: new Date(r.started_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      messages: messageRows.map((m) => ({
        id: m.id,
        ticketId: m.ticket_id,
        type: m.type,
        author: m.author,
        content: m.content,
        createdAt: new Date(m.created_at).toISOString(),
      })),
    };

    return success(c, ticket);
  }
);

// GET /by-uuid/:uuid - public lookup of a legacy ticket by UUID
legacyTickets.get("/by-uuid/:uuid", rateLimit(30), async (c) => {
  const uuid = c.req.param("uuid");

  const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, thread_number, user_id, username, nickname, previous_threads, started_at, closed_at
     FROM legacy_tickets WHERE uuid = ${uuid}`
  );

  if (ticketRows.length === 0) {
    return fail(c, "Legacy ticket not found", 404);
  }

  const r = ticketRows[0];
  const id = r.id;

  const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, ticket_id, type, author, content, created_at
     FROM legacy_ticket_messages WHERE ticket_id = ${id} ORDER BY created_at ASC`
  );

  const ticket: LegacyTicket = {
    id: r.id,
    uuid: r.uuid,
    threadNumber: r.thread_number,
    userId: r.user_id,
    username: r.username,
    nickname: r.nickname,
    previousThreads: r.previous_threads,
    startedAt: new Date(r.started_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    messages: messageRows.map((m) => ({
      id: m.id,
      ticketId: m.ticket_id,
      type: m.type,
      author: m.author,
      content: m.content,
      createdAt: new Date(m.created_at).toISOString(),
    })),
  };

  return success(c, ticket);
});

export default legacyTickets;

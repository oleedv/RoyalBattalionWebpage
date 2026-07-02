import { Hono } from "hono";
import { Prisma } from "../generated/prisma/client";
import type { Ticket, Permission } from "shared";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission, getAllowedTicketTiers } from "../middleware/permissions";
import { rateLimit } from "../middleware/rate-limit";
import { success, fail } from "../lib/crud-helpers";

const TICKETS_CAP = 500;

const tickets = new Hono();

// Apply auth middleware to all routes except /by-uuid/*
tickets.use("*", async (c, next) => {
  if (c.req.path.includes("/by-uuid/")) {
    return next();
  }
  return authMiddleware(c, next);
});

// --- Public route: lookup ticket by UUID ---
tickets.get("/by-uuid/:uuid", rateLimit(30), async (c) => {
  const uuid = c.req.param("uuid");

  const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
     FROM tickets WHERE uuid = ${uuid}`
  );

  if (ticketRows.length === 0) {
    return fail(c, "Ticket not found", 404);
  }

  const r = ticketRows[0];
  const id = r.id;

  const eventRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, ticket_id, event_type, actor_id, detail, created_at
     FROM ticket_events WHERE ticket_id = ${id} ORDER BY created_at ASC`
  );

  const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, ticket_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM ticket_messages WHERE ticket_id = ${id} ORDER BY created_at ASC`
  );

  const ticket: Ticket = {
    id: r.id,
    uuid: r.uuid,
    channelId: r.channel_id,
    userId: r.user_id,
    status: r.status,
    tier: r.tier,
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
    events: eventRows.map((e) => ({
      id: e.id,
      ticketId: e.ticket_id,
      eventType: e.event_type,
      actorId: e.actor_id,
      detail: e.detail,
      createdAt: new Date(e.created_at).toISOString(),
    })),
    messages: messageRows.map((m) => ({
      id: m.id,
      ticketId: m.ticket_id,
      authorId: m.author_id,
      authorTag: m.author_tag,
      content: m.content,
      attachments: m.attachments,
      isStaff: Boolean(m.is_staff),
      createdAt: new Date(m.created_at).toISOString(),
    })),
  };

  return success(c, ticket);
});

// GET / - list all tickets
tickets.get("/", rateLimit(30), requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"), async (c) => {
  const userPermissions = c.get("permissions") as Permission[];
  const allowedTiers = getAllowedTicketTiers(userPermissions);

  if (allowedTiers !== null && allowedTiers.length === 0) {
    return success(c, [] as Ticket[]);
  }

  const where = allowedTiers !== null
    ? Prisma.sql`WHERE tier IN (${Prisma.join(allowedTiers)})`
    : Prisma.empty;

  const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
    FROM tickets ${where} ORDER BY created_at DESC LIMIT ${TICKETS_CAP}`
  );

  const result: Ticket[] = rows.map((r) => ({
    id: r.id,
    uuid: r.uuid,
    channelId: r.channel_id,
    userId: r.user_id,
    status: r.status,
    tier: r.tier,
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
  }));

  return success(c, result);
});

// GET /:id - get ticket with events and messages
tickets.get("/:id", rateLimit(30), requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"), async (c) => {
  const id = Number(c.req.param("id"));

  const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
     FROM tickets WHERE id = ${id}`
  );

  if (ticketRows.length === 0) {
    return fail(c, "Ticket not found", 404);
  }

  const r = ticketRows[0];

  // Check tier-level access
  const userPermissions = c.get("permissions") as Permission[];
  const allowedTiers = getAllowedTicketTiers(userPermissions);
  if (allowedTiers !== null && !allowedTiers.includes(r.tier)) {
    return fail(c, "Insufficient permissions", 403);
  }

  const eventRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, ticket_id, event_type, actor_id, detail, created_at
     FROM ticket_events WHERE ticket_id = ${id} ORDER BY created_at ASC`
  );

  const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, ticket_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM ticket_messages WHERE ticket_id = ${id} ORDER BY created_at ASC`
  );

  const ticket: Ticket = {
    id: r.id,
    uuid: r.uuid,
    channelId: r.channel_id,
    userId: r.user_id,
    status: r.status,
    tier: r.tier,
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
    events: eventRows.map((e) => ({
      id: e.id,
      ticketId: e.ticket_id,
      eventType: e.event_type,
      actorId: e.actor_id,
      detail: e.detail,
      createdAt: new Date(e.created_at).toISOString(),
    })),
    messages: messageRows.map((m) => ({
      id: m.id,
      ticketId: m.ticket_id,
      authorId: m.author_id,
      authorTag: m.author_tag,
      content: m.content,
      attachments: m.attachments,
      isStaff: Boolean(m.is_staff),
      createdAt: new Date(m.created_at).toISOString(),
    })),
  };

  return success(c, ticket);
});

export default tickets;

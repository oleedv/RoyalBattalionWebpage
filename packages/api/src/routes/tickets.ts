import { Hono } from "hono";
import { Prisma } from "../generated/prisma/client";
import type { Ticket, Permission, DiscordEmbed, TicketMessage } from "shared";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission, getAllowedTicketTiers } from "../middleware/permissions";
import { rateLimit } from "../middleware/rate-limit";
import { success, fail } from "../lib/crud-helpers";
import { searchTickets } from "../lib/ticket-search";

const TICKETS_CAP = 500;

function parseEmbeds(raw: unknown): DiscordEmbed[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as DiscordEmbed[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as DiscordEmbed[]; } catch { return null; }
  }
  return null;
}

function mapTicketMessage(m: any): TicketMessage {
  return {
    id: m.id,
    ticketId: m.ticket_id,
    authorId: m.author_id,
    authorTag: m.author_tag,
    content: m.content,
    attachments: m.attachments,
    isStaff: Boolean(m.is_staff),
    isBot: Boolean(m.is_bot),
    createdAt: new Date(m.created_at).toISOString(),
    discordMessageId: m.discord_message_id ?? null,
    channelMessageId: m.channel_message_id ?? null,
    replyToMessageId: m.reply_to_message_id ?? null,
    threadId: m.thread_id ?? null,
    threadName: m.thread_name ?? null,
    embeds: parseEmbeds(m.embeds),
  };
}

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
    SELECT id, ticket_id, author_id, author_tag, content, attachments, is_staff, is_bot,
           created_at, discord_message_id, channel_message_id, reply_to_message_id,
           thread_id, thread_name, embeds
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
    messages: messageRows.map(mapTicketMessage),
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

// GET /search - unified, paginated search across current + legacy tickets
tickets.get("/search", rateLimit(60), requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"), async (c) => {
  const userPermissions = c.get("permissions") as Permission[];
  const allowedTiers = getAllowedTicketTiers(userPermissions);

  const q = c.req.query("q");
  const status = c.req.query("status");
  const type = c.req.query("type");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const page = Number(c.req.query("page") ?? 0);
  const pageSize = Number(c.req.query("pageSize") ?? 0);

  try {
    const result = await searchTickets(getSecretaryDb(), {
      q,
      status,
      type,
      from,
      to,
      page: Number.isFinite(page) ? page : 0,
      pageSize: Number.isFinite(pageSize) ? pageSize : 0,
      allowedTiers,
    });
    return success(c, result);
  } catch (err) {
    console.error("[tickets/search] query failed", err);
    return fail(c, "Search failed", 500);
  }
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
    SELECT id, ticket_id, author_id, author_tag, content, attachments, is_staff, is_bot,
           created_at, discord_message_id, channel_message_id, reply_to_message_id,
           thread_id, thread_name, embeds
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
    messages: messageRows.map(mapTicketMessage),
  };

  return success(c, ticket);
});

export default tickets;

import { Hono } from "hono";
import { Prisma } from "../generated/prisma/client";
import type {
  ApiResponse,
  Ticket,
  Prospect,
  LegacyTicket,
} from "shared";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission, getAllowedTicketTiers } from "../middleware/permissions";
import { rateLimit } from "../middleware/rate-limit";
import type { Permission } from "shared";

const tickets = new Hono();

// Apply auth middleware to all routes except /by-uuid/*
tickets.use("*", async (c, next) => {
  if (c.req.path.includes("/by-uuid/")) {
    return next();
  }
  return authMiddleware(c, next);
});

// --- Public route: lookup prospect by UUID ---
tickets.get("/by-uuid/prospect/:uuid", rateLimit(30), async (c) => {
  const uuid = c.req.param("uuid");

  const prospectRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
            squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
            steam_id, mentor_id, paused_at, extra_days, created_at, closed_at, closed_by
     FROM prospects WHERE uuid = ${uuid}`
  );

  if (prospectRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Prospect not found" }, 404);
  }

  const r = prospectRows[0];
  const id = r.id;

  const eventRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, event_type, actor_id, detail, created_at
     FROM prospect_events WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM prospect_messages WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const voteRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, voter_id, voter_tag, vote, reason, created_at
     FROM prospect_votes WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const prospect: Prospect = {
    id: r.id,
    uuid: r.uuid,
    channelId: r.channel_id,
    userId: r.user_id,
    status: r.status,
    alias: r.alias,
    nationality: r.nationality,
    dateOfBirth: r.date_of_birth,
    squadHours: r.squad_hours,
    preferredRoles: r.preferred_roles,
    prevClan: r.prev_clan,
    whyRb: r.why_rb,
    activeHours: r.active_hours,
    competitive: r.competitive,
    steamId: r.steam_id,
    mentorId: r.mentor_id,
    pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
    extraDays: Number(r.extra_days) || 0,
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
    events: eventRows.map((e) => ({
      id: e.id,
      prospectId: e.prospect_id,
      eventType: e.event_type,
      actorId: e.actor_id,
      detail: e.detail,
      createdAt: new Date(e.created_at).toISOString(),
    })),
    messages: messageRows.map((m) => ({
      id: m.id,
      prospectId: m.prospect_id,
      authorId: m.author_id,
      authorTag: m.author_tag,
      content: m.content,
      attachments: m.attachments,
      isStaff: Boolean(m.is_staff),
      createdAt: new Date(m.created_at).toISOString(),
    })),
    votes: voteRows.map((v) => ({
      id: v.id,
      prospectId: v.prospect_id,
      voterId: v.voter_id,
      voterTag: v.voter_tag,
      vote: v.vote,
      reason: v.reason,
      createdAt: new Date(v.created_at).toISOString(),
    })),
  };

  return c.json<ApiResponse<Prospect>>({ success: true, data: prospect });
});

// --- Public route: lookup legacy ticket by UUID ---
tickets.get("/by-uuid/legacy/:uuid", rateLimit(30), async (c) => {
  const uuid = c.req.param("uuid");

  const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, thread_number, user_id, username, nickname, previous_threads, started_at, closed_at
     FROM legacy_tickets WHERE uuid = ${uuid}`
  );

  if (ticketRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Legacy ticket not found" }, 404);
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

  return c.json<ApiResponse<LegacyTicket>>({ success: true, data: ticket });
});

// --- Public route: lookup ticket by UUID ---
tickets.get("/by-uuid/:uuid", rateLimit(30), async (c) => {
  const uuid = c.req.param("uuid");

  const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
     FROM tickets WHERE uuid = ${uuid}`
  );

  if (ticketRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Ticket not found" }, 404);
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

  return c.json<ApiResponse<Ticket>>({ success: true, data: ticket });
});

// GET /tickets - list all tickets
tickets.get("/", rateLimit(30), requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"), async (c) => {
  const userPermissions = c.get("permissions") as Permission[];
  const allowedTiers = getAllowedTicketTiers(userPermissions);

  if (allowedTiers !== null && allowedTiers.length === 0) {
    return c.json<ApiResponse<Ticket[]>>({ success: true, data: [] });
  }

  const where = allowedTiers !== null
    ? Prisma.sql`WHERE tier IN (${Prisma.join(allowedTiers)})`
    : Prisma.empty;

  const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
    FROM tickets ${where} ORDER BY created_at DESC`
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

  return c.json<ApiResponse<Ticket[]>>({ success: true, data: result });
});

// GET /tickets/legacy - list all legacy tickets
tickets.get("/legacy", rateLimit(30), requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"), async (c) => {
  const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, thread_number, user_id, username, nickname, previous_threads, started_at, closed_at
    FROM legacy_tickets ORDER BY started_at DESC`
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

  return c.json<ApiResponse<LegacyTicket[]>>({ success: true, data: result });
});

// GET /tickets/legacy/:id - get legacy ticket with messages
tickets.get("/legacy/:id", rateLimit(30), requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"), async (c) => {
  const id = Number(c.req.param("id"));

  const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, thread_number, user_id, username, nickname, previous_threads, started_at, closed_at
     FROM legacy_tickets WHERE id = ${id}`
  );

  if (ticketRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Legacy ticket not found" }, 404);
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

  return c.json<ApiResponse<LegacyTicket>>({ success: true, data: ticket });
});

// GET /tickets/:id - get ticket with events and messages
tickets.get("/:id", rateLimit(30), requirePermission("view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"), async (c) => {
  const id = Number(c.req.param("id"));

  const ticketRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
     FROM tickets WHERE id = ${id}`
  );

  if (ticketRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Ticket not found" }, 404);
  }

  const r = ticketRows[0];

  // Check tier-level access
  const userPermissions = c.get("permissions") as Permission[];
  const allowedTiers = getAllowedTicketTiers(userPermissions);
  if (allowedTiers !== null && !allowedTiers.includes(r.tier)) {
    return c.json<ApiResponse<never>>({ success: false, error: "Insufficient permissions" }, 403);
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

  return c.json<ApiResponse<Ticket>>({ success: true, data: ticket });
});

// GET /tickets/prospects/list - list all prospects
tickets.get("/prospects/list", rateLimit(30), requirePermission("view:tickets", "manage:tickets"), async (c) => {
  const rows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
            squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
            steam_id, mentor_id, paused_at, extra_days, created_at, closed_at, closed_by
     FROM prospects
     ORDER BY created_at DESC`
  );

  const result: Prospect[] = rows.map((r) => ({
    id: r.id,
    uuid: r.uuid,
    channelId: r.channel_id,
    userId: r.user_id,
    status: r.status,
    alias: r.alias,
    nationality: r.nationality,
    dateOfBirth: r.date_of_birth,
    squadHours: r.squad_hours,
    preferredRoles: r.preferred_roles,
    prevClan: r.prev_clan,
    whyRb: r.why_rb,
    activeHours: r.active_hours,
    competitive: r.competitive,
    steamId: r.steam_id,
    mentorId: r.mentor_id,
    pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
    extraDays: Number(r.extra_days) || 0,
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
  }));

  return c.json<ApiResponse<Prospect[]>>({ success: true, data: result });
});

// GET /tickets/prospects/:id - get prospect with events, messages, votes
tickets.get("/prospects/:id", rateLimit(30), requirePermission("view:tickets", "manage:tickets"), async (c) => {
  const id = Number(c.req.param("id"));

  const prospectRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
            squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
            steam_id, mentor_id, paused_at, extra_days, created_at, closed_at, closed_by
     FROM prospects WHERE id = ${id}`
  );

  if (prospectRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Prospect not found" }, 404);
  }

  const r = prospectRows[0];

  const eventRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, event_type, actor_id, detail, created_at
     FROM prospect_events WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const messageRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM prospect_messages WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const voteRows: any[] = await getSecretaryDb().$queryRaw(Prisma.sql`
    SELECT id, prospect_id, voter_id, voter_tag, vote, reason, created_at
     FROM prospect_votes WHERE prospect_id = ${id} ORDER BY created_at ASC`
  );

  const prospect: Prospect = {
    id: r.id,
    uuid: r.uuid,
    channelId: r.channel_id,
    userId: r.user_id,
    status: r.status,
    alias: r.alias,
    nationality: r.nationality,
    dateOfBirth: r.date_of_birth,
    squadHours: r.squad_hours,
    preferredRoles: r.preferred_roles,
    prevClan: r.prev_clan,
    whyRb: r.why_rb,
    activeHours: r.active_hours,
    competitive: r.competitive,
    steamId: r.steam_id,
    mentorId: r.mentor_id,
    pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
    extraDays: Number(r.extra_days) || 0,
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
    events: eventRows.map((e) => ({
      id: e.id,
      prospectId: e.prospect_id,
      eventType: e.event_type,
      actorId: e.actor_id,
      detail: e.detail,
      createdAt: new Date(e.created_at).toISOString(),
    })),
    messages: messageRows.map((m) => ({
      id: m.id,
      prospectId: m.prospect_id,
      authorId: m.author_id,
      authorTag: m.author_tag,
      content: m.content,
      attachments: m.attachments,
      isStaff: Boolean(m.is_staff),
      createdAt: new Date(m.created_at).toISOString(),
    })),
    votes: voteRows.map((v) => ({
      id: v.id,
      prospectId: v.prospect_id,
      voterId: v.voter_id,
      voterTag: v.voter_tag,
      vote: v.vote,
      reason: v.reason,
      createdAt: new Date(v.created_at).toISOString(),
    })),
  };

  return c.json<ApiResponse<Prospect>>({ success: true, data: prospect });
});

export default tickets;

import { Hono } from "hono";
import type {
  ApiResponse,
  Ticket,
  Prospect,
} from "shared";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const tickets = new Hono();

// Apply auth middleware to all routes except /by-uuid/*
tickets.use("*", async (c, next) => {
  if (c.req.path.includes("/by-uuid/")) {
    return next();
  }
  return authMiddleware(c, next);
});

// --- Public route: lookup prospect by UUID ---
tickets.get("/by-uuid/prospect/:uuid", async (c) => {
  const uuid = c.req.param("uuid");

  const prospectRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
            squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
            steam_id, mentor_id, created_at, closed_at, closed_by
     FROM prospects WHERE uuid = ?`,
    uuid
  );

  if (prospectRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Prospect not found" }, 404);
  }

  const r = prospectRows[0];
  const id = r.id;

  const eventRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, prospect_id, event_type, actor_id, detail, created_at
     FROM prospect_events WHERE prospect_id = ? ORDER BY created_at ASC`,
    id
  );

  const messageRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, prospect_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM prospect_messages WHERE prospect_id = ? ORDER BY created_at ASC`,
    id
  );

  const voteRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, prospect_id, voter_id, voter_tag, vote, reason, created_at
     FROM prospect_votes WHERE prospect_id = ? ORDER BY created_at ASC`,
    id
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

// --- Public route: lookup ticket by UUID ---
tickets.get("/by-uuid/:uuid", async (c) => {
  const uuid = c.req.param("uuid");

  const ticketRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
     FROM tickets WHERE uuid = ?`,
    uuid
  );

  if (ticketRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Ticket not found" }, 404);
  }

  const r = ticketRows[0];
  const id = r.id;

  const eventRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, ticket_id, event_type, actor_id, detail, created_at
     FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC`,
    id
  );

  const messageRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, ticket_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
    id
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
tickets.get("/", requirePermission("admin"), async (c) => {
  const rows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
     FROM tickets
     ORDER BY created_at DESC`
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

// GET /tickets/:id - get ticket with events and messages
tickets.get("/:id", requirePermission("admin"), async (c) => {
  const id = Number(c.req.param("id"));

  const ticketRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, uuid, channel_id, user_id, status, tier, created_at, closed_at, closed_by
     FROM tickets WHERE id = ?`,
    id
  );

  if (ticketRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Ticket not found" }, 404);
  }

  const r = ticketRows[0];

  const eventRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, ticket_id, event_type, actor_id, detail, created_at
     FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC`,
    id
  );

  const messageRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, ticket_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
    id
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
tickets.get("/prospects/list", requirePermission("admin"), async (c) => {
  const rows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
            squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
            steam_id, mentor_id, created_at, closed_at, closed_by
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
    createdAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    closedBy: r.closed_by,
  }));

  return c.json<ApiResponse<Prospect[]>>({ success: true, data: result });
});

// GET /tickets/prospects/:id - get prospect with events, messages, votes
tickets.get("/prospects/:id", requirePermission("admin"), async (c) => {
  const id = Number(c.req.param("id"));

  const prospectRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, uuid, channel_id, user_id, status, alias, nationality, date_of_birth,
            squad_hours, preferred_roles, prev_clan, why_rb, active_hours, competitive,
            steam_id, mentor_id, created_at, closed_at, closed_by
     FROM prospects WHERE id = ?`,
    id
  );

  if (prospectRows.length === 0) {
    return c.json<ApiResponse<never>>({ success: false, error: "Prospect not found" }, 404);
  }

  const r = prospectRows[0];

  const eventRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, prospect_id, event_type, actor_id, detail, created_at
     FROM prospect_events WHERE prospect_id = ? ORDER BY created_at ASC`,
    id
  );

  const messageRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, prospect_id, author_id, author_tag, content, attachments, is_staff, created_at
     FROM prospect_messages WHERE prospect_id = ? ORDER BY created_at ASC`,
    id
  );

  const voteRows: any[] = await getSecretaryDb().$queryRawUnsafe(
    `SELECT id, prospect_id, voter_id, voter_tag, vote, reason, created_at
     FROM prospect_votes WHERE prospect_id = ? ORDER BY created_at ASC`,
    id
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

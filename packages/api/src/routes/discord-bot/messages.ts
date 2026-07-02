import { Hono } from "hono";
import { Prisma } from "../../generated/prisma/client";
import type { BotMessage, BotLog } from "shared";
import getSecretaryDb, { resetSecretaryDb } from "../../lib/secretary-db";
import { requirePermission } from "../../middleware/permissions";
import { success, fail } from "../../lib/crud-helpers";
import { parsePageParams, paginate } from "../../lib/pagination";
import { logger } from "../../lib/logger";

const messages = new Hono();

/**
 * Distinguish a genuinely-unavailable Secretary DB connection (→ 503) from any
 * other failure (→ 500). Only connection/initialization-level errors count as
 * "unavailable"; everything else is a real server error.
 */
function isDbUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P1000 auth, P1001 can't reach, P1002 timed out reaching, P1008 op timeout, P1017 server closed
    return ["P1000", "P1001", "P1002", "P1008", "P1017"].includes(err.code);
  }
  const code = (err as { code?: unknown })?.code;
  if (typeof code === "string") {
    return [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "ECONNRESET",
      "EPIPE",
    ].includes(code);
  }
  return false;
}

function mapBotMessage(r: any): BotMessage {
  let attachments: unknown[] | null = null;
  if (r.attachments) {
    try {
      attachments = typeof r.attachments === "string" ? JSON.parse(r.attachments) : r.attachments;
    } catch { /* ignore */ }
  }
  return {
    id: Number(r.id),
    messageId: r.message_id,
    channelId: r.channel_id,
    channelName: r.channel_name,
    guildId: r.guild_id,
    authorId: r.author_id,
    authorTag: r.author_tag,
    content: r.content,
    attachments,
    isDm: Boolean(r.is_dm),
    direction: r.direction || "incoming",
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function mapBotLog(r: any): BotLog {
  let data: unknown | null = null;
  if (r.data) {
    try {
      data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    } catch { /* ignore */ }
  }
  return {
    id: Number(r.id),
    level: Number(r.level),
    levelLabel: r.level_label,
    module: r.module,
    message: r.message,
    data,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// GET /messages
messages.get(
  "/messages",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const { page, limit, skip } = parsePageParams(c, 50, 200);
      const author = c.req.query("author");
      const channel = c.req.query("channel");
      const dm = c.req.query("dm");
      const search = c.req.query("search");
      const from = c.req.query("from");
      const to = c.req.query("to");

      const conditions: Prisma.Sql[] = [];

      if (author) { conditions.push(Prisma.sql`author_id = ${author}`); }
      if (channel) { conditions.push(Prisma.sql`channel_id = ${channel}`); }
      if (dm === "1") { conditions.push(Prisma.sql`is_dm = 1`); }
      if (search) { conditions.push(Prisma.sql`content LIKE ${`%${search}%`}`); }
      if (from) { conditions.push(Prisma.sql`created_at >= ${from}`); }
      if (to) { conditions.push(Prisma.sql`created_at <= ${to}`); }

      const where = conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;
      const db = getSecretaryDb();

      const [countRows, rows] = await Promise.all([
        db.$queryRaw<any[]>(Prisma.sql`SELECT COUNT(*) as total FROM bot_messages ${where}`),
        db.$queryRaw<any[]>(Prisma.sql`
          SELECT id, message_id, channel_id, channel_name, guild_id, author_id, author_tag,
                  content, attachments, is_dm, direction, created_at
           FROM bot_messages ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${skip}`),
      ]);

      const total = Number(countRows[0]?.total || 0);
      const items: BotMessage[] = rows.map(mapBotMessage);

      return success(c, paginate(items, total, page, limit));
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Messages endpoint error", err);
      if (isDbUnavailable(err)) return fail(c, "Secretary database unavailable", 503);
      return fail(c, "Failed to fetch messages", 500);
    }
  }
);

// GET /logs
messages.get(
  "/logs",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const { page, limit, skip } = parsePageParams(c, 50, 200);
      const level = c.req.query("level");
      const module = c.req.query("module");
      const search = c.req.query("search");
      const from = c.req.query("from");
      const to = c.req.query("to");

      const conditions: Prisma.Sql[] = [];

      if (level) { conditions.push(Prisma.sql`level = ${Number(level)}`); }
      if (module) { conditions.push(Prisma.sql`module = ${module}`); }
      if (search) { conditions.push(Prisma.sql`message LIKE ${`%${search}%`}`); }
      if (from) { conditions.push(Prisma.sql`created_at >= ${from}`); }
      if (to) { conditions.push(Prisma.sql`created_at <= ${to}`); }

      const where = conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;
      const db = getSecretaryDb();

      const [countRows, rows] = await Promise.all([
        db.$queryRaw<any[]>(Prisma.sql`SELECT COUNT(*) as total FROM bot_logs ${where}`),
        db.$queryRaw<any[]>(Prisma.sql`
          SELECT id, level, level_label, module, message, data, created_at
           FROM bot_logs ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${skip}`),
      ]);

      const total = Number(countRows[0]?.total || 0);
      const items: BotLog[] = rows.map(mapBotLog);

      return success(c, paginate(items, total, page, limit));
    } catch (err: unknown) {
      resetSecretaryDb();
      logger.error("discord-bot", "Logs endpoint error", err);
      if (isDbUnavailable(err)) return fail(c, "Secretary database unavailable", 503);
      return fail(c, "Failed to fetch logs", 500);
    }
  }
);

export default messages;

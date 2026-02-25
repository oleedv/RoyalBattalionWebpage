import { Hono } from "hono";
import { Prisma } from "../../generated/prisma/client";
import type { DiscordBotOverview, BotStatus, SeedingSession, Permission } from "shared";
import getSecretaryDb from "../../lib/secretary-db";
import { requirePermission, getAllowedTicketTiers } from "../../middleware/permissions";
import { success, fail } from "../../lib/crud-helpers";
import { logger } from "../../lib/logger";

/** Raw row shape from the bot_status table */
interface BotStatusRow {
  status: string;
  uptime_seconds: number | bigint | null;
  guild_count: number | bigint | null;
  member_count: number | bigint | null;
  latency_ms: number | bigint | null;
  db_connected: boolean | number | null;
  squadjs_connected: boolean | number | null;
  seeding_scheduler_active: boolean | number | null;
  prospect_scheduler_active: boolean | number | null;
  last_heartbeat: string | Date | null;
  started_at: string | Date | null;
}

/** Raw row shape from the seeding_sessions table */
interface SeedingSessionRow {
  id: number;
  started_at: string | Date;
  completed_at: string | Date | null;
  duration_minutes: number | null;
  start_players: number | null;
  peak_players: number | null;
  end_players: number | null;
  map_name: string | null;
  layer_name: string | null;
  status: string;
  call_message_id: string | null;
  completion_message_id: string | null;
}

/** Raw row from ticket tier count query */
interface TicketTierCountRow {
  tier: string;
  count: number | bigint;
}

/** Raw row from recently closed tickets query */
interface RecentClosedRow {
  id: number;
  uuid: string;
  tier: string;
  closed_at: string | Date | null;
  first_message: string | null;
}

/** Raw row from prospect status count query */
interface ProspectStatusRow {
  status: string;
  count: number | bigint;
}

/** Raw row from recent prospects query */
interface RecentProspectRow {
  id: number;
  alias: string;
  status: string;
  created_at: string | Date;
}

/** Raw row from seeding config query */
interface SeedingConfigRow {
  enabled: boolean | number;
  seed_threshold: number;
}

const overview = new Hono();

function mapBotStatus(r: BotStatusRow): BotStatus {
  return {
    status: r.status,
    uptimeSeconds: Number(r.uptime_seconds) || 0,
    guildCount: Number(r.guild_count) || 0,
    memberCount: Number(r.member_count) || 0,
    latencyMs: Number(r.latency_ms) || 0,
    dbConnected: Boolean(r.db_connected),
    squadjsConnected: Boolean(r.squadjs_connected),
    seedingSchedulerActive: Boolean(r.seeding_scheduler_active),
    prospectSchedulerActive: Boolean(r.prospect_scheduler_active),
    lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).toISOString() : new Date().toISOString(),
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
  };
}

function mapSession(r: SeedingSessionRow): SeedingSession {
  return {
    id: r.id,
    startedAt: new Date(r.started_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    durationMinutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
    startPlayers: r.start_players != null ? Number(r.start_players) : null,
    peakPlayers: r.peak_players != null ? Number(r.peak_players) : null,
    endPlayers: r.end_players != null ? Number(r.end_players) : null,
    mapName: r.map_name,
    layerName: r.layer_name,
    status: r.status,
    callMessageId: r.call_message_id,
    completionMessageId: r.completion_message_id,
  };
}

// GET /overview
overview.get(
  "/overview",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const db = getSecretaryDb();

    const [
      ticketTierRows,
      recentClosedRows,
      prospectStatusRows,
      recentProspectRows,
      activeSessionRows,
      recentSessionRows,
      seedingConfigRows,
      botStatusRows,
    ] = await Promise.all([
      db.$queryRaw<TicketTierCountRow[]>(Prisma.sql`SELECT tier, COUNT(*) as count FROM tickets WHERE status = 'open' GROUP BY tier`),
      db.$queryRaw<RecentClosedRow[]>(Prisma.sql`SELECT t.id, t.uuid, t.tier, t.closed_at, (SELECT content FROM ticket_messages WHERE ticket_id = t.id AND is_staff = 0 ORDER BY created_at ASC LIMIT 1) as first_message FROM tickets t WHERE t.status = 'closed' ORDER BY t.closed_at DESC LIMIT 5`),
      db.$queryRaw<ProspectStatusRow[]>(Prisma.sql`SELECT status, COUNT(*) as count FROM prospects GROUP BY status`),
      db.$queryRaw<RecentProspectRow[]>(Prisma.sql`SELECT id, alias, status, created_at FROM prospects ORDER BY created_at DESC LIMIT 5`),
      db.$queryRaw<SeedingSessionRow[]>(Prisma.sql`SELECT * FROM seeding_sessions WHERE status = 'active' LIMIT 1`).catch((): SeedingSessionRow[] => []),
      db.$queryRaw<SeedingSessionRow[]>(Prisma.sql`SELECT * FROM seeding_sessions ORDER BY started_at DESC LIMIT 5`).catch((): SeedingSessionRow[] => []),
      db.$queryRaw<SeedingConfigRow[]>(Prisma.sql`SELECT enabled, seed_threshold FROM seeding_config WHERE id = 1`).catch((): SeedingConfigRow[] => []),
      db.$queryRaw<BotStatusRow[]>(Prisma.sql`SELECT * FROM bot_status WHERE id = 1`).catch((): BotStatusRow[] => []),
    ]);

    const userPermissions = c.get("permissions") as Permission[];
    const allowedTiers = getAllowedTicketTiers(userPermissions);

    const openByTier = { normal: 0, community_officer: 0, admin_officer: 0 };
    for (const r of ticketTierRows) {
      const tier = r.tier as keyof typeof openByTier;
      if (tier in openByTier) {
        if (allowedTiers === null || allowedTiers.includes(tier)) {
          openByTier[tier] = Number(r.count);
        }
      }
    }

    const recentlyClosed = recentClosedRows
      .filter((r) => allowedTiers === null || allowedTiers.includes(r.tier))
      .map((r) => ({
        id: r.id,
        uuid: r.uuid,
        tier: r.tier,
        closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : "",
        firstMessage: r.first_message || null,
      }));

    let prospectOpen = 0, prospectAccepted = 0, prospectDenied = 0;
    for (const r of prospectStatusRows) {
      const count = Number(r.count);
      if (r.status === "accepted") prospectAccepted += count;
      else if (r.status === "denied") prospectDenied += count;
      else if (r.status === "open") prospectOpen += count;
    }

    const recentActivity = recentProspectRows.map((r) => ({
      id: r.id,
      alias: r.alias,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    const activeSession = activeSessionRows.length > 0 ? mapSession(activeSessionRows[0]) : null;
    const recentSessions = recentSessionRows.map(mapSession);

    const seedingCfg = seedingConfigRows.length > 0
      ? { enabled: Boolean(seedingConfigRows[0].enabled), seedThreshold: Number(seedingConfigRows[0].seed_threshold) }
      : null;

    const botStatus: BotStatus | null = botStatusRows.length > 0 ? mapBotStatus(botStatusRows[0]) : null;

    const data: DiscordBotOverview = {
      tickets: { openByTier, recentlyClosed },
      prospects: { open: prospectOpen, accepted: prospectAccepted, denied: prospectDenied, recentActivity },
      seeding: { activeSession, recentSessions, config: seedingCfg },
      botStatus,
    };

    return success(c, data);
  }
);

// GET /status
overview.get(
  "/status",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    try {
      const rows: BotStatusRow[] = await getSecretaryDb().$queryRaw<BotStatusRow[]>(
        Prisma.sql`SELECT * FROM bot_status WHERE id = 1`
      ).catch((): BotStatusRow[] => []);

      if (rows.length === 0) {
        return success(c, null);
      }

      return success(c, mapBotStatus(rows[0]));
    } catch (err: unknown) {
      logger.error("discord-bot", "Status endpoint error", err);
      return fail(c, "Failed to query bot status", 500);
    }
  }
);

export default overview;

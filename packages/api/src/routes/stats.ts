import { Hono } from "hono";
import { Prisma } from "../generated/prisma/client";
import type { Permission, Match } from "shared";
import prisma from "../lib/db";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { fetchAllServers, type ServerStatus } from "./servers";
import { squadjsSocket } from "../lib/squadjs-socket";
import { logger } from "../lib/logger";
import { success } from "../lib/crud-helpers";

const stats = new Hono();

stats.use("*", authMiddleware);

stats.get("/summary", async (c) => {
  const permissions = c.get("permissions") as Permission[];
  const isAdmin = permissions.includes("developer");

  const result: Record<string, unknown> = {};

  // Servers - always included (public data)
  const serversPromise = fetchAllServers().then((data) => {
    result.servers = data;
  }).catch((err) => {
    logger.error("stats", "Failed to fetch servers", err);
    result.servers = [];
  });

  // SquadJS metric history + current counts - keyed by server key for frontend matching
  const serverMetrics: Record<string, {
    serverName: string;
    metricHistory: unknown[];
    playerCount: number;
    publicQueue: number;
    reserveQueue: number;
    maxPlayers: number;
  }> = {};
  for (const key of squadjsSocket.getServerKeys()) {
    const snapshot = squadjsSocket.getSnapshot(key);
    if (snapshot) {
      serverMetrics[key] = {
        serverName: snapshot.serverInfo?.serverName || key,
        metricHistory: snapshot.metricHistory,
        playerCount: snapshot.serverInfo?.playerCount ?? 0,
        publicQueue: snapshot.serverInfo?.publicQueue ?? 0,
        reserveQueue: snapshot.serverInfo?.reserveQueue ?? 0,
        maxPlayers: snapshot.serverInfo?.maxPlayers ?? 0,
      };
    }
  }
  result.serverMetrics = serverMetrics;

  const promises: Promise<void>[] = [serversPromise];

  // Tickets & Prospects - requires admin
  if (isAdmin) {
    try {
      const secretaryDb = getSecretaryDb();

      promises.push(
        secretaryDb
          .$queryRaw<{ status: string; count: number }[]>(
            Prisma.sql`SELECT status, COUNT(*) as count FROM tickets GROUP BY status`
          )
          .then((rows: any[]) => {
            let open = 0;
            let closed = 0;
            for (const r of rows) {
              if (r.status === "closed") closed += Number(r.count);
              else open += Number(r.count);
            }
            result.tickets = { open, closed };
          })
          .catch((err: unknown) => {
            logger.error("stats", "Failed to fetch tickets", err);
          })
      );

      promises.push(
        secretaryDb
          .$queryRaw<{ status: string; count: number }[]>(
            Prisma.sql`SELECT status, COUNT(*) as count FROM prospects GROUP BY status`
          )
          .then((rows: any[]) => {
            let open = 0;
            let accepted = 0;
            let denied = 0;
            for (const r of rows) {
              const status = r.status;
              const count = Number(r.count);
              if (status === "accepted") accepted += count;
              else if (status === "denied") denied += count;
              else open += count;
            }
            result.prospects = { open, accepted, denied };
          })
          .catch((err: unknown) => {
            logger.error("stats", "Failed to fetch prospects", err);
          })
      );
    } catch (err) {
      logger.error("stats", "Secretary DB not available", err);
    }
  }

  // Members - requires view:members
  if (isAdmin || permissions.includes("view:members")) {
    promises.push(
      Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { steamId: { not: null } } }),
      ]).then(([total, withSteam]) => {
        result.members = { total, withSteam };
      }).catch((err) => {
        logger.error("stats", "Failed to fetch members", err);
      })
    );
  }

  // Whitelist - requires view:whitelist
  if (isAdmin || permissions.includes("view:whitelist")) {
    promises.push(
      prisma.whitelistEntry.count().then((total) => {
        result.whitelist = { total };
      }).catch((err) => {
        logger.error("stats", "Failed to fetch whitelist", err);
      })
    );
  }

  // Matches - requires manage:matches
  if (isAdmin || permissions.includes("manage:matches")) {
    promises.push(
      prisma.match.findMany({ orderBy: { date: "desc" } }).then((entries) => {
        let wins = 0;
        let losses = 0;
        let draws = 0;
        for (const e of entries) {
          const r = e.result.toLowerCase();
          if (r === "win") wins++;
          else if (r === "loss") losses++;
          else if (r === "draw") draws++;
        }
        result.matches = { total: entries.length, wins, losses, draws };

        const recent: Match[] = entries.slice(0, 5).map((e) => ({
          id: e.id,
          date: e.date.toISOString(),
          map: e.map,
          layer: e.layer,
          result: e.result,
          server: e.server,
          vodUrl: e.vodUrl,
          hidden: e.hidden,
          createdBy: e.createdBy,
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
        }));
        result.recentMatches = recent;
      }).catch((err) => {
        logger.error("stats", "Failed to fetch matches", err);
      })
    );
  }

  await Promise.all(promises);

  // Merge SquadJS metrics into server objects by matching server names
  const servers = result.servers as ServerStatus[] | undefined;
  const metricsEntries = Object.values(serverMetrics);
  if (servers && metricsEntries.length > 0) {
    for (const server of servers) {
      const bmName = server.name.toLowerCase();
      const match = metricsEntries.find((m) => {
        const sqName = m.serverName.toLowerCase();
        // Exact match or one contains the other
        return bmName === sqName || bmName.includes(sqName) || sqName.includes(bmName);
      });
      if (match) {
        server.players = match.playerCount;
        server.maxPlayers = match.maxPlayers || server.maxPlayers;
        server.publicQueue = match.publicQueue;
        server.reserveQueue = match.reserveQueue;
        server.metricHistory = match.metricHistory as ServerStatus["metricHistory"];
      }
    }
  }

  return success(c, result);
});

export default stats;

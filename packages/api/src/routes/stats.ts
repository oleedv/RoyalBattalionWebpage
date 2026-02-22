import { Hono } from "hono";
import type { ApiResponse, Permission, Match } from "shared";
import prisma from "../lib/db";
import getSecretaryDb from "../lib/secretary-db";
import { authMiddleware } from "../middleware/auth";
import { fetchAllServers } from "./servers";
import { squadjsSocket } from "../lib/squadjs-socket";

const stats = new Hono();

stats.use("*", authMiddleware);

stats.get("/summary", async (c) => {
  const permissions = c.get("permissions") as Permission[];
  const isAdmin = permissions.includes("admin");

  const result: Record<string, unknown> = {};

  // Servers - always included (public data)
  const serversPromise = fetchAllServers().then((data) => {
    result.servers = data;
  });

  // SquadJS metric history - keyed by server name for frontend matching
  const serverMetrics: Record<string, { serverName: string; metricHistory: unknown[] }> = {};
  for (const key of squadjsSocket.getServerKeys()) {
    const snapshot = squadjsSocket.getSnapshot(key);
    if (snapshot) {
      serverMetrics[key] = {
        serverName: snapshot.serverInfo?.serverName || key,
        metricHistory: snapshot.metricHistory,
      };
    }
  }
  result.serverMetrics = serverMetrics;

  const promises: Promise<void>[] = [serversPromise];

  // Tickets & Prospects - requires admin
  if (isAdmin) {
    promises.push(
      getSecretaryDb()
        .$queryRawUnsafe<{ status: string; count: number }[]>(
          `SELECT status, COUNT(*) as count FROM tickets GROUP BY status`
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
    );

    promises.push(
      getSecretaryDb()
        .$queryRawUnsafe<{ status: string; count: number }[]>(
          `SELECT status, COUNT(*) as count FROM prospects GROUP BY status`
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
    );
  }

  // Members - requires view:members
  if (isAdmin || permissions.includes("view:members")) {
    promises.push(
      Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { steamId: { not: null } } }),
      ]).then(([total, withSteam]) => {
        result.members = { total, withSteam };
      })
    );
  }

  // Whitelist - requires view:whitelist
  if (isAdmin || permissions.includes("view:whitelist")) {
    promises.push(
      prisma.whitelistEntry.count().then((total) => {
        result.whitelist = { total };
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
      })
    );
  }

  await Promise.all(promises);

  return c.json<ApiResponse<typeof result>>({ success: true, data: result });
});

export default stats;

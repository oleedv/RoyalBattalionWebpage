import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { getSquadJSPool } from "../lib/squadjs-db";
import { success, fail } from "../lib/crud-helpers";

const playtime = new Hono();

playtime.use("*", authMiddleware);
playtime.use("*", requirePermission("view:whitelist", "view:members", "view:live-server"));

// GET /playtime?steamId=xxx
playtime.get("/", async (c) => {
  const steamId = c.req.query("steamId");
  if (!steamId) {
    return fail(c, "steamId query parameter is required", 400);
  }

  const pool = getSquadJSPool();

  const query = `
    SELECT
      COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN c.session_duration ELSE 0 END), 0) AS session30,
      COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN c.session_duration ELSE 0 END), 0) AS session90,
      COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN c.seed_duration ELSE 0 END), 0) AS seed30,
      COALESCE(SUM(CASE WHEN c.time >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN c.seed_duration ELSE 0 END), 0) AS seed90
    FROM squadjs_connections c
    JOIN squadjs_players p ON p.id = c.player_id
    WHERE p.steam_id = ? AND c.event_type = 'leave'
  `;

  const [rows] = await pool.query(query, [steamId]);
  const row = (rows as Record<string, unknown>[])[0] || { session30: 0, session90: 0, seed30: 0, seed90: 0 };

  return success(c, {
    steamId,
    playtime30: Math.round((Number(row.session30) / 3600) * 10) / 10,
    playtime90: Math.round((Number(row.session90) / 3600) * 10) / 10,
    seed30: Math.round((Number(row.seed30) / 3600) * 10) / 10,
    seed90: Math.round((Number(row.seed90) / 3600) * 10) / 10,
  });
});

export default playtime;

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { getSquadJSPool } from "../lib/squadjs-db";

const playtime = new Hono();

playtime.use("*", authMiddleware);
playtime.use("*", requirePermission("view:whitelist", "view:members", "view:live-server"));

// GET /playtime?steamId=xxx&from=ISO&to=ISO
playtime.get("/", async (c) => {
  const steamId = c.req.query("steamId");
  if (!steamId) {
    return c.json({ success: false, error: "steamId is required" }, 400);
  }

  const from = c.req.query("from");
  const to = c.req.query("to") || new Date().toISOString();

  const pool = getSquadJSPool();

  let query: string;
  let params: unknown[];

  if (from) {
    query = `
      SELECT
        COALESCE(SUM(c.session_duration), 0) AS totalSession,
        COALESCE(SUM(c.seed_duration), 0) AS totalSeed
      FROM squadjs_connections c
      JOIN squadjs_players p ON p.id = c.player_id
      WHERE p.steam_id = ?
        AND c.event_type = 'leave'
        AND c.time >= ?
        AND c.time <= ?
    `;
    params = [steamId, from, to];
  } else {
    query = `
      SELECT
        COALESCE(SUM(c.session_duration), 0) AS totalSession,
        COALESCE(SUM(c.seed_duration), 0) AS totalSeed
      FROM squadjs_connections c
      JOIN squadjs_players p ON p.id = c.player_id
      WHERE p.steam_id = ?
        AND c.event_type = 'leave'
    `;
    params = [steamId];
  }

  const [rows] = await pool.query(query, params);
  const row = (rows as Record<string, unknown>[])[0] || { totalSession: 0, totalSeed: 0 };

  return c.json({
    success: true,
    data: {
      steamId,
      playtimeHours: Math.round((Number(row.totalSession) / 3600) * 10) / 10,
      seedHours: Math.round((Number(row.totalSeed) / 3600) * 10) / 10,
    },
  });
});

export default playtime;

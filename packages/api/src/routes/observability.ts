import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getSquadJSPool } from "../lib/squadjs-db";
import { logger } from "../lib/logger";

const observability = new Hono();

observability.use("*", authMiddleware);

// GET /observability/grace-period?from=&to=&limit=
observability.get("/grace-period", async (c) => {
  try {
    const pool = getSquadJSPool();
    const from = c.req.query("from") || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = c.req.query("to") || new Date().toISOString();
    const limit = Math.min(parseInt(c.req.query("limit") || "200", 10), 1000);
    const player = c.req.query("player") || "";

    let query = `
      SELECT
        gpe.id,
        gpe.action,
        gpe.squad_id,
        gpe.squad_name,
        gpe.team_id,
        gpe.attempt_number,
        gpe.reason,
        gpe.grace_remaining_seconds,
        gpe.timestamp,
        p.name AS player_name,
        p.eos_id,
        p.steam_id
      FROM squadjs_grace_period_events gpe
      LEFT JOIN squadjs_players p ON gpe.player_id = p.id
      WHERE gpe.timestamp BETWEEN ? AND ?
    `;
    const params: unknown[] = [from, to];

    if (player) {
      query += ` AND p.name LIKE ?`;
      params.push(`%${player}%`);
    }

    query += ` ORDER BY gpe.timestamp DESC LIMIT ?`;
    params.push(limit);

    const [rows] = await pool.query(query, params);
    return c.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("observability", "Grace period query failed", msg);
    return c.json({ error: msg }, 500);
  }
});

// GET /observability/swap-queue?from=&to=&limit=
observability.get("/swap-queue", async (c) => {
  try {
    const pool = getSquadJSPool();
    const from = c.req.query("from") || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = c.req.query("to") || new Date().toISOString();
    const limit = Math.min(parseInt(c.req.query("limit") || "200", 10), 1000);
    const player = c.req.query("player") || "";

    let query = `
      SELECT
        sqa.id,
        sqa.action,
        sqa.priority,
        sqa.queue_position,
        sqa.from_team,
        sqa.to_team,
        sqa.reason,
        sqa.wait_time_seconds,
        sqa.timestamp,
        p.name AS player_name,
        p.eos_id,
        p.steam_id
      FROM squadjs_swap_queue_actions sqa
      LEFT JOIN squadjs_players p ON sqa.player_id = p.id
      WHERE sqa.timestamp BETWEEN ? AND ?
    `;
    const params: unknown[] = [from, to];

    if (player) {
      query += ` AND p.name LIKE ?`;
      params.push(`%${player}%`);
    }

    query += ` ORDER BY sqa.timestamp DESC LIMIT ?`;
    params.push(limit);

    const [rows] = await pool.query(query, params);
    return c.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("observability", "Swap queue query failed", msg);
    return c.json({ error: msg }, 500);
  }
});

export default observability;

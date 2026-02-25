import type { RowDataPacket } from "mysql2/promise";
import prisma from "./db";
import { getSquadJSPool } from "./squadjs-db";
import { assembleMatchDetail } from "./match-assembler";
import { logger } from "./logger";

interface MatchIdRow extends RowDataPacket {
  id: number;
}

export async function syncMatches(): Promise<{ synced: number; total: number }> {
  const pool = getSquadJSPool();

  // Get all completed matches from SquadJS (with endTime, excluding training maps)
  const [rows] = await pool.query(
    `SELECT id FROM squadjs_matches
     WHERE end_time IS NOT NULL
       AND layer_classname NOT LIKE '%Jensens%'
       AND layer_classname NOT LIKE '%Jensen%'
     ORDER BY id`
  );
  const matchIds = (rows as MatchIdRow[]).map((r) => r.id);

  // Get already-synced squadjsIds
  const existing = await prisma.match.findMany({
    where: { squadjsId: { not: null } },
    select: { squadjsId: true },
  });
  const existingIds = new Set(existing.map((e) => e.squadjsId));

  let synced = 0;
  for (const matchId of matchIds) {
    if (existingIds.has(matchId)) continue;

    try {
      const assembled = await assembleMatchDetail(pool, matchId);
      if (!assembled) continue; // filtered out (too short, training, etc.)

      await prisma.match.create({
        data: {
          squadjsId: matchId,
          date: assembled.meta.startTime,
          map: assembled.meta.map,
          layer: assembled.meta.layer,
          result: assembled.meta.result,
          server: assembled.meta.serverName,
          matchDetail: assembled.detail as unknown as Record<string, unknown>,
          hidden: false,
          createdBy: "squadjs-sync",
        },
      });
      synced++;
    } catch (err) {
      logger.error("match-sync", `Failed to sync match ${matchId}`, err);
    }
  }

  if (synced > 0) {
    logger.info("match-sync", `Synced ${synced} new matches (${matchIds.length} total in SquadJS)`);
  }

  return { synced, total: matchIds.length };
}

export async function resyncAllMatches(): Promise<{ resynced: number }> {
  const pool = getSquadJSPool();

  const matches = await prisma.match.findMany({
    where: { squadjsId: { not: null } },
    select: { id: true, squadjsId: true },
  });

  let resynced = 0;
  for (const match of matches) {
    if (!match.squadjsId) continue;

    try {
      const assembled = await assembleMatchDetail(pool, match.squadjsId);
      if (!assembled) continue;

      await prisma.match.update({
        where: { id: match.id },
        data: {
          matchDetail: assembled.detail as unknown as Record<string, unknown>,
          map: assembled.meta.map,
          layer: assembled.meta.layer,
          result: assembled.meta.result,
        },
      });
      resynced++;
    } catch (err) {
      logger.error("match-sync", `Failed to resync match ${match.squadjsId}`, err);
    }
  }

  logger.info("match-sync", `Resynced ${resynced}/${matches.length} matches`);
  return { resynced };
}

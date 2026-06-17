import type { RowDataPacket } from "mysql2/promise";
import prisma from "./db";
import { getSquadJSPool } from "./squadjs-db";
import { logger } from "./logger";

interface SquadJSPlayerRow extends RowDataPacket {
  steam_id: string;
  eos_id: string;
}

/**
 * Backfills and keeps in sync the `eosId` on User records using the SquadJS
 * `squadjs_players` table, matched on Steam ID. Registered as a daily bootstrap job.
 *
 * Full sync: fills empty `eosId`s and overwrites stale ones when SquadJS reports a
 * different `eos_id` for the same Steam ID; matching values are left untouched.
 * `eosId` is unique, so a target already held by another user (stale/swapped data)
 * is logged and skipped (`conflicts`) rather than failing the run.
 */
export async function backfillUserEosIds(): Promise<{ updated: number; conflicts: number }> {
  const users = await prisma.user.findMany({
    where: { steamId: { not: null } },
    select: { id: true, steamId: true, eosId: true },
  });

  const steamIds = users.map((u) => u.steamId!).filter(Boolean);
  if (steamIds.length === 0) return { updated: 0, conflicts: 0 };

  // Look up EOS IDs for all member Steam IDs in one query. ORDER BY id ASC means the
  // highest-id (most recent) row wins when a steam_id appears on more than one row.
  const pool = getSquadJSPool();
  const [rows] = await pool.query<SquadJSPlayerRow[]>(
    `SELECT steam_id, eos_id
       FROM squadjs_players
      WHERE steam_id IN (?)
        AND eos_id IS NOT NULL
        AND eos_id != ''
      ORDER BY id ASC`,
    [steamIds]
  );

  const eosBySteamId = new Map<string, string>();
  for (const row of rows) eosBySteamId.set(row.steam_id, row.eos_id);

  let updated = 0;
  let conflicts = 0;
  for (const user of users) {
    const eosId = eosBySteamId.get(user.steamId!);
    if (!eosId || eosId === user.eosId) continue;
    try {
      await prisma.user.update({ where: { id: user.id }, data: { eosId } });
      updated++;
    } catch (err) {
      // P2002 = unique constraint: another user already holds this eosId. Skip it.
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        conflicts++;
        logger.warn("eos-backfill", `Skipped user ${user.id}: eosId ${eosId} already in use`);
      } else {
        throw err;
      }
    }
  }

  return { updated, conflicts };
}

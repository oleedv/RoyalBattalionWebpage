/**
 * Pure helpers for match scoreboard squad assignment.
 * Kept free of DB I/O so unit tests can cover fill/sort rules without a pool.
 */

export type SquadLookupEntry = { squadName: string; teamName: string | null };

export function squadKey(teamId: number | null | undefined, squadId: number | null | undefined): string {
  return `${teamId ?? "?"}-${squadId ?? "?"}`;
}

/** Build (teamId, squadId) -> name from rows that already have both id and name. */
export function buildSquadLookupFromNamedRows(
  rows: Iterable<{
    teamId: number | null;
    squadId: number | null;
    squadName: string | null;
    teamName?: string | null;
  }>
): Map<string, SquadLookupEntry> {
  const map = new Map<string, SquadLookupEntry>();
  for (const row of rows) {
    if (row.squadId == null || row.squadId === 0 || !row.squadName) continue;
    const key = squadKey(row.teamId, row.squadId);
    if (!map.has(key)) {
      map.set(key, { squadName: row.squadName, teamName: row.teamName ?? null });
    }
  }
  return map;
}

/** Merge creation-derived names only for keys the scoreboard lookup still lacks. */
export function mergeCreationLookup(
  lookup: Map<string, SquadLookupEntry>,
  creations: Iterable<{ teamId: number; squadId: number; squadName: string; teamName: string }>
): void {
  for (const row of creations) {
    const key = squadKey(row.teamId, row.squadId);
    if (!lookup.has(key)) {
      lookup.set(key, { squadName: row.squadName, teamName: row.teamName });
    }
  }
}

export interface ResolvedSquad {
  squadName: string;
  squadId: number | null;
}

/**
 * Resolve display squad for a scoreboard player.
 * Priority: scoreboard name → lookup by (team, squadId) → combat last squadId + lookup → Unassigned.
 */
export function resolveScoreboardSquad(
  teamId: number | null,
  squadId: number | null,
  squadName: string | null | undefined,
  lookup: Map<string, SquadLookupEntry>,
  lastCombatSquadId: number | null | undefined
): ResolvedSquad {
  if (squadName) {
    return { squadName, squadId: squadId ?? null };
  }

  if (squadId != null && squadId !== 0) {
    const filled = lookup.get(squadKey(teamId, squadId));
    if (filled?.squadName) {
      return { squadName: filled.squadName, squadId };
    }
    // Keep numeric identity even if name unknown — UI can show empty → Unassigned via toPlayerJson
    // Prefer a synthetic name so members still group together by id.
    return { squadName: `Squad ${squadId}`, squadId };
  }

  const combatId = lastCombatSquadId != null && lastCombatSquadId !== 0 ? lastCombatSquadId : null;
  if (combatId != null) {
    const filled = lookup.get(squadKey(teamId, combatId));
    if (filled?.squadName) {
      return { squadName: filled.squadName, squadId: combatId };
    }
    return { squadName: `Squad ${combatId}`, squadId: combatId };
  }

  return { squadName: "", squadId: null };
}

export interface SortableMatchPlayer {
  squadId: number | null | undefined;
  isSquadLeader: boolean;
  kills: number;
  name: string;
}

/** Sort: squadId asc (null last), SL first, kills desc, name asc. */
export function compareMatchPlayers(a: SortableMatchPlayer, b: SortableMatchPlayer): number {
  const aId = a.squadId == null ? Number.POSITIVE_INFINITY : a.squadId;
  const bId = b.squadId == null ? Number.POSITIVE_INFINITY : b.squadId;
  if (aId !== bId) return aId - bId;
  if (a.isSquadLeader !== b.isSquadLeader) return a.isSquadLeader ? -1 : 1;
  if (a.kills !== b.kills) return b.kills - a.kills;
  return a.name.localeCompare(b.name);
}

/** Return (teamId, squadId) keys with more than max members (default 9). */
export function findOversizedSquads(
  players: Iterable<{ teamId: number; squadId: number | null | undefined }>,
  max = 9
): Array<{ teamId: number; squadId: number; count: number }> {
  const counts = new Map<string, { teamId: number; squadId: number; count: number }>();
  for (const p of players) {
    if (p.squadId == null || p.squadId === 0) continue;
    const key = squadKey(p.teamId, p.squadId);
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { teamId: p.teamId, squadId: p.squadId, count: 1 });
  }
  return [...counts.values()].filter((c) => c.count > max);
}

/**
 * Track last non-null combat squad id per player identity key.
 * Call with each identity the event may be known as (steam, eos).
 */
export function noteLastCombatSquad(
  map: Map<string, { squadId: number; timeMs: number }>,
  identityKeys: Array<string | null | undefined>,
  squadId: number | null | undefined,
  time: Date | string | number | null | undefined
): void {
  if (squadId == null || squadId === 0) return;
  const timeMs =
    time == null
      ? 0
      : time instanceof Date
        ? time.getTime()
        : typeof time === "number"
          ? time
          : new Date(time).getTime();
  if (Number.isNaN(timeMs)) return;

  for (const key of identityKeys) {
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || timeMs >= prev.timeMs) {
      map.set(key, { squadId, timeMs });
    }
  }
}

export function lookupLastCombatSquad(
  map: Map<string, { squadId: number; timeMs: number }>,
  identityKeys: Array<string | null | undefined>
): number | null {
  let best: { squadId: number; timeMs: number } | null = null;
  for (const key of identityKeys) {
    if (!key) continue;
    const hit = map.get(key);
    if (!hit) continue;
    if (!best || hit.timeMs >= best.timeMs) best = hit;
  }
  return best?.squadId ?? null;
}

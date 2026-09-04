import type { Pool, RowDataPacket } from "mysql2/promise";
import { logger } from "./logger";
import {
  buildSquadLookupFromNamedRows,
  coalesceSquadNamesById,
  compareMatchPlayers,
  findOversizedSquads,
  lookupLastCombatSquad,
  mergeCreationLookup,
  noteLastCombatSquad,
  resolveScoreboardSquad,
  squadKey,
} from "./match-squad-utils";

// --- Raw SQL row interfaces ---

interface MatchRow extends RowDataPacket {
  id: number;
  server_id: number;
  dlc: string | null;
  mapClassname: string;
  layerClassname: string;
  map: string;
  layer: string;
  startTime: Date;
  endTime: Date | null;
  winner: string | null;
  serverName: string | null;
}

interface ScoreboardRow extends RowDataPacket {
  teamId: number;
  teamName: string;
  squadId: number | null;
  squadName: string | null;
  isLeader: number;
  role: string;
  eosID: string;
  steamID: string | null;
  playerName: string;
}

interface FactionRow extends RowDataPacket {
  teamName: string;
}

interface SquadDetailRow extends RowDataPacket {
  squadId: number | null;
  squadName: string;
  teamName: string;
  playerEOSID: string;
}

interface SpawnRow extends RowDataPacket {
  eosID: string;
  playerName: string;
  playerClassname: string;
  time: Date;
  spawnPointInstance: string | null;
}

interface DeathRow extends RowDataPacket {
  attackerTeamID: number;
  victimTeamID: number;
  teamkill: number;
  weapon: string | null;
  damage: string | null;
  attacker: string | null;
  attackerEosID: string | null;
  attackerName: string | null;
  attackerSquadID: number | null;
  victim: string | null;
  victimEosID: string | null;
  victimName: string | null;
  victimSquadID: number | null;
  time: Date | null;
}

interface ReviveRow extends RowDataPacket {
  reviver: string | null;
  reviverEosID: string | null;
  reviverName: string | null;
  reviverTeamID: number;
  reviverSquadID: number | null;
  time: Date | null;
}

interface PeakRow extends RowDataPacket {
  peak: number | null;
}

interface PlayerRow extends RowDataPacket {
  eosID: string;
  steamID: string | null;
  lastName: string;
}

export interface MatchDetailJson {
  duration: string;
  players: number;
  team1: MatchTeamJson;
  team2: MatchTeamJson;
  team1Players: MatchPlayerJson[];
  team2Players: MatchPlayerJson[];
}

export interface MatchTeamJson {
  faction: string;
  factionFull: string;
  result: "WIN" | "LOSS" | "DRAW";
}

export interface MatchPlayerJson {
  name: string;
  steamId: string;
  squad: string;
  squadId?: number | null;
  role: string;
  kills: number;
  deaths: number;
  revives: number;
  teamkills: number;
  isSquadLeader: boolean;
}

// --- Faction mapping ---

const FACTION_SHORT: Record<string, string> = {
  "United States Army": "USA",
  "United States Marine Corps": "USMC",
  "US Marine Corps": "USMC",
  "British Army": "BAF",
  "British Armed Forces": "BAF",
  "Canadian Armed Forces": "CAF",
  "Russian Ground Forces": "RUS",
  "Russian Airborne Forces": "VDV",
  "Russian Airborne": "VDV",
  "Middle Eastern Alliance": "MEA",
  "Middle Eastern Insurgents": "INS",
  "Insurgent Forces": "INS",
  "Insurgents": "INS",
  "Irregular Militia Forces": "MIL",
  "Irregular Militia": "MIL",
  "People's Liberation Army": "PLA",
  "People's Liberation Army Navy Marine Corps": "PLANMC",
  "PLA Navy Marine Corps": "PLANMC",
  "PLA Naval Marine Corps": "PLANMC",
  "PLA Amphibious Ground Force": "PLAAGF",
  "People's Liberation Army Amphibious Ground Force": "PLAAGF",
  "Australian Defence Force": "ADF",
  "Turkish Land Forces": "TLF",
  "Armed Forces of Ukraine": "AFU",
  "Ground Forces of Iran": "GFI",
  "Western Private Military Contractors": "WPMC",
  "Canadian Resistance Forces": "CRF",
};

/** Lowercased lookup so Squad log casing variants still shorten. */
const FACTION_SHORT_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(FACTION_SHORT).map(([k, v]) => [k.toLowerCase(), v])
);

function factionShort(full: string): string {
  if (!full) return full;
  // Already a short code (or unknown short token) — leave as-is
  if (full.length <= 6 && !full.includes(" ")) return full;
  return FACTION_SHORT[full] || FACTION_SHORT_LOWER[full.toLowerCase()] || full;
}

// --- Role name parser ---

const ROLE_MAP: Record<string, string> = {
  squadleader: "Squad Leader",
  rifleman: "Rifleman",
  medic: "Medic",
  autorifleman: "Automatic Rifleman",
  machinegunner: "Machine Gunner",
  marksman: "Marksman",
  hat: "HAT",
  lat: "LAT",
  grenadier: "Grenadier",
  engineer: "Engineer",
  combatengineer: "Combat Engineer",
  crewman: "Crewman",
  pilot: "Pilot",
  raider: "Raider",
  scout: "Scout",
  sapper: "Sapper",
  sniper: "Sniper",
  sl_crewman: "SL Crewman",
};

function parseRoleName(classname: string): string {
  if (!classname) return "Unknown";

  // Strip common prefixes/suffixes: BP_Soldier_USA_HAT_C -> HAT
  let raw = classname
    .replace(/^BP_Soldier_\w+?_/, "")
    .replace(/_C$/, "")
    .replace(/\d+$/, ""); // strip trailing numbers like Rifleman1

  const lower = raw.toLowerCase();
  for (const [key, label] of Object.entries(ROLE_MAP)) {
    if (lower.includes(key)) return label;
  }

  // Fallback: insert spaces before capitals
  return raw.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function parseScoreboardRole(role: string): string {
  if (!role) return "Rifleman";

  // If it looks like a classname, delegate to the classname parser
  if (role.startsWith("BP_") || role.includes("_Soldier_")) {
    return parseRoleName(role);
  }

  // Check if the role matches a known role directly
  const lower = role.toLowerCase();
  for (const [key, label] of Object.entries(ROLE_MAP)) {
    if (lower === key || lower === label.toLowerCase()) return label;
  }

  // Already a clean name - return as-is
  return role;
}

// --- Duration formatter ---

function formatDuration(startTime: Date, endTime: Date): string {
  const ms = endTime.getTime() - startTime.getTime();
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// --- Main assembly ---

export async function assembleMatchDetail(
  pool: Pool,
  matchId: number
): Promise<{
  meta: {
    startTime: Date;
    map: string;
    layer: string;
    serverName: string;
    result: string;
  };
  detail: MatchDetailJson;
} | null> {
  // 1. Match metadata
  const [matchRows] = await pool.query(
    `SELECT m.id, m.server_id, m.dlc, m.map_classname AS mapClassname,
            m.layer_classname AS layerClassname, m.map, m.layer,
            m.start_time AS startTime, m.end_time AS endTime, m.winner,
            s.name AS serverName
     FROM squadjs_matches m
     LEFT JOIN squadjs_servers s ON m.server_id = s.id
     WHERE m.id = ?`,
    [matchId]
  );
  const match = (matchRows as MatchRow[])[0];
  if (!match || !match.endTime) return null;

  // Skip training/jensen's range
  const layerLower = (match.layerClassname || "").toLowerCase();
  if (layerLower.includes("jensens") || layerLower.includes("jensen")) return null;

  // Skip very short matches (< 5 min)
  const durationMs =
    new Date(match.endTime).getTime() - new Date(match.startTime).getTime();
  if (durationMs < 5 * 60_000) return null;

  // 2. Scoreboard snapshot (authoritative end-of-round data)
  let scoreboard: ScoreboardRow[] = [];
  try {
    const [scoreboardRows] = await pool.query(
      `SELECT sb.team_id AS teamId, sb.team_name AS teamName,
              sb.squad_id AS squadId, sb.squad_name AS squadName,
              sb.is_leader AS isLeader, sb.role AS role,
              p.eos_id AS eosID, p.steam_id AS steamID, p.name AS playerName
       FROM squadjs_scoreboard sb
       JOIN squadjs_players p ON sb.player_id = p.id
       WHERE sb.match_id = ?`,
      [matchId]
    );
    scoreboard = scoreboardRows as ScoreboardRow[];
  } catch (err: unknown) {
    if ((err as { errno?: number })?.errno !== 1146) throw err;
  }
  const hasScoreboard = scoreboard.length > 0;

  // 3. Legacy queries -- only needed when scoreboard is not available
  let factions: string[] = [];
  let squadDetailRows: SquadDetailRow[] = [];
  let spawns: SpawnRow[] = [];

  if (!hasScoreboard) {
    // Squad creations -> faction per teamID
    const [squadRows] = await pool.query(
      "SELECT DISTINCT sc.team_name AS teamName FROM squadjs_squad_creations sc WHERE sc.match_id = ?",
      [matchId]
    );
    factions = (squadRows as FactionRow[]).map((r) => r.teamName);

    const [sqDetailRows] = await pool.query(
      `SELECT sc.squad_id AS squadId, sc.squad_name AS squadName,
              sc.team_name AS teamName, p.eos_id AS playerEOSID
       FROM squadjs_squad_creations sc
       JOIN squadjs_players p ON sc.player_id = p.id
       WHERE sc.match_id = ?
       ORDER BY sc.time ASC`,
      [matchId]
    );
    squadDetailRows = sqDetailRows as SquadDetailRow[];

    // Spawns (for role info)
    const [spawnRows] = await pool.query(
      `SELECT p.eos_id AS eosID, p.name AS playerName,
              s.player_classname AS playerClassname, s.time,
              s.spawn_point AS spawnPointInstance
       FROM squadjs_spawns s
       JOIN squadjs_players p ON s.player_id = p.id
       WHERE s.match_id = ? ORDER BY s.time ASC`,
      [matchId]
    );
    spawns = spawnRows as SpawnRow[];
  }

  // 4. Deaths (always needed for K/D/TK stats + last combat squad fallback)
  const [deathRows] = await pool.query(
    `SELECT ce.attacker_team_id AS attackerTeamID,
            ce.victim_team_id AS victimTeamID,
            ce.teamkill, ce.weapon, ce.damage, ce.time,
            ce.attacker_squad_id AS attackerSquadID,
            ce.victim_squad_id AS victimSquadID,
            ap.steam_id AS attacker, ap.eos_id AS attackerEosID, ap.name AS attackerName,
            vp.steam_id AS victim, vp.eos_id AS victimEosID, vp.name AS victimName
     FROM squadjs_combat_events ce
     LEFT JOIN squadjs_players ap ON ce.attacker_id = ap.id
     LEFT JOIN squadjs_players vp ON ce.victim_id = vp.id
     WHERE ce.match_id = ? AND ce.event_type = 'death'`,
    [matchId]
  );
  const deaths = deathRows as DeathRow[];

  // 5. Revives (always needed)
  const [reviveRows] = await pool.query(
    `SELECT rp.steam_id AS reviver, rp.eos_id AS reviverEosID, rp.name AS reviverName,
            ce.reviver_team_id AS reviverTeamID,
            ce.reviver_squad_id AS reviverSquadID,
            ce.time
     FROM squadjs_combat_events ce
     LEFT JOIN squadjs_players rp ON ce.reviver_id = rp.id
     WHERE ce.match_id = ? AND ce.event_type = 'revive'`,
    [matchId]
  );
  const revives = reviveRows as ReviveRow[];

  // 6. Peak player count
  const [pcRows] = await pool.query(
    "SELECT MAX(players) AS peak FROM squadjs_player_counts WHERE match_id = ?",
    [matchId]
  );
  const peakPlayers = (pcRows as PeakRow[])[0]?.peak || 0;

  // 7. Player mapping (eosID <-> steamID)
  const [playerRows] = await pool.query(
    "SELECT eos_id AS eosID, steam_id AS steamID, name AS lastName FROM squadjs_players"
  );
  const eosBysteam = new Map<string, string>();
  const steamByEos = new Map<string, string>();
  const nameByEos = new Map<string, string>();
  for (const p of playerRows as PlayerRow[]) {
    if (p.steamID) {
      eosBysteam.set(p.steamID, p.eosID);
      steamByEos.set(p.eosID, p.steamID);
    }
    nameByEos.set(p.eosID, p.lastName);
  }

  // --- Build team faction mapping ---
  const teamFactions = new Map<number, string>(); // teamID -> faction name

  if (hasScoreboard) {
    // Scoreboard gives us team_id -> team_name directly
    for (const row of scoreboard) {
      if (row.teamId && row.teamName && !teamFactions.has(row.teamId)) {
        teamFactions.set(row.teamId, row.teamName);
      }
    }

    // Fallback: derive team_name from squad_creations when scoreboard didn't
    // capture it (happens for players whose squad wasn't resolved at ROUND_ENDED).
    if (teamFactions.size < 2) {
      const [sqTeamRows] = await pool.query(
        `SELECT DISTINCT team_name AS teamName FROM squadjs_squad_creations WHERE match_id = ?`,
        [matchId]
      );
      const creationFactions = (sqTeamRows as FactionRow[]).map((r) => r.teamName);
      if (creationFactions.length >= 1 && !teamFactions.has(1)) {
        teamFactions.set(1, creationFactions[0]);
      }
      if (creationFactions.length >= 2 && !teamFactions.has(2)) {
        teamFactions.set(2, creationFactions[1]);
      }
    }
  } else {
    // Legacy: cross-reference squad creations with deaths/spawns to map factions to team IDs
    for (const sq of squadDetailRows) {
      const eosID = sq.playerEOSID;
      const faction = sq.teamName;

      const asAttacker = deaths.find(
        (d) => d.attacker === steamByEos.get(eosID) || d.attacker === eosID || d.attackerEosID === eosID
      );
      const asVictim = deaths.find(
        (d) => d.victim === steamByEos.get(eosID) || d.victim === eosID || d.victimEosID === eosID
      );

      if (asAttacker && !teamFactions.has(asAttacker.attackerTeamID)) {
        teamFactions.set(asAttacker.attackerTeamID, faction);
      }
      if (asVictim && !teamFactions.has(asVictim.victimTeamID)) {
        teamFactions.set(asVictim.victimTeamID, faction);
      }

      const spawn = spawns.find((s) => s.eosID === eosID);
      if (spawn) {
        const spawnPoint = spawn.spawnPointInstance || "";
        if (spawnPoint.includes("Team1") && !teamFactions.has(1)) {
          teamFactions.set(1, faction);
        } else if (spawnPoint.includes("Team2") && !teamFactions.has(2)) {
          teamFactions.set(2, faction);
        }
      }
    }

    // Fallback: assign factions by order
    if (factions.length >= 2) {
      if (!teamFactions.has(1)) teamFactions.set(1, factions[0]);
      if (!teamFactions.has(2)) teamFactions.set(2, factions[1]);
    } else if (factions.length === 1) {
      if (!teamFactions.has(1)) teamFactions.set(1, factions[0]);
      if (!teamFactions.has(2)) teamFactions.set(2, "Unknown");
    }
  }

  const team1Faction = teamFactions.get(1) || "Unknown";
  const team2Faction = teamFactions.get(2) || "Unknown";

  // --- Determine winner ---
  // The winner column can hold several shapes depending on what Squad's
  // DetermineMatchWinner() log printed:
  //   - A literal team id, e.g. "Team 1" / "Team 2"
  //   - A full faction name, e.g. "United States Army"
  //   - A short faction code, e.g. "USA"
  //   - A raw team-id number, e.g. "1"
  // Values are JSON.stringify'd by the SquadJS db-log plugin, hence the quote strip.
  // Resolve winner. Handles three on-disk shapes:
  //   - New JSON payload written by db-log.js onRoundEnded:
  //       {"team":1,"subfaction":"X","faction":"Y"}
  //   - Legacy JSON.stringify(string) — a DetermineMatchWinner() subfaction
  //     (e.g. `"3rd Brigade Battle Group"`). These are OFF BY ONE: the winner
  //     of match N is actually stored in match N+1's winner column, because
  //     Squad logs DetermineMatchWinner() after the NEW_GAME transition.
  //   - A raw team-id like "Team 1" / "1" (structured payload parse path).
  function resolveWinner(raw: string): 0 | 1 | 2 {
    if (!raw) return 0;
    const stripped = raw.replace(/^"|"$/g, "").trim();
    // JSON payload from new ROUND_ENDED writer
    if (stripped.startsWith("{")) {
      try {
        const obj = JSON.parse(stripped);
        const t = Number(obj?.team);
        if (t === 1 || t === 2) return t;
      } catch {
        // fall through to string matching
      }
    }
    const teamIdMatch = stripped.match(/^(?:team\s*)?(\d+)$/i);
    if (teamIdMatch) {
      const id = parseInt(teamIdMatch[1], 10);
      if (id === 1 || id === 2) return id;
    }
    if (stripped === team1Faction || stripped === factionShort(team1Faction)) return 1;
    if (stripped === team2Faction || stripped === factionShort(team2Faction)) return 2;
    const wLower = stripped.toLowerCase();
    for (const [teamId, faction] of teamFactions.entries()) {
      const fLower = faction.toLowerCase();
      const shortLower = factionShort(faction).toLowerCase();
      if (
        wLower === fLower ||
        wLower === shortLower ||
        wLower.includes(fLower) ||
        fLower.includes(wLower)
      ) {
        if (teamId === 1 || teamId === 2) return teamId;
      }
    }
    return 0;
  }

  const winnerRaw = (match.winner || "").replace(/"/g, "").trim();
  let winningTeamId: 0 | 1 | 2 = resolveWinner(match.winner || "");

  // Legacy-data fallback: pre-fix db-log.js wrote match N-1's winner into
  // match N's column. If the stored winner doesn't match this match's teams,
  // check the next match's winner -- that's where match N's actual winner lives.
  if (winningTeamId === 0 && winnerRaw) {
    const [nextRows] = await pool.query(
      `SELECT winner FROM squadjs_matches
       WHERE server_id = ? AND start_time > ? AND end_time IS NOT NULL
       ORDER BY start_time ASC LIMIT 1`,
      [match.server_id, match.startTime]
    );
    const nextWinner = (nextRows as { winner: string | null }[])[0]?.winner;
    if (nextWinner) {
      // Don't apply the shift-fallback when the next match is already using the
      // new JSON format (that one describes its OWN match, not a shifted one).
      const nextStripped = nextWinner.replace(/^"|"$/g, "").trim();
      if (!nextStripped.startsWith("{")) {
        winningTeamId = resolveWinner(nextWinner);
      }
    }
  }

  const team1Result: "WIN" | "LOSS" | "DRAW" =
    winningTeamId === 1 ? "WIN" : winningTeamId === 2 ? "LOSS" : "DRAW";
  const team2Result: "WIN" | "LOSS" | "DRAW" =
    winningTeamId === 2 ? "WIN" : winningTeamId === 1 ? "LOSS" : "DRAW";

  // --- Build player stats ---
  interface PlayerStats {
    name: string;
    steamId: string;
    teamId: number;
    squad: string;
    squadId: number | null;
    role: string;
    kills: number;
    deaths: number;
    revives: number;
    teamkills: number;
    isSquadLeader: boolean;
  }

  const playerMap = new Map<string, PlayerStats>();
  // Secondary index: eosID / alternate steam keys → primary map key (for combat stats)
  const identityToKey = new Map<string, string>();

  function createPlayer(steamId: string, name: string, teamId: number): PlayerStats {
    const p: PlayerStats = {
      name,
      steamId,
      teamId,
      squad: "",
      squadId: null,
      role: "Rifleman",
      kills: 0,
      deaths: 0,
      revives: 0,
      teamkills: 0,
      isSquadLeader: false,
    };
    playerMap.set(steamId, p);
    identityToKey.set(steamId, steamId);
    return p;
  }

  function getOrCreate(steamId: string, name: string, teamId: number): PlayerStats {
    let p = playerMap.get(steamId);
    if (!p) {
      p = createPlayer(steamId, name, teamId);
    }
    if (teamId && !p.teamId) p.teamId = teamId;
    return p;
  }

  /** Only update stats for players already on the roster (scoreboard path). */
  function getExisting(...ids: Array<string | null | undefined>): PlayerStats | undefined {
    for (const id of ids) {
      if (!id) continue;
      const key = identityToKey.get(id) ?? (playerMap.has(id) ? id : undefined);
      if (key) {
        const p = playerMap.get(key);
        if (p) return p;
      }
    }
    return undefined;
  }

  // Last non-null combat squad id per identity (for scoreboard rows missing squad_id)
  const lastCombatSquad = new Map<string, { squadId: number; timeMs: number }>();
  for (const d of deaths) {
    noteLastCombatSquad(
      lastCombatSquad,
      [d.attacker, d.attackerEosID],
      d.attackerSquadID,
      d.time
    );
    noteLastCombatSquad(
      lastCombatSquad,
      [d.victim, d.victimEosID],
      d.victimSquadID,
      d.time
    );
  }
  for (const r of revives) {
    noteLastCombatSquad(
      lastCombatSquad,
      [r.reviver, r.reviverEosID],
      r.reviverSquadID,
      r.time
    );
  }

  // Populate roster + squad/role from scoreboard or legacy sources
  if (hasScoreboard) {
    // Scoreboard-only roster: only players connected at ROUND_ENDED.
    const squadLookup = buildSquadLookupFromNamedRows(
      scoreboard.map((sb) => ({
        teamId: sb.teamId,
        squadId: sb.squadId,
        squadName: sb.squadName,
        teamName: sb.teamName,
      }))
    );

    // Secondary fallback: squadjs_squad_creations for (team, squad_id) still missing names.
    const [sqCreationRows] = await pool.query(
      `SELECT squad_id AS squadId, squad_name AS squadName, team_name AS teamName, time
       FROM squadjs_squad_creations
       WHERE match_id = ?
       ORDER BY time ASC`,
      [matchId]
    );
    type SqCreationRow = RowDataPacket & {
      squadId: number;
      squadName: string | null;
      teamName: string | null;
    };
    const factionToTeamId = new Map<string, number>();
    for (const [tid, faction] of teamFactions.entries()) {
      factionToTeamId.set(faction, tid);
    }
    // Collapse creations to the most recent squad_name per (team, squad_id)
    // (squad ids get reused when an SL disbands and another is created).
    const latestCreation: Array<{
      teamId: number;
      squadId: number;
      squadName: string;
      teamName: string;
    }> = [];
    const creationSeen = new Map<string, { teamId: number; squadId: number; squadName: string; teamName: string }>();
    for (const row of sqCreationRows as SqCreationRow[]) {
      const tid = row.teamName ? factionToTeamId.get(row.teamName) : undefined;
      if (!tid || !row.squadId || !row.squadName) continue;
      creationSeen.set(squadKey(tid, row.squadId), {
        teamId: tid,
        squadId: row.squadId,
        squadName: row.squadName,
        teamName: row.teamName!,
      });
    }
    for (const val of creationSeen.values()) latestCreation.push(val);
    mergeCreationLookup(squadLookup, latestCreation);

    for (const sb of scoreboard) {
      const steamId = sb.steamID || steamByEos.get(sb.eosID) || sb.eosID;
      const name = sb.playerName || nameByEos.get(sb.eosID) || "Unknown";
      if (playerMap.has(steamId)) {
        // Dedup scoreboard rows (unique match_id+player_id normally); keep first
        continue;
      }
      const p = createPlayer(steamId, name, sb.teamId ?? 0);
      if (sb.eosID) identityToKey.set(sb.eosID, steamId);
      if (sb.steamID) identityToKey.set(sb.steamID, steamId);

      const combatSquadId = lookupLastCombatSquad(lastCombatSquad, [
        steamId,
        sb.steamID,
        sb.eosID,
      ]);
      const resolved = resolveScoreboardSquad(
        sb.teamId,
        sb.squadId,
        sb.squadName,
        squadLookup,
        combatSquadId
      );
      p.teamId = sb.teamId ?? 0;
      p.squad = resolved.squadName;
      p.squadId = resolved.squadId;
      p.isSquadLeader = !!sb.isLeader;
      p.role = parseScoreboardRole(sb.role);
    }

    // Full-match stats only for final roster players
    for (const d of deaths) {
      const attacker = getExisting(d.attacker, d.attackerEosID);
      if (attacker) {
        attacker.kills++;
        if (d.teamkill) attacker.teamkills++;
      }
      const victim = getExisting(d.victim, d.victimEosID);
      if (victim) victim.deaths++;
    }
    for (const r of revives) {
      const reviver = getExisting(r.reviver, r.reviverEosID);
      if (reviver) reviver.revives++;
    }

    coalesceSquadNamesById(playerMap.values());

    for (const oversized of findOversizedSquads(playerMap.values(), 9)) {
      logger.warn("match-assembler", "Scoreboard squad exceeds 9 players (soft check)", {
        matchId,
        teamId: oversized.teamId,
        squadId: oversized.squadId,
        count: oversized.count,
      });
    }
  } else {
    // Legacy: deaths/revives create the roster
    for (const d of deaths) {
      const attackerSteam = d.attacker || d.attackerEosID;
      const victimSteam = d.victim || d.victimEosID;

      if (attackerSteam) {
        const attacker = getOrCreate(
          attackerSteam,
          d.attackerName || "Unknown",
          d.attackerTeamID
        );
        attacker.kills++;
        if (d.teamkill) attacker.teamkills++;
      }

      if (victimSteam) {
        const victim = getOrCreate(
          victimSteam,
          d.victimName || "Unknown",
          d.victimTeamID
        );
        victim.deaths++;
      }
    }

    for (const r of revives) {
      const reviverSteam = r.reviver || r.reviverEosID;
      if (reviverSteam) {
        const reviver = getOrCreate(
          reviverSteam,
          r.reviverName || "Unknown",
          r.reviverTeamID
        );
        reviver.revives++;
      }
    }

    // Legacy: use spawns for roles
    for (const s of spawns) {
      const steamId = steamByEos.get(s.eosID) || s.eosID;
      const name = s.playerName || nameByEos.get(s.eosID) || "Unknown";

      let teamId = 0;
      const sp = s.spawnPointInstance || "";
      if (sp.includes("Team1")) teamId = 1;
      else if (sp.includes("Team2")) teamId = 2;

      const p = getOrCreate(steamId, name, teamId);
      p.role = parseRoleName(s.playerClassname);
      p.isSquadLeader = p.role === "Squad Leader" || p.role === "SL Crewman";
    }

    // Legacy: squad creations name the creator (SL) and seed (team, squadId) lookup.
    // Non-SL members usually never appear in creations — fill them from last combat squad_id.
    const creationLookup = new Map<
      string,
      { squadName: string; teamName: string | null; squadId: number }
    >();
    // Latest creation wins per (team, squadId) when squad numbers are reused mid-match.
    for (const sq of squadDetailRows) {
      let teamId = 0;
      for (const [tid, faction] of teamFactions.entries()) {
        if (faction === sq.teamName) {
          teamId = tid;
          break;
        }
      }
      if (!teamId || !sq.squadId || !sq.squadName) continue;
      creationLookup.set(squadKey(teamId, sq.squadId), {
        squadName: sq.squadName,
        teamName: sq.teamName,
        squadId: sq.squadId,
      });
    }

    for (const sq of squadDetailRows) {
      const eosID = sq.playerEOSID;
      const steamId = steamByEos.get(eosID) || eosID;
      const name = nameByEos.get(eosID) || "Unknown";

      let teamId = 0;
      for (const [tid, faction] of teamFactions.entries()) {
        if (faction === sq.teamName) {
          teamId = tid;
          break;
        }
      }

      const p = getOrCreate(steamId, name, teamId);
      if (eosID) identityToKey.set(eosID, steamId);
      identityToKey.set(steamId, steamId);
      p.squad = sq.squadName || p.squad;
      if (sq.squadId) p.squadId = sq.squadId;
      p.isSquadLeader = true;
    }

    // Resolve remaining teamId=0 players from deaths data
    for (const [, p] of playerMap) {
      if (p.teamId !== 0) continue;

      const asAttacker = deaths.find((d) => d.attacker === p.steamId);
      if (asAttacker?.attackerTeamID) {
        p.teamId = asAttacker.attackerTeamID;
        continue;
      }

      const asVictim = deaths.find((d) => d.victim === p.steamId);
      if (asVictim?.victimTeamID) {
        p.teamId = asVictim.victimTeamID;
      }
    }

    // Fill non-SL / unassigned players from last combat squad_id + creation names.
    // Without a scoreboard snapshot this is the only way members land in squads.
    const legacyLookup = new Map<string, { squadName: string; teamName: string | null }>();
    for (const [key, v] of creationLookup) {
      legacyLookup.set(key, { squadName: v.squadName, teamName: v.teamName });
    }

    for (const p of playerMap.values()) {
      const combatSquadId = lookupLastCombatSquad(lastCombatSquad, [p.steamId]);
      const resolved = resolveScoreboardSquad(
        p.teamId || null,
        p.squadId,
        p.squad || null,
        legacyLookup,
        combatSquadId
      );
      if (resolved.squadName) {
        p.squad = resolved.squadName;
        p.squadId = resolved.squadId;
      } else if (p.squad && p.squadId == null && combatSquadId != null) {
        p.squadId = combatSquadId;
      }
    }

    coalesceSquadNamesById(playerMap.values());
  }

  // Split players into teams: squadId order, SL first, kills (scoreboard + legacy fill)
  const allPlayers = Array.from(playerMap.values());
  const sortFn = compareMatchPlayers;
  const team1Players: MatchPlayerJson[] = allPlayers
    .filter((p) => p.teamId === 1)
    .sort(sortFn)
    .map(toPlayerJson);
  const team2Players: MatchPlayerJson[] = allPlayers
    .filter((p) => p.teamId === 2)
    .sort(sortFn)
    .map(toPlayerJson);

  // Skip matches with no players
  if (team1Players.length === 0 && team2Players.length === 0) return null;

  // --- Build map/layer names ---
  const mapName =
    match.map || humanizeClassname(match.mapClassname);
  const layerName =
    match.layer || match.layerClassname;

  // --- Determine top-level result (from perspective of "our" clan) ---
  // For the top-level Match.result, we use the winner as-is
  let topResult = "Draw";
  if (team1Result === "WIN") topResult = "Win";
  else if (team2Result === "WIN") topResult = "Loss";
  // Note: This is arbitrary without knowing "which team is us"
  // The winner faction name is stored for display

  const detail: MatchDetailJson = {
    duration: formatDuration(new Date(match.startTime), new Date(match.endTime)),
    players: peakPlayers,
    team1: {
      faction: factionShort(team1Faction),
      factionFull: team1Faction,
      result: team1Result,
    },
    team2: {
      faction: factionShort(team2Faction),
      factionFull: team2Faction,
      result: team2Result,
    },
    team1Players,
    team2Players,
  };

  return {
    meta: {
      startTime: new Date(match.startTime),
      map: mapName,
      layer: layerName,
      serverName: match.serverName || "Unknown Server",
      result: topResult,
    },
    detail,
  };
}

function toPlayerJson(p: {
  name: string;
  steamId: string;
  squad: string;
  squadId?: number | null;
  role: string;
  kills: number;
  deaths: number;
  revives: number;
  teamkills: number;
  isSquadLeader: boolean;
}): MatchPlayerJson {
  return {
    name: p.name,
    steamId: p.steamId,
    squad: p.squad || "Unassigned",
    squadId: p.squadId ?? null,
    role: p.role,
    kills: p.kills,
    deaths: p.deaths,
    revives: p.revives,
    teamkills: p.teamkills,
    isSquadLeader: p.isSquadLeader,
  };
}

function humanizeClassname(classname: string): string {
  if (!classname) return "Unknown";
  return classname
    .replace(/^SEC_?\d*_?/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

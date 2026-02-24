import type { Pool } from "mysql2/promise";

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
  "British Army": "BAF",
  "British Armed Forces": "BAF",
  "Canadian Armed Forces": "CAF",
  "Russian Ground Forces": "RUS",
  "Russian Airborne Forces": "VDV",
  "Middle Eastern Alliance": "MEA",
  "Middle Eastern Insurgents": "INS",
  "Insurgent Forces": "INS",
  "Irregular Militia Forces": "MIL",
  "People's Liberation Army": "PLA",
  "People's Liberation Army Navy Marine Corps": "PLANMC",
  "Australian Defence Force": "ADF",
  "Turkish Land Forces": "TLF",
};

function factionShort(full: string): string {
  return FACTION_SHORT[full] || full;
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
  const match = (matchRows as any[])[0];
  if (!match || !match.endTime) return null;

  // Skip training/jensen's range
  const layerLower = (match.layerClassname || "").toLowerCase();
  if (layerLower.includes("jensens") || layerLower.includes("jensen")) return null;

  // Skip very short matches (< 5 min)
  const durationMs =
    new Date(match.endTime).getTime() - new Date(match.startTime).getTime();
  if (durationMs < 5 * 60_000) return null;

  // 2. Scoreboard snapshot (authoritative end-of-round data)
  let scoreboard: any[] = [];
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
    scoreboard = scoreboardRows as any[];
  } catch (err: any) {
    if (err?.errno !== 1146) throw err;
  }
  const hasScoreboard = scoreboard.length > 0;

  // 3. Legacy queries -- only needed when scoreboard is not available
  let factions: string[] = [];
  let squadDetailRows: any[] = [];
  let spawns: any[] = [];

  if (!hasScoreboard) {
    // Squad creations -> faction per teamID
    const [squadRows] = await pool.query(
      "SELECT DISTINCT sc.team_name AS teamName FROM squadjs_squad_creations sc WHERE sc.match_id = ?",
      [matchId]
    );
    factions = (squadRows as any[]).map((r: any) => r.teamName as string);

    const [sqDetailRows] = await pool.query(
      `SELECT sc.squad_name AS squadName, sc.team_name AS teamName, p.eos_id AS playerEOSID
       FROM squadjs_squad_creations sc
       JOIN squadjs_players p ON sc.player_id = p.id
       WHERE sc.match_id = ?`,
      [matchId]
    );
    squadDetailRows = sqDetailRows as any[];

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
    spawns = spawnRows as any[];
  }

  // 4. Deaths (always needed for K/D/TK stats)
  const [deathRows] = await pool.query(
    `SELECT ce.attacker_team_id AS attackerTeamID,
            ce.victim_team_id AS victimTeamID,
            ce.teamkill, ce.weapon, ce.damage,
            ap.steam_id AS attacker, ap.eos_id AS attackerEosID, ap.name AS attackerName,
            vp.steam_id AS victim, vp.eos_id AS victimEosID, vp.name AS victimName
     FROM squadjs_combat_events ce
     LEFT JOIN squadjs_players ap ON ce.attacker_id = ap.id
     LEFT JOIN squadjs_players vp ON ce.victim_id = vp.id
     WHERE ce.match_id = ? AND ce.event_type = 'death'`,
    [matchId]
  );
  const deaths = deathRows as any[];

  // 5. Revives (always needed)
  const [reviveRows] = await pool.query(
    `SELECT rp.steam_id AS reviver, rp.eos_id AS reviverEosID, rp.name AS reviverName,
            ce.reviver_team_id AS reviverTeamID
     FROM squadjs_combat_events ce
     LEFT JOIN squadjs_players rp ON ce.reviver_id = rp.id
     WHERE ce.match_id = ? AND ce.event_type = 'revive'`,
    [matchId]
  );
  const revives = reviveRows as any[];

  // 6. Peak player count
  const [pcRows] = await pool.query(
    "SELECT MAX(players) AS peak FROM squadjs_player_counts WHERE match_id = ?",
    [matchId]
  );
  const peakPlayers = (pcRows as any[])[0]?.peak || 0;

  // 7. Player mapping (eosID <-> steamID)
  const [playerRows] = await pool.query(
    "SELECT eos_id AS eosID, steam_id AS steamID, name AS lastName FROM squadjs_players"
  );
  const eosBysteam = new Map<string, string>();
  const steamByEos = new Map<string, string>();
  const nameByEos = new Map<string, string>();
  for (const p of playerRows as any[]) {
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
  } else {
    // Legacy: cross-reference squad creations with deaths/spawns to map factions to team IDs
    for (const sq of squadDetailRows) {
      const eosID = sq.playerEOSID;
      const faction = sq.teamName;

      const asAttacker = deaths.find(
        (d: any) => d.attacker === steamByEos.get(eosID) || d.attacker === eosID || d.attackerEosID === eosID
      );
      const asVictim = deaths.find(
        (d: any) => d.victim === steamByEos.get(eosID) || d.victim === eosID || d.victimEosID === eosID
      );

      if (asAttacker && !teamFactions.has(asAttacker.attackerTeamID)) {
        teamFactions.set(asAttacker.attackerTeamID, faction);
      }
      if (asVictim && !teamFactions.has(asVictim.victimTeamID)) {
        teamFactions.set(asVictim.victimTeamID, faction);
      }

      const spawn = spawns.find((s: any) => s.eosID === eosID);
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
  const winnerRaw = (match.winner || "").replace(/"/g, "").trim();
  let team1Result: "WIN" | "LOSS" | "DRAW" = "DRAW";
  let team2Result: "WIN" | "LOSS" | "DRAW" = "DRAW";

  if (winnerRaw) {
    // The winner field contains a faction name -- match against both teams
    if (winnerRaw === team1Faction || winnerRaw === factionShort(team1Faction)) {
      team1Result = "WIN";
      team2Result = "LOSS";
    } else if (winnerRaw === team2Faction || winnerRaw === factionShort(team2Faction)) {
      team1Result = "LOSS";
      team2Result = "WIN";
    } else {
      // Winner doesn't match known factions directly -- could be a subunit name
      // Try partial match
      for (const [teamId, faction] of teamFactions.entries()) {
        if (
          winnerRaw.toLowerCase().includes(faction.toLowerCase()) ||
          faction.toLowerCase().includes(winnerRaw.toLowerCase())
        ) {
          if (teamId === 1) {
            team1Result = "WIN";
            team2Result = "LOSS";
          } else {
            team1Result = "LOSS";
            team2Result = "WIN";
          }
          break;
        }
      }
    }
  }

  // --- Build player stats ---
  interface PlayerStats {
    name: string;
    steamId: string;
    teamId: number;
    squad: string;
    role: string;
    kills: number;
    deaths: number;
    revives: number;
    teamkills: number;
    isSquadLeader: boolean;
  }

  const playerMap = new Map<string, PlayerStats>();

  function getOrCreate(steamId: string, name: string, teamId: number): PlayerStats {
    let p = playerMap.get(steamId);
    if (!p) {
      p = {
        name,
        steamId,
        teamId,
        squad: "",
        role: "Rifleman",
        kills: 0,
        deaths: 0,
        revives: 0,
        teamkills: 0,
        isSquadLeader: false,
      };
      playerMap.set(steamId, p);
    }
    if (teamId && !p.teamId) p.teamId = teamId;
    return p;
  }

  // Process deaths for kills/deaths/TKs (always runs)
  for (const d of deaths) {
    const attackerSteam = d.attacker || d.attackerEosID;
    const victimSteam = d.victim || d.victimEosID;

    if (attackerSteam) {
      const attacker = getOrCreate(attackerSteam, d.attackerName, d.attackerTeamID);
      attacker.kills++;
      if (d.teamkill) attacker.teamkills++;
    }

    if (victimSteam) {
      const victim = getOrCreate(victimSteam, d.victimName, d.victimTeamID);
      victim.deaths++;
    }
  }

  // Process revives (always runs)
  for (const r of revives) {
    const reviverSteam = r.reviver || r.reviverEosID;
    if (reviverSteam) {
      const reviver = getOrCreate(reviverSteam, r.reviverName, r.reviverTeamID);
      reviver.revives++;
    }
  }

  // Populate team/squad/role from scoreboard or legacy sources
  if (hasScoreboard) {
    for (const sb of scoreboard) {
      const steamId = sb.steamID || steamByEos.get(sb.eosID) || sb.eosID;
      const name = sb.playerName || nameByEos.get(sb.eosID) || "Unknown";
      const p = getOrCreate(steamId, name, sb.teamId);

      // Scoreboard data is authoritative -- overwrite any prior values
      p.teamId = sb.teamId;
      p.squad = sb.squadName || "";
      p.isSquadLeader = !!sb.isLeader;
      p.role = parseScoreboardRole(sb.role);
    }
  } else {
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

    // Legacy: use squad creations for squad names
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
      p.squad = sq.squadName;
      p.isSquadLeader = true;
    }
  }

  // Resolve remaining teamId=0 players from deaths data (always runs)
  for (const [steamId, p] of playerMap) {
    if (p.teamId !== 0) continue;

    const asAttacker = deaths.find((d: any) => d.attacker === steamId);
    if (asAttacker?.attackerTeamID) {
      p.teamId = asAttacker.attackerTeamID;
      continue;
    }

    const asVictim = deaths.find((d: any) => d.victim === steamId);
    if (asVictim?.victimTeamID) {
      p.teamId = asVictim.victimTeamID;
      continue;
    }
  }

  // Split players into teams
  const allPlayers = Array.from(playerMap.values());
  const team1Players: MatchPlayerJson[] = allPlayers
    .filter((p) => p.teamId === 1)
    .sort((a, b) => b.kills - a.kills)
    .map(toPlayerJson);
  const team2Players: MatchPlayerJson[] = allPlayers
    .filter((p) => p.teamId === 2)
    .sort((a, b) => b.kills - a.kills)
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

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
    "SELECT m.*, s.name as serverName FROM DBLog_Matches m LEFT JOIN DBLog_Servers s ON m.server = s.id WHERE m.id = ?",
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

  // 2. Squad creations -> faction per teamID
  const [squadRows] = await pool.query(
    "SELECT DISTINCT teamName FROM DBLog_SquadCreations WHERE `match` = ?",
    [matchId]
  );
  const factions = (squadRows as any[]).map((r: any) => r.teamName as string);

  // Also get squad assignments per player
  const [squadDetailRows] = await pool.query(
    "SELECT squadName, teamName, playerEOSID FROM DBLog_SquadCreations WHERE `match` = ?",
    [matchId]
  );

  // 3. Deaths
  const [deathRows] = await pool.query(
    "SELECT * FROM DBLog_Deaths WHERE `match` = ?",
    [matchId]
  );
  const deaths = deathRows as any[];

  // 4. Revives
  const [reviveRows] = await pool.query(
    "SELECT * FROM DBLog_Revives WHERE `match` = ?",
    [matchId]
  );
  const revives = reviveRows as any[];

  // 5. Spawns (for role info)
  const [spawnRows] = await pool.query(
    "SELECT eosID, playerName, playerClassname, time FROM DBLog_Spawns WHERE `match` = ? ORDER BY time ASC",
    [matchId]
  );
  const spawns = spawnRows as any[];

  // 6. Peak player count
  const [pcRows] = await pool.query(
    "SELECT MAX(players) as peak FROM DBLog_PlayerCounts WHERE `match` = ?",
    [matchId]
  );
  const peakPlayers = (pcRows as any[])[0]?.peak || 0;

  // 7. Player mapping (eosID <-> steamID)
  const [playerRows] = await pool.query("SELECT eosID, steamID, lastName FROM DBLog_Players");
  const eosBysteam = new Map<string, string>();
  const steamByEos = new Map<string, string>();
  const nameByEos = new Map<string, string>();
  for (const p of playerRows as any[]) {
    eosBysteam.set(p.steamID, p.eosID);
    steamByEos.set(p.eosID, p.steamID);
    nameByEos.set(p.eosID, p.lastName);
  }

  // --- Build team faction mapping ---
  // Use SquadCreations to figure out which factions map to which teamID
  // Deaths have attackerTeamID / victimTeamID, so cross-reference
  const teamFactions = new Map<number, string>(); // teamID -> faction name

  // From squad creations, correlate with spawns/deaths teamIDs
  for (const sq of squadDetailRows as any[]) {
    const eosID = sq.playerEOSID;
    const faction = sq.teamName;

    // Find this player's teamID from deaths
    const asAttacker = deaths.find(
      (d: any) => d.attacker === steamByEos.get(eosID) || d.attacker === eosID
    );
    const asVictim = deaths.find(
      (d: any) => d.victim === steamByEos.get(eosID) || d.victim === eosID
    );

    if (asAttacker && !teamFactions.has(asAttacker.attackerTeamID)) {
      teamFactions.set(asAttacker.attackerTeamID, faction);
    }
    if (asVictim && !teamFactions.has(asVictim.victimTeamID)) {
      teamFactions.set(asVictim.victimTeamID, faction);
    }

    // Also check spawns for teamID context
    const spawn = spawns.find((s: any) => s.eosID === eosID);
    if (spawn) {
      // Spawns don't have teamID directly, but spawnPointInstance has Team1/Team2
      const spawnPoint = spawn.spawnPointInstance || "";
      if (spawnPoint.includes("Team1") && !teamFactions.has(1)) {
        teamFactions.set(1, faction);
      } else if (spawnPoint.includes("Team2") && !teamFactions.has(2)) {
        teamFactions.set(2, faction);
      }
    }
  }

  // Fallback: if we still don't have both teams, assign factions by order
  if (factions.length >= 2) {
    if (!teamFactions.has(1)) teamFactions.set(1, factions[0]);
    if (!teamFactions.has(2)) teamFactions.set(2, factions[1]);
  } else if (factions.length === 1) {
    if (!teamFactions.has(1)) teamFactions.set(1, factions[0]);
    if (!teamFactions.has(2)) teamFactions.set(2, "Unknown");
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

  // Process deaths for kills/deaths/TKs
  for (const d of deaths) {
    const attackerSteam = d.attacker;
    const victimSteam = d.victim;

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

  // Process revives
  for (const r of revives) {
    const reviverSteam = r.reviver;
    if (reviverSteam) {
      const reviver = getOrCreate(reviverSteam, r.reviverName, r.reviverTeamID);
      reviver.revives++;
    }
  }

  // Process spawns for roles (last spawn wins)
  for (const s of spawns) {
    const steamId = steamByEos.get(s.eosID) || s.eosID;
    const name = s.playerName || nameByEos.get(s.eosID) || "Unknown";

    // Determine teamID from spawn point
    let teamId = 0;
    const sp = s.spawnPointInstance || "";
    if (sp.includes("Team1")) teamId = 1;
    else if (sp.includes("Team2")) teamId = 2;

    const p = getOrCreate(steamId, name, teamId);
    p.role = parseRoleName(s.playerClassname);
    p.isSquadLeader = p.role === "Squad Leader" || p.role === "SL Crewman";
  }

  // Assign squad names from SquadCreations
  for (const sq of squadDetailRows as any[]) {
    const steamId = steamByEos.get(sq.playerEOSID);
    if (steamId && playerMap.has(steamId)) {
      playerMap.get(steamId)!.squad = sq.squadName;
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

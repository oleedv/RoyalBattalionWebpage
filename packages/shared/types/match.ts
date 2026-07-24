export interface MatchTeam {
  faction: string;
  factionFull: string;
  result: "WIN" | "LOSS" | "DRAW";
}

export interface MatchPlayer {
  name: string;
  steamId: string;
  squad: string;
  /** End-of-match RCON squad id when known; null for Unassigned. Optional for pre-resync JSON. */
  squadId?: number | null;
  role: string;
  kills: number;
  deaths: number;
  revives: number;
  teamkills: number;
  isSquadLeader: boolean;
}

export interface MatchDetail {
  duration: string;
  players: number;
  team1: MatchTeam;
  team2: MatchTeam;
  team1Players: MatchPlayer[];
  team2Players: MatchPlayer[];
}

export interface Match {
  id: string;
  date: string;
  map: string;
  layer: string;
  result: string;
  server: string;
  vodUrl: string | null;
  hidden: boolean;
  matchDetail?: MatchDetail | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

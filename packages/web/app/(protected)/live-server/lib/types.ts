export interface Player {
  playerID: string;
  eosID: string;
  steamID: string;
  name: string;
  teamID: string;
  squadID: string | null;
  squad?: { squadName: string; size: number; creatorName: string };
  role: string;
  isLeader: boolean;
  playtime?: number;
}

export interface ServerInfo {
  serverName: string;
  maxPlayers: number;
  publicSlots: number;
  reserveSlots: number;
  playerCount: number;
  publicQueue: number;
  reserveQueue: number;
  currentLayer: string | { name: string; [key: string]: unknown } | null;
  nextLayer: string | { name: string; [key: string]: unknown } | null;
  team1Faction?: string;
  team2Faction?: string;
}

export interface ChatMessage {
  chat: string;
  steamID: string;
  eosID: string;
  name: string;
  message: string;
  time: string;
}

export interface MetricSample {
  time: number;
  tickRate: number | null;
  playerCount: number;
  publicQueue: number;
  reserveQueue: number;
}

export interface RandomizationStatus {
  pending: boolean;
  mode?: string;
  requestedBy?: string;
  requestedAt?: string;
}

export interface Snapshot {
  connected: boolean;
  players: Player[];
  serverInfo: ServerInfo | null;
  chatLog: ChatMessage[];
  consoleLog: ConsoleEntry[];
  tickRate: number | null;
  metricHistory: MetricSample[];
  randomizationStatus?: RandomizationStatus | null;
}

export type OnlineClanEntry = { id: string; tag: string; members: { teamID: string; steamId: string; name: string }[] };
export type OnlineClanData = Record<string, OnlineClanEntry>;

export type WSMessage =
  | { type: "servers"; data: string[] }
  | { type: "snapshot"; data: Snapshot; server?: string; configured?: boolean }
  | { type: "event"; event: string; data: unknown; server?: string }
  | { type: "action_progress"; action: string; count: number; estimatedSeconds: number }
  | { type: "action_result"; success: boolean; error?: string; action?: string }
  | { type: "online_clans"; data: OnlineClanData }
  | { type: "rcon_response"; command: string; output: string; success: boolean; error?: string };

export interface ConsoleEntry {
  time: string;
  type: "warn" | "kick" | "ban" | "broadcast" | "connect" | "disconnect" | "teamkill" | "kill" | "newgame" | "wound" | "revive" | "squad" | "admincam" | "rconerror" | "teamchange" | "squadchange" | "autokick" | "roundend";
  message: string;
}

export type ChatFilter = "All" | "ChatAll" | "ChatTeam" | "ChatSquad" | "ChatAdmin";

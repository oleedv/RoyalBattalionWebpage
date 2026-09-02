import { io, Socket } from "socket.io-client";
import { auditDirect } from "./audit";
import { env } from "./env";
import { logger } from "./logger";

export interface SquadJSPlayer {
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

export interface SquadJSServerInfo {
  serverName: string;
  maxPlayers: number;
  publicSlots: number;
  reserveSlots: number;
  playerCount: number;
  publicQueue: number;
  reserveQueue: number;
  currentLayer: string | null;
  nextLayer: string | null;
  team1Faction?: string;
  team2Faction?: string;
}

export interface SquadJSChatMessage {
  raw: string;
  chat: string;
  eosID: string;
  steamID: string;
  name: string;
  message: string;
  time: string;
}

type EventCallback = (serverKey: string, event: string, data: unknown) => void;

const EVENTS_TO_RELAY = [
  "PLAYER_CONNECTED",
  "PLAYER_DISCONNECTED",
  "CHAT_MESSAGE",
  "NEW_GAME",
  "TEAMKILL",
  "PLAYER_WOUNDED",
  "PLAYER_DIED",
  "PLAYER_REVIVED",
  "UPDATED_PLAYER_INFORMATION",
  "UPDATED_A2S_INFORMATION",
  "TICK_RATE",
  "PLAYER_KICKED",
  "PLAYER_BANNED",
  "PLAYER_WARNED",
  "SQUAD_CREATED",
  "ADMIN_BROADCAST",
  "POSSESSED_ADMIN_CAMERA",
  "UNPOSSESSED_ADMIN_CAMERA",
  "RCON_ERROR",
  "PLAYER_TEAM_CHANGE",
  "PLAYER_SQUAD_CHANGE",
  "UPDATED_LAYER_INFORMATION",
  "PLAYER_AUTO_KICKED",
  "ROUND_ENDED",
  "GRACE_PERIOD_STARTED",
  "GRACE_PERIOD_ENDED",
  "GRACE_PERIOD_EVENT",
  "SWAP_QUEUE_EVENT",
  "RANDOMIZE_QUEUE_EVENT",
  "BALANCE_QUEUE_EVENT",
];

export interface GracePeriodEvent {
  action: string;
  playerName?: string | null;
  eosID?: string | null;
  squadID?: number | null;
  squadName?: string | null;
  teamID?: number | null;
  attemptNumber?: number | null;
  reason?: string | null;
  graceRemainingSeconds?: number | null;
  gracePeriodSeconds?: number;
  timestamp: string;
}

export interface SwapQueueEvent {
  action: string;
  player?: { name: string; eosID: string; steamID?: string };
  playerA?: { name: string; eosID: string };
  playerB?: { name: string; eosID: string };
  position?: number;
  queueSize?: number;
  priority?: number;
  currentTeamID?: number;
  fromTeam?: number;
  toTeam?: number;
  waitSeconds?: number;
  swappedCount?: number;
  remaining?: number;
  durationMs?: number;
  team1Count?: number;
  team2Count?: number;
  reason?: string;
  timestamp: string;
}

export interface ConsoleEntry {
  time: string;
  type: "warn" | "kick" | "ban" | "broadcast" | "connect" | "disconnect" | "teamkill" | "kill" | "newgame" | "admincam" | "rconerror" | "teamchange" | "squadchange" | "autokick" | "roundend";
  message: string;
}

export interface MetricSample {
  time: number;
  tickRate: number | null;
  playerCount: number;
  publicQueue: number;
  reserveQueue: number;
}

interface ServerState {
  socket: Socket;
  players: SquadJSPlayer[];
  serverInfo: SquadJSServerInfo | null;
  chatLog: SquadJSChatMessage[];
  consoleLog: ConsoleEntry[];
  tickRate: number | null;
  metricHistory: MetricSample[];
  metricInterval: ReturnType<typeof setInterval> | null;
  pollInterval: ReturnType<typeof setInterval> | null;
  connected: boolean;
  reconnectErrorCount: number;
  lastRcon: Map<string, number>;
  lastEventTime: number;
  gracePeriodEvents: GracePeriodEvent[];
  swapQueueEvents: SwapQueueEvent[];
  gracePeriodActive: boolean;
  gracePeriodEndTime: number | null;
  randomizationStatus: { pending: boolean; mode?: string; requestedBy?: string; requestedAt?: string } | null;
  balanceStatus: { pending: boolean; requestedBy?: string; requestedAt?: string } | null;
}

// Parse env: SQUADJS_SERVERS="staging|ws://ip:4001|token,production|ws://ip:4000|token"
function parseServers(): { key: string; url: string; token: string }[] {
  const raw = env.SQUADJS_SERVERS;
  if (!raw) return [];

  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [key, url, token] = entry.split("|");
      if (!key || !url || !token) return null;
      return { key, url, token };
    })
    .filter((x): x is { key: string; url: string; token: string } => x !== null);
}

class SquadJSSocketManager {
  private servers = new Map<string, ServerState>();
  private listeners = new Set<EventCallback>();

  constructor() {
    const configs = parseServers();

    if (configs.length === 0) {
      logger.warn("squadjs", "SQUADJS_SERVERS not set -- live server will show as offline");
      return;
    }

    logger.info("squadjs", `Connecting to ${configs.length} server(s): ${configs.map((c) => `${c.key} -> ${c.url}`).join(", ")}`);

    for (const cfg of configs) {
      this.connectServer(cfg.key, cfg.url, cfg.token);
    }

    // Watchdog: detect zombie connections every 60s
    setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.servers) {
        if (!state.connected) continue;
        const staleSec = (now - state.lastEventTime) / 1000;
        if (staleSec > 120) {
          logger.warn("squadjs", `${key}: no events for ${Math.round(staleSec)}s, forcing reconnect`);
          state.socket.disconnect();
          state.socket.connect();
        }
      }
    }, 60_000);
  }

  private connectServer(key: string, url: string, token: string) {
    const socket = io(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });

    const state: ServerState = {
      socket,
      players: [],
      serverInfo: null,
      chatLog: [],
      consoleLog: [],
      tickRate: null,
      metricHistory: [],
      metricInterval: null,
      pollInterval: null,
      connected: false,
      reconnectErrorCount: 0,
      lastRcon: new Map(),
      lastEventTime: Date.now(),
      gracePeriodEvents: [],
      swapQueueEvents: [],
      gracePeriodActive: false,
      gracePeriodEndTime: null,
      randomizationStatus: null,
      balanceStatus: null,
    };

    this.servers.set(key, state);

    socket.on("connect", () => {
      if (state.reconnectErrorCount > 0) {
        logger.info("squadjs", `Reconnected to ${key} after ${state.reconnectErrorCount} failed attempt(s)`);
      } else {
        logger.info("squadjs", `Connected to ${key}`);
      }
      state.reconnectErrorCount = 0;
      state.connected = true;
      this.broadcast(key, "CONNECTION_STATUS", { connected: true });
      this.requestInitialState(key, state);
    });

    socket.on("disconnect", (reason) => {
      logger.info("squadjs", `${key} disconnected: ${reason}`);
      state.connected = false;
      if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
      if (state.metricInterval) { clearInterval(state.metricInterval); state.metricInterval = null; }
      this.broadcast(key, "CONNECTION_STATUS", { connected: false });
      if (reason === "io server disconnect") {
        logger.info("squadjs", `${key}: server-initiated disconnect, reconnecting in 5s...`);
        setTimeout(() => socket.connect(), 5000);
      }
    });

    socket.on("connect_error", (err) => {
      state.reconnectErrorCount++;
      if (state.reconnectErrorCount === 1) {
        const description = "description" in err ? String(err.description) : "";
        logger.error("squadjs", `${key} connect_error: ${err.message}`, description);
      } else if (state.reconnectErrorCount % 5 === 0) {
        logger.warn("squadjs", `${key} still reconnecting (attempt ${state.reconnectErrorCount})...`);
      }
    });

    for (const event of EVENTS_TO_RELAY) {
      socket.on(event, (data: unknown) => {
        this.handleEvent(key, state, event, data);
      });
    }
  }

  private requestInitialState(key: string, state: ServerState) {
    // Request current player list
    state.socket.emit("players", (data: SquadJSPlayer[]) => {
      state.lastEventTime = Date.now();
      if (Array.isArray(data)) {
        state.players = data;
        this.broadcast(key, "SNAPSHOT_PLAYERS", data);
      }
    });

    // Request server info
    const infoKeys: (keyof SquadJSServerInfo)[] = [
      "serverName", "maxPlayers", "publicSlots", "reserveSlots",
      "playerCount", "publicQueue", "reserveQueue",
      "currentLayer", "nextLayer",
    ];

    const info: Partial<SquadJSServerInfo> = {};
    let received = 0;
    let infoPublished = false;

    const publishInfo = () => {
      if (infoPublished) return;
      infoPublished = true;
      // Extract faction info from currentLayer if it's an object
      const layer = info.currentLayer as unknown;
      if (layer && typeof layer === "object") {
        const layerObj = layer as Record<string, unknown>;
        // SquadJS layer objects may have teams[0].faction / teams[1].faction
        if (Array.isArray(layerObj.teams) && layerObj.teams.length >= 2) {
          const t1 = layerObj.teams[0] as Record<string, unknown>;
          const t2 = layerObj.teams[1] as Record<string, unknown>;
          if (t1?.faction) info.team1Faction = String(t1.faction);
          if (t2?.faction) info.team2Faction = String(t2.faction);
        }
        // Normalize currentLayer to string for downstream
        if (layerObj.name) info.currentLayer = String(layerObj.name);
      }
      state.serverInfo = info as SquadJSServerInfo;
      this.broadcast(key, "SNAPSHOT_SERVER_INFO", state.serverInfo);
      this.sampleMetric(state);
      this.startMetricSampling(state);
    };

    // Fallback: publish partial info after 10s if not all acks arrive
    const infoTimeout = setTimeout(() => {
      if (!infoPublished) {
        if (received === 0) {
          logger.warn("squadjs", `${key}: no info acks received after 10s, publishing empty state and starting poll`);
        } else {
          logger.warn("squadjs", `${key}: only ${received}/${infoKeys.length} info acks received, publishing partial data`);
        }
        publishInfo();
      }
    }, 10_000);

    for (const infoKey of infoKeys) {
      state.socket.emit(infoKey, (value: unknown) => {
        state.lastEventTime = Date.now();
        (info as Record<string, unknown>)[infoKey] = value;
        received++;
        if (received === infoKeys.length) {
          clearTimeout(infoTimeout);
          publishInfo();
        }
      });
    }

    // Request randomization status via plugin API method
    state.socket.emit("callApiMethod", "getRandomizationStatus", (result: unknown) => {
      state.lastEventTime = Date.now();
      if (result && typeof result === "object" && "pending" in result) {
        state.randomizationStatus = result as ServerState["randomizationStatus"];
      }
    });

    // Request balance status via plugin API method
    state.socket.emit("callApiMethod", "getBalanceStatus", (result: unknown) => {
      state.lastEventTime = Date.now();
      if (result && typeof result === "object" && "pending" in result) {
        state.balanceStatus = result as ServerState["balanceStatus"];
      }
    });

    // Lightweight poll: just refresh player list every 30s to keep count accurate
    if (state.pollInterval) clearInterval(state.pollInterval);
    state.pollInterval = setInterval(() => {
      if (!state.connected) return;
      state.socket.emit("players", (data: SquadJSPlayer[]) => {
        state.lastEventTime = Date.now();
        if (Array.isArray(data)) {
          state.players = data;
          if (state.serverInfo) state.serverInfo.playerCount = data.length;
          this.broadcast(key, "UPDATED_PLAYER_INFORMATION", data);
        }
      });
    }, 10_000);
  }

  private addConsoleEntry(state: ServerState, type: ConsoleEntry["type"], message: string) {
    state.consoleLog.push({ time: new Date().toISOString(), type, message });
    if (state.consoleLog.length > 2000) state.consoleLog = state.consoleLog.slice(-2000);
  }

  private sampleMetric(state: ServerState) {
    const sample: MetricSample = {
      time: Date.now(),
      tickRate: state.tickRate,
      playerCount: state.serverInfo?.playerCount ?? 0,
      publicQueue: state.serverInfo?.publicQueue ?? 0,
      reserveQueue: state.serverInfo?.reserveQueue ?? 0,
    };
    state.metricHistory.push(sample);
    // Keep last 2 hours at 30s intervals = 240 samples
    if (state.metricHistory.length > 240) state.metricHistory = state.metricHistory.slice(-240);
  }

  private startMetricSampling(state: ServerState) {
    if (state.metricInterval) return;
    state.metricInterval = setInterval(() => this.sampleMetric(state), 30_000);
  }

  private handleEvent(key: string, state: ServerState, event: string, data: unknown) {
    state.lastEventTime = Date.now();
    switch (event) {
      case "UPDATED_PLAYER_INFORMATION":
        if (Array.isArray(data)) {
          state.players = data;
          // Keep playerCount in sync with actual player list
          if (state.serverInfo) state.serverInfo.playerCount = data.length;
        }
        break;
      case "UPDATED_A2S_INFORMATION":
        if (data && typeof data === "object") {
          const a2s = data as Record<string, unknown>;
          if (state.serverInfo) {
            state.serverInfo.playerCount = (a2s.a2sPlayerCount as number) ?? state.serverInfo.playerCount;
            // currentLayer can be string or object with teams/faction data
            if (a2s.currentLayer != null) {
              const cl = a2s.currentLayer;
              if (typeof cl === "object") {
                const obj = cl as Record<string, unknown>;
                if (obj.name) state.serverInfo.currentLayer = String(obj.name);
                if (Array.isArray(obj.teams) && obj.teams.length >= 2) {
                  const t1 = obj.teams[0] as Record<string, unknown>;
                  const t2 = obj.teams[1] as Record<string, unknown>;
                  if (t1?.faction) state.serverInfo.team1Faction = String(t1.faction);
                  if (t2?.faction) state.serverInfo.team2Faction = String(t2.faction);
                }
              } else {
                state.serverInfo.currentLayer = String(cl);
              }
            }
            if (a2s.nextLayer !== undefined) {
              state.serverInfo.nextLayer = (typeof a2s.nextLayer === "object" && a2s.nextLayer !== null && "name" in (a2s.nextLayer as object))
                ? String((a2s.nextLayer as Record<string, unknown>).name)
                : (a2s.nextLayer as string) ?? state.serverInfo.nextLayer;
            }
            if (typeof a2s.publicQueue === "number") state.serverInfo.publicQueue = a2s.publicQueue;
            if (typeof a2s.reserveQueue === "number") state.serverInfo.reserveQueue = a2s.reserveQueue;
            // A2S rules may also have TeamOne_s / TeamTwo_s
            if (a2s.TeamOne_s) state.serverInfo.team1Faction = String(a2s.TeamOne_s);
            if (a2s.TeamTwo_s) state.serverInfo.team2Faction = String(a2s.TeamTwo_s);
          }
        }
        break;
      case "CHAT_MESSAGE":
        if (data && typeof data === "object") {
          const msg = data as SquadJSChatMessage;
          msg.time = new Date().toISOString();
          state.chatLog.push(msg);
          if (state.chatLog.length > 2000) state.chatLog = state.chatLog.slice(-2000);
        }
        break;
      case "TICK_RATE":
        if (typeof data === "number") state.tickRate = data;
        else if (data && typeof data === "object" && "tickRate" in data) {
          state.tickRate = (data as { tickRate: number }).tickRate;
        }
        break;
      case "NEW_GAME":
        this.addConsoleEntry(state, "newgame", `New game started${(data as { layerClassname?: string })?.layerClassname ? `: ${(data as { layerClassname: string }).layerClassname}` : ""}`);
        break;
      case "PLAYER_CONNECTED": {
        const pc = data as { player?: { name?: string } };
        if (pc?.player?.name) this.addConsoleEntry(state, "connect", `${pc.player.name} connected`);
        break;
      }
      case "PLAYER_DISCONNECTED": {
        const pd = data as { player?: { name?: string } };
        if (pd?.player?.name) this.addConsoleEntry(state, "disconnect", `${pd.player.name} disconnected`);
        break;
      }
      case "PLAYER_WARNED": {
        const pw = data as { player?: { name?: string }; reason?: string };
        this.addConsoleEntry(state, "warn", `${pw?.player?.name || "Unknown"} warned: ${pw?.reason || "No reason"}`);
        break;
      }
      case "PLAYER_KICKED": {
        const pk = data as { player?: { name?: string }; reason?: string };
        this.addConsoleEntry(state, "kick", `${pk?.player?.name || "Unknown"} kicked: ${pk?.reason || "No reason"}`);
        break;
      }
      case "PLAYER_BANNED": {
        const pb = data as { player?: { name?: string }; reason?: string };
        this.addConsoleEntry(state, "ban", `${pb?.player?.name || "Unknown"} banned: ${pb?.reason || "No reason"}`);
        break;
      }
      case "ADMIN_BROADCAST": {
        const ab = data as { message?: string };
        if (ab?.message) this.addConsoleEntry(state, "broadcast", `Broadcast: ${ab.message}`);
        break;
      }
      case "PLAYER_DIED": {
        const pd2 = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
        if (pd2?.attacker?.name && pd2?.victim?.name) {
          this.addConsoleEntry(state, "kill", `${pd2.attacker.name} killed ${pd2.victim.name}${pd2.weapon ? ` (${pd2.weapon})` : ""}`);
        }
        break;
      }
      case "TEAMKILL": {
        const tk = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
        this.addConsoleEntry(state, "teamkill", `${tk?.attacker?.name || "Unknown"} teamkilled ${tk?.victim?.name || "Unknown"}${tk?.weapon ? ` (${tk.weapon})` : ""}`);
        break;
      }
      case "POSSESSED_ADMIN_CAMERA": {
        const pac = data as { player?: { name?: string } };
        if (pac?.player?.name) this.addConsoleEntry(state, "admincam", `${pac.player.name} entered admin cam`);
        break;
      }
      case "UNPOSSESSED_ADMIN_CAMERA": {
        const uac = data as { player?: { name?: string } };
        if (uac?.player?.name) this.addConsoleEntry(state, "admincam", `${uac.player.name} left admin cam`);
        break;
      }
      case "RCON_ERROR": {
        const re = data as { error?: string; message?: string };
        this.addConsoleEntry(state, "rconerror", `RCON error: ${re?.error || re?.message || "Unknown error"}`);
        break;
      }
      case "PLAYER_TEAM_CHANGE": {
        const ptc = data as { player?: { name?: string }; newTeamID?: string; oldTeamID?: string };
        if (ptc?.player?.name) this.addConsoleEntry(state, "teamchange", `${ptc.player.name} switched to Team ${ptc.newTeamID || "?"}`);
        break;
      }
      case "PLAYER_SQUAD_CHANGE": {
        const psc = data as { player?: { name?: string }; newSquad?: { squadName?: string }; newSquadID?: string };
        if (psc?.player?.name) {
          const squadName = psc.newSquad?.squadName || (psc.newSquadID ? `Squad ${psc.newSquadID}` : "Unassigned");
          this.addConsoleEntry(state, "squadchange", `${psc.player.name} moved to ${squadName}`);
        }
        break;
      }
      case "UPDATED_LAYER_INFORMATION": {
        if (data && typeof data === "object" && state.serverInfo) {
          const li = data as Record<string, unknown>;
          if (li.currentLayer != null) {
            const cl = li.currentLayer;
            if (typeof cl === "object") {
              const obj = cl as Record<string, unknown>;
              if (obj.name) state.serverInfo.currentLayer = String(obj.name);
              if (Array.isArray(obj.teams) && obj.teams.length >= 2) {
                const t1 = obj.teams[0] as Record<string, unknown>;
                const t2 = obj.teams[1] as Record<string, unknown>;
                if (t1?.faction) state.serverInfo.team1Faction = String(t1.faction);
                if (t2?.faction) state.serverInfo.team2Faction = String(t2.faction);
              }
            } else {
              state.serverInfo.currentLayer = String(cl);
            }
          }
          if (li.nextLayer !== undefined) {
            const nl = li.nextLayer;
            if (typeof nl === "object" && nl !== null && "name" in (nl as object)) {
              state.serverInfo.nextLayer = String((nl as Record<string, unknown>).name);
            } else {
              state.serverInfo.nextLayer = nl as string ?? state.serverInfo.nextLayer;
            }
          }
        }
        break;
      }
      case "PLAYER_AUTO_KICKED": {
        const pak = data as { player?: { name?: string }; reason?: string };
        this.addConsoleEntry(state, "autokick", `${pak?.player?.name || "Unknown"} auto-kicked: ${pak?.reason || "Unassigned"}`);
        break;
      }
      case "ROUND_ENDED": {
        const rnd = data as { winner?: string; loser?: string; message?: string };
        const msg = rnd?.message || (rnd?.winner ? `Winner: ${rnd.winner}` : "Round ended");
        this.addConsoleEntry(state, "roundend", msg);
        break;
      }
      case "GRACE_PERIOD_STARTED": {
        const gps = data as GracePeriodEvent;
        state.gracePeriodActive = true;
        state.gracePeriodEndTime = Date.now() + (gps.gracePeriodSeconds || 10) * 1000;
        state.gracePeriodEvents.push(gps);
        if (state.gracePeriodEvents.length > 100) state.gracePeriodEvents = state.gracePeriodEvents.slice(-100);
        break;
      }
      case "GRACE_PERIOD_ENDED": {
        const gpe = data as GracePeriodEvent;
        state.gracePeriodActive = false;
        state.gracePeriodEndTime = null;
        state.gracePeriodEvents.push(gpe);
        if (state.gracePeriodEvents.length > 100) state.gracePeriodEvents = state.gracePeriodEvents.slice(-100);
        break;
      }
      case "GRACE_PERIOD_EVENT": {
        const gpev = data as GracePeriodEvent;
        state.gracePeriodEvents.push(gpev);
        if (state.gracePeriodEvents.length > 100) state.gracePeriodEvents = state.gracePeriodEvents.slice(-100);
        break;
      }
      case "SWAP_QUEUE_EVENT": {
        const sqe = data as SwapQueueEvent;
        state.swapQueueEvents.push(sqe);
        if (state.swapQueueEvents.length > 100) state.swapQueueEvents = state.swapQueueEvents.slice(-100);
        break;
      }
      case "RANDOMIZE_QUEUE_EVENT": {
        const rqe = data as { action: string; mode?: string; requestedBy?: string; [key: string]: unknown };
        if (rqe.action === "queued") {
          state.randomizationStatus = { pending: true, mode: rqe.mode, requestedBy: rqe.requestedBy, requestedAt: new Date().toISOString() };
        } else if (rqe.action === "cancelled" || rqe.action === "executed" || rqe.action === "failed") {
          state.randomizationStatus = null;
        }
        break;
      }
      case "BALANCE_QUEUE_EVENT": {
        const bqe = data as { action: string; requestedBy?: string; cancelledBy?: string; team1Count?: number; team2Count?: number; playersMoved?: number; error?: string; [key: string]: unknown };
        if (bqe.action === "queued") {
          state.balanceStatus = { pending: true, requestedBy: bqe.requestedBy, requestedAt: new Date().toISOString() };
        } else if (bqe.action === "cancelled" || bqe.action === "executed" || bqe.action === "failed") {
          state.balanceStatus = null;
        }
        if (bqe.action === "executed") {
          const snap = this.getSnapshot(key);
          auditDirect("system", "SquadJS", "rcon.balanceexecuted", "LiveServer", key, {
            server: key,
            layer: snap?.serverInfo?.currentLayer ?? null,
            originalRequester: bqe.requestedBy ?? null,
            team1Count: bqe.team1Count ?? null,
            team2Count: bqe.team2Count ?? null,
            playersMoved: bqe.playersMoved ?? null,
          });
        } else if (bqe.action === "failed") {
          auditDirect("system", "SquadJS", "rcon.balancefailed", "LiveServer", key, {
            server: key,
            originalRequester: bqe.requestedBy ?? null,
            error: bqe.error ?? null,
          });
        }
        break;
      }
    }

    this.broadcast(key, event, data);
  }

  private broadcast(serverKey: string, event: string, data: unknown) {
    for (const cb of this.listeners) {
      try {
        cb(serverKey, event, data);
      } catch (err) {
        logger.error("squadjs", "Listener error", err);
      }
    }
  }

  onEvent(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  clearListeners() {
    this.listeners.clear();
  }

  refreshPlayers(serverKey: string): void {
    const state = this.servers.get(serverKey);
    if (!state?.connected) return;
    state.socket.emit("players", (data: SquadJSPlayer[]) => {
      if (Array.isArray(data)) {
        state.players = data;
        if (state.serverInfo) state.serverInfo.playerCount = data.length;
        this.broadcast(serverKey, "UPDATED_PLAYER_INFORMATION", data);
      }
    });
  }

  getServerKeys(): string[] {
    return Array.from(this.servers.keys());
  }

  getSnapshot(serverKey: string) {
    const state = this.servers.get(serverKey);
    if (!state) return null;
    return {
      connected: state.connected,
      players: state.players,
      serverInfo: state.serverInfo,
      chatLog: state.chatLog,
      consoleLog: state.consoleLog,
      tickRate: state.tickRate,
      metricHistory: state.metricHistory,
      gracePeriodEvents: state.gracePeriodEvents,
      swapQueueEvents: state.swapQueueEvents,
      gracePeriodActive: state.gracePeriodActive,
      gracePeriodEndTime: state.gracePeriodEndTime,
      randomizationStatus: state.randomizationStatus,
      balanceStatus: state.balanceStatus,
    };
  }

  isConfigured(): boolean {
    return this.servers.size > 0;
  }

  getStatus(): { configured: boolean; servers: { key: string; connected: boolean }[] } {
    return {
      configured: this.servers.size > 0,
      servers: Array.from(this.servers.entries()).map(([key, state]) => ({
        key,
        connected: state.connected,
      })),
    };
  }

  async callMethod(serverKey: string, methodName: string, ...args: unknown[]): Promise<unknown> {
    const state = this.servers.get(serverKey);
    if (!state || !state.connected) {
      throw new Error(`Not connected to ${serverKey}`);
    }

    logger.info("squadjs", `API method ${serverKey}: callApiMethod(${methodName}, ${args.map(String).join(", ")})`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Method call timeout")), 15000);
      state.socket.emit("callApiMethod", methodName, ...args, (result: unknown) => {
        clearTimeout(timeout);
        if (result && typeof result === "object" && "error" in result) {
          reject(new Error((result as { error: string }).error));
        } else {
          resolve(result);
        }
      });
    });
  }

  async executeRcon(serverKey: string, method: string, ...rest: unknown[]): Promise<unknown> {
    // Detect an optional trailing options object: executeRcon(key, method, ...args, { dedupe })
    let opts: { dedupe: boolean } = { dedupe: true };
    let args = rest;
    const last = rest[rest.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last)) {
      opts = { dedupe: true, ...(last as { dedupe?: boolean }) };
      args = rest.slice(0, -1);
    }

    const state = this.servers.get(serverKey);
    if (!state || !state.connected) {
      throw new Error(`Not connected to ${serverKey}`);
    }

    // Deduplication: prevent same command within 2 seconds (skippable for reads)
    if (opts.dedupe) {
      const dedupeKey = `${method}:${args.map(String).join(":")}`;
      const now = Date.now();
      const lastExec = state.lastRcon.get(dedupeKey);
      if (lastExec && now - lastExec < 2000) {
        logger.warn("squadjs", `Dedup: skipping duplicate rcon.${method} on ${serverKey}`);
        return "deduplicated";
      }
      state.lastRcon.set(dedupeKey, now);

      // Clean old entries every 50 commands
      if (state.lastRcon.size > 50) {
        for (const [k, t] of state.lastRcon) {
          if (now - t > 5000) state.lastRcon.delete(k);
        }
      }
    }

    logger.info("squadjs", `RCON ${serverKey}: rcon.${method}(${args.map(String).join(", ")})`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("RCON timeout")), 10000);
      state.socket.emit(`rcon.${method}`, ...args, (result: unknown) => {
        clearTimeout(timeout);
        if (result && typeof result === "object" && "error" in result) {
          reject(new Error((result as { error: string }).error));
        } else {
          resolve(result);
        }
      });
    });
  }
}

export const squadjsSocket = new SquadJSSocketManager();

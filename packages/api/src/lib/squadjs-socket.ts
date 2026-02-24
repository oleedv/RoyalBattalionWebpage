import { io, Socket } from "socket.io-client";

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
];

export interface ConsoleEntry {
  time: string;
  type: "warn" | "kick" | "ban" | "broadcast" | "connect" | "disconnect" | "teamkill" | "kill" | "newgame";
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
}

// Parse env: SQUADJS_SERVERS="staging|ws://ip:4001|token,production|ws://ip:4000|token"
function parseServers(): { key: string; url: string; token: string }[] {
  const raw = process.env.SQUADJS_SERVERS;
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
      console.log("[squadjs-socket] SQUADJS_SERVERS not set, skipping");
      return;
    }

    console.log(`[squadjs-socket] Connecting to ${configs.length} server(s): ${configs.map((c) => `${c.key} -> ${c.url}`).join(", ")}`);

    for (const cfg of configs) {
      this.connectServer(cfg.key, cfg.url, cfg.token);
    }
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
    };

    this.servers.set(key, state);

    socket.on("connect", () => {
      if (state.reconnectErrorCount > 0) {
        console.log(`[squadjs-socket] Reconnected to ${key} after ${state.reconnectErrorCount} failed attempt(s)`);
      } else {
        console.log(`[squadjs-socket] Connected to ${key}`);
      }
      state.reconnectErrorCount = 0;
      state.connected = true;
      this.broadcast(key, "CONNECTION_STATUS", { connected: true });
      this.requestInitialState(key, state);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[squadjs-socket] ${key} disconnected: ${reason}`);
      state.connected = false;
      if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
      if (state.metricInterval) { clearInterval(state.metricInterval); state.metricInterval = null; }
      this.broadcast(key, "CONNECTION_STATUS", { connected: false });
    });

    socket.on("connect_error", (err) => {
      state.reconnectErrorCount++;
      if (state.reconnectErrorCount === 1) {
        console.error(`[squadjs-socket] ${key} connect_error: ${err.message}`, (err as any).description || "");
      } else if (state.reconnectErrorCount % 5 === 0) {
        console.warn(`[squadjs-socket] ${key} still reconnecting (attempt ${state.reconnectErrorCount})...`);
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
      if (!infoPublished && received > 0) {
        console.warn(`[squadjs-socket] ${key}: only ${received}/${infoKeys.length} info acks received, publishing partial data`);
        publishInfo();
      }
    }, 10_000);

    for (const infoKey of infoKeys) {
      state.socket.emit(infoKey, (value: unknown) => {
        (info as Record<string, unknown>)[infoKey] = value;
        received++;
        if (received === infoKeys.length) {
          clearTimeout(infoTimeout);
          publishInfo();
        }
      });
    }

    // Lightweight poll: just refresh player list every 30s to keep count accurate
    if (state.pollInterval) clearInterval(state.pollInterval);
    state.pollInterval = setInterval(() => {
      if (!state.connected) return;
      state.socket.emit("players", (data: SquadJSPlayer[]) => {
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
    if (state.consoleLog.length > 100) state.consoleLog = state.consoleLog.slice(-100);
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
          if (state.chatLog.length > 100) state.chatLog = state.chatLog.slice(-100);
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
    }

    this.broadcast(key, event, data);
  }

  private broadcast(serverKey: string, event: string, data: unknown) {
    for (const cb of this.listeners) {
      try {
        cb(serverKey, event, data);
      } catch (err) {
        console.error("[squadjs-socket] Listener error:", err);
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
    };
  }

  isConfigured(): boolean {
    return this.servers.size > 0;
  }

  async executeRcon(serverKey: string, method: string, ...args: unknown[]): Promise<unknown> {
    const state = this.servers.get(serverKey);
    if (!state || !state.connected) {
      throw new Error(`Not connected to ${serverKey}`);
    }

    // Deduplication: prevent same command within 2 seconds
    const dedupeKey = `${method}:${args.map(String).join(":")}`;
    const now = Date.now();
    const lastExec = state.lastRcon.get(dedupeKey);
    if (lastExec && now - lastExec < 2000) {
      console.warn(`[squadjs-socket] Dedup: skipping duplicate rcon.${method} on ${serverKey}`);
      return "deduplicated";
    }
    state.lastRcon.set(dedupeKey, now);

    // Clean old entries every 50 commands
    if (state.lastRcon.size > 50) {
      for (const [k, t] of state.lastRcon) {
        if (now - t > 5000) state.lastRcon.delete(k);
      }
    }

    console.log(`[squadjs-socket] RCON ${serverKey}: rcon.${method}(${args.map(String).join(", ")})`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("RCON timeout")), 10000);
      state.socket.emit(`rcon.${method}`, ...args, (result: unknown) => {
        clearTimeout(timeout);
        resolve(result);
      });
    });
  }
}

export const squadjsSocket = new SquadJSSocketManager();

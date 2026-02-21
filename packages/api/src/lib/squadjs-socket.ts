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

interface ServerState {
  socket: Socket;
  players: SquadJSPlayer[];
  serverInfo: SquadJSServerInfo | null;
  chatLog: SquadJSChatMessage[];
  tickRate: number | null;
  connected: boolean;
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

    for (const cfg of configs) {
      this.connectServer(cfg.key, cfg.url, cfg.token);
    }
  }

  private connectServer(key: string, url: string, token: string) {
    const socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity,
    });

    const state: ServerState = {
      socket,
      players: [],
      serverInfo: null,
      chatLog: [],
      tickRate: null,
      connected: false,
    };

    this.servers.set(key, state);

    socket.on("connect", () => {
      console.log(`[squadjs-socket] Connected to ${key}`);
      state.connected = true;
      this.requestInitialState(key, state);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[squadjs-socket] ${key} disconnected: ${reason}`);
      state.connected = false;
    });

    socket.on("connect_error", (err) => {
      console.error(`[squadjs-socket] ${key} error: ${err.message}`);
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

    for (const infoKey of infoKeys) {
      state.socket.emit(infoKey, (value: unknown) => {
        (info as Record<string, unknown>)[infoKey] = value;
        received++;
        if (received === infoKeys.length) {
          state.serverInfo = info as SquadJSServerInfo;
          this.broadcast(key, "SNAPSHOT_SERVER_INFO", state.serverInfo);
        }
      });
    }
  }

  private handleEvent(key: string, state: ServerState, event: string, data: unknown) {
    switch (event) {
      case "UPDATED_PLAYER_INFORMATION":
        if (Array.isArray(data)) state.players = data;
        break;
      case "UPDATED_A2S_INFORMATION":
        if (data && typeof data === "object") {
          const a2s = data as Record<string, unknown>;
          if (state.serverInfo) {
            state.serverInfo.playerCount = (a2s.a2sPlayerCount as number) ?? state.serverInfo.playerCount;
            state.serverInfo.currentLayer = (a2s.currentLayer as string) ?? state.serverInfo.currentLayer;
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
        state.chatLog = [];
        break;
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
      tickRate: state.tickRate,
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

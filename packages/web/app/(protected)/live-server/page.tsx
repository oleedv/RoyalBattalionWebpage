"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePermissions } from "@/lib/permission-context";

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
    /^http/,
    "ws"
  );

interface Player {
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

interface ServerInfo {
  serverName: string;
  maxPlayers: number;
  publicSlots: number;
  reserveSlots: number;
  playerCount: number;
  publicQueue: number;
  reserveQueue: number;
  currentLayer: string | { name: string; [key: string]: unknown } | null;
  nextLayer: string | { name: string; [key: string]: unknown } | null;
}

interface ChatMessage {
  chat: string;
  steamID: string;
  name: string;
  message: string;
  time: string;
}

interface MetricSample {
  time: number;
  tickRate: number | null;
  playerCount: number;
  publicQueue: number;
  reserveQueue: number;
}

interface Snapshot {
  connected: boolean;
  players: Player[];
  serverInfo: ServerInfo | null;
  chatLog: ChatMessage[];
  consoleLog: ConsoleEntry[];
  tickRate: number | null;
  metricHistory: MetricSample[];
}

type WSMessage =
  | { type: "servers"; data: string[] }
  | { type: "snapshot"; data: Snapshot; server?: string }
  | { type: "event"; event: string; data: unknown; server?: string }
  | { type: "action_result"; success: boolean; error?: string; action?: string };

interface ConsoleEntry {
  time: string;
  type: "warn" | "kick" | "ban" | "broadcast" | "connect" | "disconnect" | "teamkill" | "newgame";
  message: string;
}

type ChatFilter = "All" | "ChatAll" | "ChatTeam" | "ChatSquad" | "ChatAdmin";

export default function LiveServerPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canView = hasPermission("view:live-server") || hasPermission("manage:live-server");
  const canManage = hasPermission("manage:live-server");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connected, setConnected] = useState(false);
  const [squadjsConnected, setSquadjsConnected] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [tickRate, setTickRate] = useState<number | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("All");
  const [serverKeys, setServerKeys] = useState<string[]>([]);
  const [activeServer, setActiveServer] = useState<string>("");

  // Admin actions
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [warnTarget, setWarnTarget] = useState<Player | null>(null);
  const [warnMsg, setWarnMsg] = useState("");
  const [kickTarget, setKickTarget] = useState<Player | null>(null);
  const [kickReason, setKickReason] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [consoleLog, setConsoleLog] = useState<ConsoleEntry[]>([]);
  const [metricHistory, setMetricHistory] = useState<MetricSample[]>([]);
  const [team1Search, setTeam1Search] = useState("");
  const [team2Search, setTeam2Search] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg: WSMessage = JSON.parse(event.data);

      switch (msg.type) {
        case "servers":
          setServerKeys(msg.data);
          setActiveServer((prev) =>
            !prev && msg.data.length > 0 ? msg.data[0] : prev
          );
          break;
        case "snapshot":
          setSquadjsConnected(msg.data.connected);
          setPlayers(msg.data.players);
          setServerInfo(msg.data.serverInfo);
          setChatLog(msg.data.chatLog);
          if (msg.data.consoleLog?.length) setConsoleLog(msg.data.consoleLog);
          setTickRate(msg.data.tickRate);
          if (msg.data.metricHistory?.length) setMetricHistory(msg.data.metricHistory);
          break;
        case "event":
          handleGameEvent(msg.event, msg.data);
          break;
        case "action_result":
          if (msg.success) {
            setActionFeedback(`${msg.action} executed successfully`);
          } else {
            setActionFeedback(`Error: ${msg.error}`);
          }
          setTimeout(() => setActionFeedback(null), 4000);
          break;
      }
    } catch (err) {
      console.error("[live-server] Failed to process WebSocket message:", err, event.data);
    }
  }, []);

  function handleGameEvent(event: string, data: unknown) {
    switch (event) {
      case "UPDATED_PLAYER_INFORMATION":
      case "SNAPSHOT_PLAYERS":
        if (Array.isArray(data)) setPlayers(data);
        break;
      case "SNAPSHOT_SERVER_INFO":
        if (data) setServerInfo(data as ServerInfo);
        break;
      case "UPDATED_A2S_INFORMATION":
        if (data && typeof data === "object") {
          const a2s = data as Record<string, unknown>;
          setServerInfo((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              playerCount: (a2s.a2sPlayerCount as number) ?? prev.playerCount,
              currentLayer: (a2s.currentLayer as ServerInfo["currentLayer"]) ?? prev.currentLayer,
              ...(a2s.nextLayer !== undefined ? { nextLayer: a2s.nextLayer as ServerInfo["nextLayer"] } : {}),
              ...(typeof a2s.publicQueue === "number" ? { publicQueue: a2s.publicQueue } : {}),
              ...(typeof a2s.reserveQueue === "number" ? { reserveQueue: a2s.reserveQueue } : {}),
            };
          });
          // Update metric history with latest values
          setMetricHistory((prev) => {
            const now = Date.now();
            const last = prev[prev.length - 1];
            // Only add a sample if 25+ seconds since last
            if (last && now - last.time < 25_000) return prev;
            const sample: MetricSample = {
              time: now,
              tickRate: null, // will be updated by TICK_RATE event
              playerCount: (a2s.a2sPlayerCount as number) ?? 0,
              publicQueue: (a2s.publicQueue as number) ?? 0,
              reserveQueue: (a2s.reserveQueue as number) ?? 0,
            };
            const next = [...prev, sample];
            return next.length > 240 ? next.slice(-240) : next;
          });
        }
        break;
      case "CHAT_MESSAGE":
        if (data && typeof data === "object") {
          setChatLog((prev) => {
            const next = [...prev, data as ChatMessage];
            return next.length > 100 ? next.slice(-100) : next;
          });
        }
        break;
      case "TICK_RATE":
        if (typeof data === "number") setTickRate(data);
        else if (data && typeof data === "object" && "tickRate" in data) {
          setTickRate((data as { tickRate: number }).tickRate);
        }
        break;
      case "NEW_GAME":
        setChatLog([]);
        addConsoleEntry("newgame", `New game started${(data as { layerClassname?: string })?.layerClassname ? `: ${(data as { layerClassname: string }).layerClassname}` : ""}`);
        break;
      case "PLAYER_CONNECTED": {
        const pc = data as { player?: { name?: string } };
        if (pc?.player?.name) addConsoleEntry("connect", `${pc.player.name} connected`);
        break;
      }
      case "PLAYER_DISCONNECTED": {
        const pd = data as { player?: { name?: string } };
        if (pd?.player?.name) addConsoleEntry("disconnect", `${pd.player.name} disconnected`);
        break;
      }
      case "PLAYER_WARNED": {
        const pw = data as { player?: { name?: string }; reason?: string };
        addConsoleEntry("warn", `${pw?.player?.name || "Unknown"} warned: ${pw?.reason || "No reason"}`);
        break;
      }
      case "PLAYER_KICKED": {
        const pk = data as { player?: { name?: string }; reason?: string };
        addConsoleEntry("kick", `${pk?.player?.name || "Unknown"} kicked: ${pk?.reason || "No reason"}`);
        break;
      }
      case "PLAYER_BANNED": {
        const pb = data as { player?: { name?: string }; reason?: string };
        addConsoleEntry("ban", `${pb?.player?.name || "Unknown"} banned: ${pb?.reason || "No reason"}`);
        break;
      }
      case "ADMIN_BROADCAST": {
        const ab = data as { message?: string };
        if (ab?.message) addConsoleEntry("broadcast", `Broadcast: ${ab.message}`);
        break;
      }
      case "TEAMKILL": {
        const tk = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
        addConsoleEntry("teamkill", `${tk?.attacker?.name || "Unknown"} teamkilled ${tk?.victim?.name || "Unknown"}${tk?.weapon ? ` (${tk.weapon})` : ""}`);
        break;
      }
    }
  }

  function addConsoleEntry(type: ConsoleEntry["type"], message: string) {
    setConsoleLog((prev) => {
      const next = [...prev, { time: new Date().toISOString(), type, message }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }

  const connectWs = useCallback(() => {
    if (!apiToken || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}/live-server/ws?token=${apiToken}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      reconnectRef.current = setTimeout(connectWs, 3000);
    };
    ws.onerror = (err) => {
      console.error("[live-server] WebSocket error:", err);
      ws.close();
    };
    ws.onmessage = handleMessage;
  }, [apiToken, handleMessage]);

  useEffect(() => {
    if (!apiToken || !canView) return;
    connectWs();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [apiToken, canView, connectWs]);

  // Auto-scroll chat & console
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLog]);

  function switchServer(key: string) {
    setActiveServer(key);
    setPlayers([]);
    setServerInfo(null);
    setChatLog([]);
    setConsoleLog([]);
    setTickRate(null);
    setMetricHistory([]);
    setTeam1Search("");
    setTeam2Search("");
    setSquadjsConnected(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "switch_server", server: key }));
    }
  }

  function sendAction(action: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(action));
    }
  }

  function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    sendAction({ action: "broadcast", message: broadcastMsg.trim() });
    setBroadcastMsg("");
  }

  function handleWarn() {
    if (!warnTarget || !warnMsg.trim()) return;
    sendAction({
      action: "warn",
      steamId: warnTarget.steamID,
      eosId: warnTarget.eosID,
      message: warnMsg.trim(),
    });
    setWarnTarget(null);
    setWarnMsg("");
  }

  function handleKick() {
    if (!kickTarget) return;
    sendAction({
      action: "kick",
      steamId: kickTarget.steamID,
      eosId: kickTarget.eosID,
      reason: kickReason.trim() || "Kicked by admin",
    });
    setKickTarget(null);
    setKickReason("");
  }

  function handleSwitchTeam(player: Player) {
    sendAction({
      action: "switchteam",
      steamId: player.steamID,
      eosId: player.eosID,
    });
  }

  function handleDisbandSquad(teamID: string, squadID: string) {
    sendAction({ action: "disband", teamID, squadID });
  }

  function layerName(layer: string | { name: string; [key: string]: unknown } | null): string {
    if (!layer) return "--";
    if (typeof layer === "string") return layer;
    return layer.name || "--";
  }

  function consoleTypeColor(type: ConsoleEntry["type"]): string {
    switch (type) {
      case "warn": return "text-warning font-medium";
      case "kick": return "text-danger font-medium";
      case "ban": return "text-danger font-bold";
      case "broadcast": return "text-accent font-medium";
      case "connect": return "text-success";
      case "disconnect": return "text-text-muted";
      case "teamkill": return "text-danger/70";
      case "newgame": return "text-accent font-bold";
      default: return "text-text-secondary";
    }
  }

  if (!canView) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  const team1All = players.filter((p) => String(p.teamID) === "1");
  const team2All = players.filter((p) => String(p.teamID) === "2");
  const team1 = team1Search
    ? team1All.filter((p) => p.name.toLowerCase().includes(team1Search.toLowerCase()))
    : team1All;
  const team2 = team2Search
    ? team2All.filter((p) => p.name.toLowerCase().includes(team2Search.toLowerCase()))
    : team2All;
  const unassigned = players.filter(
    (p) => String(p.teamID) !== "1" && String(p.teamID) !== "2"
  );

  const filteredChat =
    chatFilter === "All"
      ? chatLog
      : chatLog.filter((m) => m.chat === chatFilter);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide">
            Live Server
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {serverInfo?.serverName || "Real-time server monitoring"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                connected && squadjsConnected
                  ? "bg-success"
                  : connected
                    ? "bg-warning"
                    : "bg-danger"
              }`}
            />
            <span className="text-xs text-text-muted">
              {connected && squadjsConnected
                ? "Connected"
                : connected
                  ? "API connected, SquadJS disconnected"
                  : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Server tabs */}
      {serverKeys.length > 1 && (
        <div className="mb-6 flex gap-1 border-b border-border">
          {serverKeys.map((key) => (
            <button
              key={key}
              onClick={() => switchServer(key)}
              className={`relative px-5 py-2.5 text-sm font-medium tracking-wide capitalize transition-colors ${
                activeServer === key
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {key}
              {activeServer === key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Action feedback */}
      {actionFeedback && (
        <div
          className={`mb-4 rounded-sm border px-4 py-2.5 text-sm ${
            actionFeedback.startsWith("Error")
              ? "border-danger/20 bg-danger/5 text-danger"
              : "border-success/20 bg-success/5 text-success"
          }`}
        >
          {actionFeedback}
        </div>
      )}

      {/* Server info bar */}
      {serverInfo && (
        <div className="facet-border mb-6 grid grid-cols-2 gap-3 rounded-sm bg-bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
          <InfoCell label="Players" value={`${serverInfo.playerCount} / ${serverInfo.maxPlayers}`}>
            <Sparkline data={metricHistory.map((s) => s.playerCount)} color="var(--color-accent)" />
          </InfoCell>
          <InfoCell label="Queue" value={`${serverInfo.publicQueue + serverInfo.reserveQueue}`}>
            <Sparkline data={metricHistory.map((s) => s.publicQueue + s.reserveQueue)} color="var(--color-warning)" />
          </InfoCell>
          <InfoCell label="Layer" value={layerName(serverInfo.currentLayer)}>
            {layerName(serverInfo.currentLayer) !== "--" && (
              <MapImg
                urls={getMapThumbnailUrls(layerName(serverInfo.currentLayer))}
                alt=""
                className="h-full w-full object-cover opacity-30"
              />
            )}
          </InfoCell>
          <InfoCell label="Next" value={layerName(serverInfo.nextLayer)}>
            {layerName(serverInfo.nextLayer) !== "--" && (
              <MapImg
                urls={getMapThumbnailUrls(layerName(serverInfo.nextLayer))}
                alt=""
                className="h-full w-full object-cover opacity-30"
              />
            )}
          </InfoCell>
          <InfoCell label="Tick Rate" value={tickRate ? `${tickRate.toFixed(1)}` : "--"}>
            <Sparkline data={metricHistory.map((s) => s.tickRate ?? 0)} color="var(--color-success)" />
          </InfoCell>
          <InfoCell label="Slots" value={`${serverInfo.publicSlots}+${serverInfo.reserveSlots}`} />
        </div>
      )}

      {/* Main grid: Players + Chat */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Player list - 2 cols */}
        <div className="lg:col-span-2">
          <div className="facet-border rounded-sm bg-bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                Players ({players.length})
              </h2>
            </div>

            {players.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                {connected ? "No players online" : "Connecting..."}
              </div>
            ) : (
              <div className="grid gap-0 md:grid-cols-2">
                <TeamColumn
                  label="Team 1"
                  players={team1}
                  totalCount={team1All.length}
                  showActions={canManage}
                  searchValue={team1Search}
                  onSearchChange={setTeam1Search}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                />
                <TeamColumn
                  label="Team 2"
                  players={team2}
                  totalCount={team2All.length}
                  className="border-t border-border md:border-l md:border-t-0"
                  showActions={canManage}
                  searchValue={team2Search}
                  onSearchChange={setTeam2Search}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                />
              </div>
            )}

            {unassigned.length > 0 && (
              <div className="border-t border-border">
                <TeamColumn
                  label="Unassigned"
                  players={unassigned}
                  totalCount={unassigned.length}
                  showActions={canManage}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                />
              </div>
            )}
          </div>
        </div>

        {/* Chat + Broadcast */}
        <div className="flex flex-col gap-4">
          {/* Broadcast */}
          {canManage && (
            <form
              onSubmit={handleBroadcast}
              className="facet-border flex gap-2 rounded-sm bg-bg-card p-3"
            >
              <input
                type="text"
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="Server broadcast..."
                className="flex-1 rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={!broadcastMsg.trim() || !connected}
                className="rounded-sm bg-accent px-4 py-1.5 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-40"
              >
                Send
              </button>
            </form>
          )}

          {/* Chat feed */}
          <div className="facet-border flex flex-col rounded-sm bg-bg-card" style={{ height: "350px" }}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                Chat
              </h2>
              <div className="flex gap-1">
                {(["All", "ChatAll", "ChatTeam", "ChatSquad", "ChatAdmin"] as ChatFilter[]).map(
                  (f) => (
                    <button
                      key={f}
                      onClick={() => setChatFilter(f)}
                      className={`rounded-sm px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors ${
                        chatFilter === f
                          ? "bg-accent/10 text-accent"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      {f === "All" ? "All" : f.replace("Chat", "")}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto px-4 py-2">
              {filteredChat.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  No chat messages yet
                </div>
              ) : (
                filteredChat.map((msg, i) => {
                  const player = players.find((p) => p.steamID === msg.steamID);
                  const teamColor = String(player?.teamID) === "1"
                    ? "text-blue-400"
                    : String(player?.teamID) === "2"
                      ? "text-red-400"
                      : "text-text-secondary";
                  return (
                    <div key={i} className="mb-1.5 text-xs">
                      <span className="text-text-muted">
                        {new Date(msg.time).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>{" "}
                      <span
                        className={`font-medium ${
                          msg.chat === "ChatAdmin"
                            ? "text-warning"
                            : msg.chat === "ChatTeam"
                              ? "text-accent"
                              : "text-text-primary"
                        }`}
                      >
                        [{msg.chat?.replace("Chat", "") || "?"}]
                      </span>{" "}
                      <span className={`font-medium ${teamColor}`}>{msg.name}:</span>{" "}
                      <span className="text-text-primary">{msg.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Console */}
          <div className="facet-border flex flex-col rounded-sm bg-bg-card" style={{ height: "300px" }}>
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                Console
              </h2>
            </div>
            <div className="flex-1 overflow-auto px-4 py-2 font-mono">
              {consoleLog.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  No events yet
                </div>
              ) : (
                consoleLog.map((entry, i) => (
                  <div key={i} className="mb-1 text-xs">
                    <span className="text-text-muted">
                      {new Date(entry.time).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>{" "}
                    <span className={consoleTypeColor(entry.type)}>
                      [{entry.type.toUpperCase()}]
                    </span>{" "}
                    <span className="text-text-primary">{entry.message}</span>
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Warn modal */}
      {warnTarget && (
        <ActionModal
          title={`Warn ${warnTarget.name}`}
          onConfirm={handleWarn}
          onCancel={() => setWarnTarget(null)}
          confirmLabel="Send Warning"
          confirmDisabled={!warnMsg.trim()}
        >
          <input
            type="text"
            value={warnMsg}
            onChange={(e) => setWarnMsg(e.target.value)}
            placeholder="Warning message..."
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            autoFocus
          />
        </ActionModal>
      )}

      {/* Kick modal */}
      {kickTarget && (
        <ActionModal
          title={`Kick ${kickTarget.name}`}
          onConfirm={handleKick}
          onCancel={() => setKickTarget(null)}
          confirmLabel="Kick Player"
          confirmClass="bg-danger hover:bg-danger/80"
        >
          <input
            type="text"
            value={kickReason}
            onChange={(e) => setKickReason(e.target.value)}
            placeholder="Reason (optional)..."
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            autoFocus
          />
        </ActionModal>
      )}
    </div>
  );
}

// ============================================================
// SUB COMPONENTS
// ============================================================

const THUMBNAILS_BASE =
  "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/maps/thumbnails";

function getMapThumbnailUrls(layer: string): string[] {
  const cleaned = layer
    .replace(/^SEC_?\d*_?/, "")
    .replace(/\s+/g, "_");

  const m = cleaned.match(/^(.+_v)(\d+)$/);
  if (m) {
    const prefix = m[1];
    const num = m[2];
    const padded = num.padStart(2, "0");
    if (padded !== num) {
      return [
        `${THUMBNAILS_BASE}/${prefix}${num}.jpg`,
        `${THUMBNAILS_BASE}/${prefix}${padded}.jpg`,
      ];
    }
  }
  return [`${THUMBNAILS_BASE}/${cleaned}.jpg`];
}

function MapImg({ urls, alt, className }: { urls: string[]; alt: string; className?: string }) {
  const [idx, setIdx] = useState(0);
  if (idx >= urls.length) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt}
      className={className}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

function InfoCell({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="relative min-h-[56px] overflow-hidden rounded-sm">
      {children && <div className="absolute inset-0">{children}</div>}
      <div className="relative flex h-full flex-col justify-end p-1">
        <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-text-primary">
          {value}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ data, color, height = 48 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const width = 120;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const coords = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return { x, y };
  });
  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  // Closed polygon for area fill: line points + bottom-right + bottom-left
  const areaPoints = `${linePoints} ${width},${height} 0,${height}`;

  return (
    <svg width={width} height={height} className="h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <polygon fill={color} fillOpacity="0.15" points={areaPoints} />
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={linePoints} />
    </svg>
  );
}

function TeamColumn({
  label,
  players,
  totalCount,
  className = "",
  showActions = false,
  searchValue,
  onSearchChange,
  onWarn,
  onKick,
  onSwitchTeam,
  onDisbandSquad,
}: {
  label: string;
  players: Player[];
  totalCount: number;
  className?: string;
  showActions?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
  onDisbandSquad: (teamID: string, squadID: string) => void;
}) {
  // Group by squad
  const squads = new Map<string, Player[]>();
  const noSquad: Player[] = [];

  for (const p of players) {
    if (p.squadID && p.squad) {
      const key = `${p.teamID}-${p.squadID}`;
      if (!squads.has(key)) squads.set(key, []);
      squads.get(key)!.push(p);
    } else {
      noSquad.push(p);
    }
  }

  // Sort SLs to top within each squad
  for (const members of squads.values()) {
    members.sort((a, b) => (a.isLeader === b.isLeader ? 0 : a.isLeader ? -1 : 1));
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
          {label} ({totalCount})
        </span>
        {onSearchChange && (
          <input
            type="text"
            value={searchValue || ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-28 rounded-sm border border-border/50 bg-bg-tertiary px-2 py-0.5 text-[10px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        )}
      </div>
      <div className="max-h-96 overflow-auto">
        {Array.from(squads.entries()).map(([key, members]) => (
          <div key={key}>
            <div className="flex items-center justify-between bg-bg-tertiary/50 px-4 py-1">
              <span className="text-[10px] font-medium tracking-wide text-accent uppercase">
                {members[0].squad?.squadName || `Squad ${members[0].squadID}`} ({members.length})
              </span>
              {showActions && members[0].squadID && (
                <button
                  onClick={() => onDisbandSquad(String(members[0].teamID), String(members[0].squadID))}
                  className="rounded-sm px-1.5 py-0.5 text-[9px] text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  Disband
                </button>
              )}
            </div>
            {members.map((p) => (
              <PlayerRow key={p.steamID || p.eosID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} onSwitchTeam={onSwitchTeam} />
            ))}
          </div>
        ))}
        {noSquad.length > 0 && (
          <div>
            {squads.size > 0 && (
              <div className="bg-bg-tertiary/50 px-4 py-1 text-[10px] font-medium tracking-wide text-text-muted uppercase">
                Unassigned ({noSquad.length})
              </div>
            )}
            {noSquad.map((p) => (
              <PlayerRow key={p.steamID || p.eosID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} onSwitchTeam={onSwitchTeam} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRole(role: string): string {
  // SquadJS roles: "USA_Rifleman_01", "RUS_Medic_02", "CAF_SL_01", etc.
  const parts = role.split("_");
  if (parts.length < 2) return role;
  // Remove faction prefix and trailing number
  const filtered = parts.slice(1).filter((p) => !/^\d+$/.test(p));
  return filtered.join(" ") || role;
}

function PlayerRow({
  player,
  showActions = false,
  onWarn,
  onKick,
  onSwitchTeam,
}: {
  player: Player;
  showActions?: boolean;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group flex items-center justify-between border-b border-border/30 px-4 py-1.5 transition-colors hover:bg-bg-tertiary/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {player.isLeader && (
          <svg className="h-3 w-3 flex-shrink-0 text-warning" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )}
        <span className="truncate text-xs text-text-primary">{player.name}</span>
        {player.role && (
          <span className="flex-shrink-0 text-[10px] text-text-muted">{formatRole(player.role)}</span>
        )}
      </div>
      {showActions && hovered && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSwitchTeam(player)}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[10px] text-accent transition-all hover:border-accent/30 hover:bg-accent/10"
            title="Switch team"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
          <button
            onClick={() => onWarn(player)}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[10px] text-warning transition-all hover:border-warning/30 hover:bg-warning/10"
          >
            Warn
          </button>
          <button
            onClick={() => onKick(player)}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[10px] text-danger transition-all hover:border-danger/30 hover:bg-danger/10"
          >
            Kick
          </button>
        </div>
      )}
    </div>
  );
}

function ActionModal({
  title,
  onConfirm,
  onCancel,
  confirmLabel,
  confirmDisabled,
  confirmClass,
  children,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmClass?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-sm border border-border bg-bg-secondary p-6">
          <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
            {title}
          </h3>
          {children}
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={`rounded-sm px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors disabled:opacity-40 ${
                confirmClass || "bg-accent hover:bg-accent-muted"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

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
  currentLayer: string | null;
  nextLayer: string | null;
}

interface ChatMessage {
  chat: string;
  steamID: string;
  name: string;
  message: string;
  time: string;
}

interface Snapshot {
  connected: boolean;
  players: Player[];
  serverInfo: ServerInfo | null;
  chatLog: ChatMessage[];
  tickRate: number | null;
}

type WSMessage =
  | { type: "servers"; data: string[] }
  | { type: "snapshot"; data: Snapshot; server?: string }
  | { type: "event"; event: string; data: unknown; server?: string }
  | { type: "action_result"; success: boolean; error?: string; action?: string };

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

  const chatEndRef = useRef<HTMLDivElement>(null);

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
          setTickRate(msg.data.tickRate);
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
          setServerInfo((prev) => {
            if (!prev) return prev;
            const a2s = data as Record<string, unknown>;
            return {
              ...prev,
              playerCount: (a2s.a2sPlayerCount as number) ?? prev.playerCount,
              currentLayer: (a2s.currentLayer as string) ?? prev.currentLayer,
            };
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
        break;
      case "PLAYER_CONNECTED":
      case "PLAYER_DISCONNECTED":
        // Will be updated by UPDATED_PLAYER_INFORMATION
        break;
    }
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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  function switchServer(key: string) {
    setActiveServer(key);
    setPlayers([]);
    setServerInfo(null);
    setChatLog([]);
    setTickRate(null);
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
      reason: kickReason.trim() || "Kicked by admin",
    });
    setKickTarget(null);
    setKickReason("");
  }

  if (!canView) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  const team1 = players.filter((p) => p.teamID === "1");
  const team2 = players.filter((p) => p.teamID === "2");
  const unassigned = players.filter(
    (p) => p.teamID !== "1" && p.teamID !== "2"
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
        <div className="facet-border mb-6 grid grid-cols-2 gap-4 rounded-sm bg-bg-card p-4 sm:grid-cols-4 lg:grid-cols-6">
          <InfoCell label="Players" value={`${serverInfo.playerCount} / ${serverInfo.maxPlayers}`} />
          <InfoCell label="Queue" value={`${serverInfo.publicQueue + serverInfo.reserveQueue}`} />
          <InfoCell label="Layer" value={serverInfo.currentLayer || "--"} />
          <InfoCell label="Next" value={serverInfo.nextLayer || "--"} />
          <InfoCell label="Tick Rate" value={tickRate ? `${tickRate.toFixed(1)}` : "--"} />
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
                  showActions={canManage}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
                />
                <TeamColumn
                  label="Team 2"
                  players={team2}
                  className="border-t border-border md:border-l md:border-t-0"
                  showActions={canManage}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
                />
              </div>
            )}

            {unassigned.length > 0 && (
              <div className="border-t border-border">
                <TeamColumn
                  label="Unassigned"
                  players={unassigned}
                  showActions={canManage}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
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
          <div className="facet-border flex flex-col rounded-sm bg-bg-card" style={{ height: "500px" }}>
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
                filteredChat.map((msg, i) => (
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
                    <span className="text-text-secondary">{msg.name}:</span>{" "}
                    <span className="text-text-primary">{msg.message}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
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

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-text-primary">
        {value}
      </div>
    </div>
  );
}

function TeamColumn({
  label,
  players,
  className = "",
  showActions = false,
  onWarn,
  onKick,
}: {
  label: string;
  players: Player[];
  className?: string;
  showActions?: boolean;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
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

  return (
    <div className={className}>
      <div className="border-b border-border/50 px-4 py-2">
        <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
          {label} ({players.length})
        </span>
      </div>
      <div className="max-h-96 overflow-auto">
        {Array.from(squads.entries()).map(([key, members]) => (
          <div key={key}>
            <div className="bg-bg-tertiary/50 px-4 py-1 text-[10px] font-medium tracking-wide text-accent uppercase">
              {members[0].squad?.squadName || `Squad ${members[0].squadID}`} ({members.length})
            </div>
            {members.map((p) => (
              <PlayerRow key={p.steamID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} />
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
              <PlayerRow key={p.steamID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  showActions = false,
  onWarn,
  onKick,
}: {
  player: Player;
  showActions?: boolean;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
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
      </div>
      {showActions && hovered && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onWarn(player)}
            className="rounded-sm px-1.5 py-0.5 text-[10px] text-warning transition-colors hover:bg-warning/10"
          >
            Warn
          </button>
          <button
            onClick={() => onKick(player)}
            className="rounded-sm px-1.5 py-0.5 text-[10px] text-danger transition-colors hover:bg-danger/10"
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

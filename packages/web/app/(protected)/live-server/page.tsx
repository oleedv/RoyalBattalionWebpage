"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePermissions } from "@/lib/permission-context";

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
    /^http/,
    "ws"
  );

const FACTION_META: Record<string, { name: string; flag: string }> = {
  USA:    { name: "United States Army",       flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_USA.png" },
  USMC:   { name: "US Marine Corps",          flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_USMC.png" },
  RUS:    { name: "Russian Ground Forces",    flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_RUS.png" },
  GB:     { name: "British Army",             flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_GB.png" },
  CAF:    { name: "Canadian Armed Forces",    flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_CAF.png" },
  AUS:    { name: "Australian Defence Force", flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_AUS.png" },
  MEA:    { name: "Middle Eastern Alliance",  flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_MEA.png" },
  INS:    { name: "Insurgents",               flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_INS.png" },
  MIL:    { name: "Irregular Militia",        flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_MIL.png" },
  PLA:    { name: "People's Liberation Army", flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_PLA.png" },
  PLANMC: { name: "PLA Naval Marine Corps",   flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_PLANMC.png" },
  VDV:    { name: "Russian Airborne",         flag: "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons/flag_VDV.png" },
  TLF:    { name: "Turkish Land Forces",      flag: "" },
};

function getFaction(players: Player[]): { name: string; flag: string } | null {
  for (const p of players) {
    if (!p.role || typeof p.role !== "string") continue;
    const prefix = p.role.split("_")[0];
    if (prefix && FACTION_META[prefix]) return FACTION_META[prefix];
  }
  return null;
}

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
  eosID: string;
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
  type: "warn" | "kick" | "ban" | "broadcast" | "connect" | "disconnect" | "teamkill" | "kill" | "newgame" | "wound" | "revive" | "squad";
  message: string;
}

type ChatFilter = "All" | "ChatAll" | "ChatTeam" | "ChatSquad" | "ChatAdmin";

const CONSOLE_TYPES: ConsoleEntry["type"][] = [
  "warn", "kick", "ban", "broadcast", "connect", "disconnect", "teamkill", "kill", "newgame", "wound", "revive", "squad",
];

const WARN_TEMPLATES = [
  "Stop teamkilling",
  "Stay with your squad",
  "English only in all chat",
  "No locked 1-man squads",
];

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
  const [switchSquadTarget, setSwitchSquadTarget] = useState<{ squadName: string; players: Player[] } | null>(null);
  const [consoleLog, setConsoleLog] = useState<ConsoleEntry[]>([]);
  const [metricHistory, setMetricHistory] = useState<MetricSample[]>([]);
  const [team1Search, setTeam1Search] = useState("");
  const [team2Search, setTeam2Search] = useState("");
  const [consoleFilters, setConsoleFilters] = useState<Set<ConsoleEntry["type"]>>(new Set(CONSOLE_TYPES));
  const [consoleFilterOpen, setConsoleFilterOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Refs for metric sampling interval (needs current values without re-creating interval)
  const serverInfoRef = useRef(serverInfo);
  const tickRateRef = useRef(tickRate);
  serverInfoRef.current = serverInfo;
  tickRateRef.current = tickRate;

  // Sample metrics every 30s from current state
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      const si = serverInfoRef.current;
      if (!si) return;
      setMetricHistory((prev) => {
        const sample: MetricSample = {
          time: Date.now(),
          tickRate: tickRateRef.current,
          playerCount: si.playerCount,
          publicQueue: si.publicQueue,
          reserveQueue: si.reserveQueue,
        };
        const next = [...prev, sample];
        return next.length > 240 ? next.slice(-240) : next;
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, [connected]);

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
      case "CONNECTION_STATUS":
        if (data && typeof data === "object" && "connected" in data) {
          setSquadjsConnected((data as { connected: boolean }).connected);
        }
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
      case "PLAYER_WOUNDED": {
        const pw2 = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
        if (pw2?.attacker?.name && pw2?.victim?.name) {
          addConsoleEntry("wound", `${pw2.attacker.name} wounded ${pw2.victim.name}${pw2.weapon ? ` (${pw2.weapon})` : ""}`);
        }
        break;
      }
      case "PLAYER_DIED": {
        const pd2 = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
        if (pd2?.attacker?.name && pd2?.victim?.name) {
          addConsoleEntry("kill", `${pd2.attacker.name} killed ${pd2.victim.name}${pd2.weapon ? ` (${pd2.weapon})` : ""}`);
        }
        break;
      }
      case "PLAYER_REVIVED": {
        const pr = data as { reviver?: { name?: string }; victim?: { name?: string } };
        if (pr?.reviver?.name && pr?.victim?.name) {
          addConsoleEntry("revive", `${pr.reviver.name} revived ${pr.victim.name}`);
        }
        break;
      }
      case "SQUAD_CREATED": {
        const sc = data as { player?: { name?: string }; squad?: { squadName?: string } };
        if (sc?.squad?.squadName) {
          addConsoleEntry("squad", `Squad "${sc.squad.squadName}" created${sc.player?.name ? ` by ${sc.player.name}` : ""}`);
        }
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
    if (!apiToken) return;
    // Clean up any existing connection without triggering reconnect
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    const ws = new WebSocket(`${WS_BASE}/live-server/ws?token=${apiToken}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Only reconnect if this is still the active WebSocket
      if (wsRef.current === ws) {
        reconnectRef.current = setTimeout(connectWs, 3000);
      }
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
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
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

  function handleSwitchSquad() {
    if (!switchSquadTarget) return;
    for (const p of switchSquadTarget.players) {
      sendAction({
        action: "switchteam",
        steamId: p.steamID,
        eosId: p.eosID,
      });
    }
    setSwitchSquadTarget(null);
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
      case "kill": return "text-red-400";
      case "wound": return "text-orange-400/70";
      case "revive": return "text-emerald-400";
      case "squad": return "text-blue-400";
      case "newgame": return "text-accent font-bold";
      default: return "text-text-secondary";
    }
  }

  function toggleConsoleFilter(type: ConsoleEntry["type"]) {
    setConsoleFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function formatPlaytime(seconds?: number): string {
    if (!seconds || seconds < 60) return "";
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h${mins % 60}m`;
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
            <Sparkline data={metricHistory.map((s) => s.playerCount)} color="var(--color-accent)" fixedMax={serverInfo.maxPlayers || 100} />
          </InfoCell>
          <InfoCell label="Queue" value={`${serverInfo.publicQueue + serverInfo.reserveQueue}`}>
            <Sparkline data={metricHistory.map((s) => s.publicQueue + s.reserveQueue)} color="var(--color-warning)" fixedMax={25} />
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
        <div className="lg:col-span-2 flex flex-col">
          <div className="facet-border flex flex-1 flex-col rounded-sm bg-bg-card">
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
              <>
              <div className="grid flex-1 gap-0 md:grid-cols-2">
                <TeamColumn
                  label="Team 1"
                  players={team1}
                  totalCount={team1All.length}
                  showActions={canManage}
                  searchValue={team1Search}
                  onSearchChange={setTeam1Search}
                  faction={getFaction(team1All)}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                  onSwitchSquad={(name, players) => setSwitchSquadTarget({ squadName: name, players })}
                  onSelectPlayer={setSelectedPlayer}
                  formatPlaytime={formatPlaytime}
                />
                <TeamColumn
                  label="Team 2"
                  players={team2}
                  totalCount={team2All.length}
                  className="border-t border-border md:border-l md:border-t-0"
                  showActions={canManage}
                  searchValue={team2Search}
                  onSearchChange={setTeam2Search}
                  faction={getFaction(team2All)}
                  onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
                  onKick={(p) => { setKickTarget(p); setKickReason(""); }}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                  onSwitchSquad={(name, players) => setSwitchSquadTarget({ squadName: name, players })}
                  onSelectPlayer={setSelectedPlayer}
                  formatPlaytime={formatPlaytime}
                />
              </div>
              </>
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
                  onSwitchSquad={(name, players) => setSwitchSquadTarget({ squadName: name, players })}
                  onSelectPlayer={setSelectedPlayer}
                  formatPlaytime={formatPlaytime}
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
                  const player = players.find((p) => p.steamID === msg.steamID || p.eosID === msg.eosID);
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
            <div className="border-b border-border px-4 py-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                  Console
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setConsoleFilterOpen((v) => !v)}
                      className="flex items-center gap-1 text-[10px] text-text-muted transition-colors hover:text-text-secondary"
                    >
                      Filters
                      {consoleFilters.size < CONSOLE_TYPES.length && (
                        <span className="rounded-sm bg-accent/15 px-1 text-[9px] font-bold text-accent">
                          {consoleFilters.size}/{CONSOLE_TYPES.length}
                        </span>
                      )}
                    </button>
                    {consoleFilterOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setConsoleFilterOpen(false)}
                        />
                        <div className="absolute right-0 top-full z-50 mt-1 rounded-sm border border-border bg-bg-secondary p-2 shadow-lg">
                          <div className="flex flex-wrap gap-1" style={{ width: "220px" }}>
                            {CONSOLE_TYPES.map((t) => (
                              <button
                                key={t}
                                onClick={() => toggleConsoleFilter(t)}
                                className={`rounded-sm px-1.5 py-0.5 text-[9px] font-medium tracking-wide transition-colors ${
                                  consoleFilters.has(t)
                                    ? "bg-accent/10 text-accent"
                                    : "text-text-muted/50 line-through"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setConsoleLog([])}
                    className="text-[10px] text-text-muted transition-colors hover:text-text-secondary"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-4 py-2 font-mono">
              {consoleLog.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  No events yet
                </div>
              ) : (
                consoleLog
                  .filter((e) => consoleFilters.has(e.type))
                  .map((entry, i) => (
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
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {WARN_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWarnMsg(t)}
                  className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                    warnMsg === t
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-border text-text-muted hover:border-warning/20 hover:text-text-secondary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={warnMsg}
              onChange={(e) => setWarnMsg(e.target.value)}
              placeholder="Warning message..."
              className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              autoFocus
            />
          </div>
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

      {/* Switch squad modal */}
      {switchSquadTarget && (
        <ActionModal
          title={`Switch Squad: ${switchSquadTarget.squadName}`}
          onConfirm={handleSwitchSquad}
          onCancel={() => setSwitchSquadTarget(null)}
          confirmLabel={`Switch ${switchSquadTarget.players.length} Players`}
          confirmClass="bg-warning hover:bg-warning/80"
        >
          <div className="space-y-3 text-sm">
            <div className="rounded-sm border border-warning/20 bg-warning/5 px-3 py-2 text-warning">
              This is a force team switch. It may exceed the 50-player team cap.
            </div>
            <p className="text-text-secondary">
              All {switchSquadTarget.players.length} players in this squad will be moved to the other team individually.
            </p>
            <p className="text-xs text-text-muted">
              A queue-based switch system is planned for a future update.
            </p>
          </div>
        </ActionModal>
      )}

      {/* Player card */}
      {selectedPlayer && (
        <PlayerCard
          player={selectedPlayer}
          showActions={canManage}
          onClose={() => setSelectedPlayer(null)}
          onWarn={(p) => { setWarnTarget(p); setWarnMsg(""); }}
          onKick={(p) => { setKickTarget(p); setKickReason(""); }}
          onSwitchTeam={handleSwitchTeam}
          formatPlaytime={formatPlaytime}
        />
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

function Sparkline({ data, color, height = 48, fixedMax }: { data: number[]; color: string; height?: number; fixedMax?: number }) {
  if (data.length < 2) return null;
  const width = 120;
  const max = fixedMax ?? Math.max(...data, 1);
  const min = 0;
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
  faction,
  onWarn,
  onKick,
  onSwitchTeam,
  onDisbandSquad,
  onSwitchSquad,
  onSelectPlayer,
  formatPlaytime,
}: {
  label: string;
  players: Player[];
  totalCount: number;
  className?: string;
  showActions?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  faction?: { name: string; flag: string } | null;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
  onDisbandSquad: (teamID: string, squadID: string) => void;
  onSwitchSquad: (squadName: string, players: Player[]) => void;
  onSelectPlayer: (p: Player) => void;
  formatPlaytime: (s?: number) => string;
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
        <div className="flex items-center gap-2">
          {faction?.flag && (
            <img src={faction.flag} alt={faction.name} className="h-4 w-4 object-contain" />
          )}
          <div className="flex flex-col">
            <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
              {label} ({totalCount})
            </span>
            {faction && (
              <span className="text-[10px] text-text-muted/70">{faction.name}</span>
            )}
          </div>
        </div>
        {onSearchChange && (
          <div className="relative">
            <input
              type="text"
              value={searchValue || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="w-28 rounded-sm border border-border/50 bg-bg-tertiary px-2 py-0.5 pr-5 text-[10px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            {searchValue && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {Array.from(squads.entries()).map(([key, members]) => (
          <div key={key}>
            <div className="flex items-center justify-between bg-bg-tertiary/50 px-4 py-1">
              <span className="text-[10px] font-medium tracking-wide text-accent uppercase">
                {members[0].squad?.squadName || `Squad ${members[0].squadID}`} ({members.length})
              </span>
              {showActions && members[0].squadID && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onSwitchSquad(members[0].squad?.squadName || `Squad ${members[0].squadID}`, members)}
                    className="rounded-sm px-1.5 py-0.5 text-[9px] text-warning/70 transition-colors hover:bg-warning/10 hover:text-warning"
                    title="Switch entire squad to the other team"
                  >
                    Switch
                  </button>
                  <button
                    onClick={() => onDisbandSquad(String(members[0].teamID), String(members[0].squadID))}
                    className="rounded-sm px-1.5 py-0.5 text-[9px] text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    Disband
                  </button>
                </div>
              )}
            </div>
            {members.map((p) => (
              <PlayerRow key={p.steamID || p.eosID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} onSwitchTeam={onSwitchTeam} onSelect={onSelectPlayer} formatPlaytime={formatPlaytime} />
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
              <PlayerRow key={p.steamID || p.eosID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} onSwitchTeam={onSwitchTeam} onSelect={onSelectPlayer} formatPlaytime={formatPlaytime} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRole(role: string): string {
  if (!role || typeof role !== "string") return role ? String(role) : "Unknown";
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
  onSelect,
  formatPlaytime,
}: {
  player: Player;
  showActions?: boolean;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
  onSelect: (p: Player) => void;
  formatPlaytime: (s?: number) => string;
}) {
  const [hovered, setHovered] = useState(false);
  const pt = formatPlaytime(player.playtime);

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
        <button
          onClick={() => onSelect(player)}
          className="truncate text-xs text-text-primary hover:text-accent hover:underline"
        >
          {player.name}
        </button>
        {player.role && (
          <span className="flex-shrink-0 text-[10px] text-text-muted">{formatRole(player.role)}</span>
        )}
        {pt && (
          <span className="flex-shrink-0 rounded-sm bg-bg-tertiary px-1 py-0.5 text-[9px] text-text-muted">{pt}</span>
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


function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = value.length > 20 ? value.slice(0, 12) + "..." : value;

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-text-muted">{label}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent"
        title={value}
      >
        <code>{truncated}</code>
        <span className="text-[9px] text-text-muted">{copied ? "Copied!" : "Copy"}</span>
      </button>
    </div>
  );
}

function PlayerCard({
  player,
  showActions,
  onClose,
  onWarn,
  onKick,
  onSwitchTeam,
  formatPlaytime,
}: {
  player: Player;
  showActions: boolean;
  onClose: () => void;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
  formatPlaytime: (s?: number) => string;
}) {
  const pt = formatPlaytime(player.playtime);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xs rounded-sm border border-border bg-bg-secondary p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">{player.name}</span>
                {player.isLeader && (
                  <svg className="h-3 w-3 text-warning" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                )}
              </div>
              {player.role && (
                <span className="text-[10px] text-text-muted">{formatRole(player.role)}</span>
              )}
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary">x</button>
          </div>

          <div className="mb-3 space-y-1.5 rounded-sm border border-border/50 bg-bg-tertiary/50 p-2">
            {player.steamID && <CopyableField label="Steam ID" value={player.steamID} />}
            {player.eosID && <CopyableField label="EOS ID" value={player.eosID} />}
            {pt && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Playtime</span>
                <span className="text-xs text-text-secondary">{pt}</span>
              </div>
            )}
            {player.squad && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Squad</span>
                <span className="text-xs text-text-secondary">
                  {player.squad.squadName}
                  {player.squad.creatorName && (
                    <span className="text-text-muted"> (by {player.squad.creatorName})</span>
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Team</span>
              <span className={`text-xs font-medium ${String(player.teamID) === "1" ? "text-blue-400" : String(player.teamID) === "2" ? "text-red-400" : "text-text-muted"}`}>
                Team {player.teamID}
              </span>
            </div>
          </div>

          {showActions && (
            <div className="flex gap-2">
              <button
                onClick={() => { onSwitchTeam(player); onClose(); }}
                className="flex-1 rounded-sm border border-accent/20 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
              >
                Switch Team
              </button>
              <button
                onClick={() => { onWarn(player); onClose(); }}
                className="flex-1 rounded-sm border border-warning/20 py-1.5 text-xs text-warning transition-colors hover:bg-warning/10"
              >
                Warn
              </button>
              <button
                onClick={() => { onKick(player); onClose(); }}
                className="flex-1 rounded-sm border border-danger/20 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10"
              >
                Kick
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

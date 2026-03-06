"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePermissions } from "@/lib/permission-context";
import { Modal } from "@/components/modal";

import type { Player, ServerInfo, ChatMessage, ConsoleEntry, MetricSample, WSMessage, OnlineClanData, ChatFilter, RandomizationStatus } from "./lib/types";
import { handleGameEvent, type GameEventAction } from "./lib/handle-game-event";
import { InfoCell } from "./components/info-cell";
import { Sparkline } from "./components/sparkline";
import { MapImg, getMapThumbnailUrls } from "./components/map-img";
import { TeamColumn } from "./components/team-column";
import { PlayerCard } from "./components/player-card";

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

function getFaction(players: Player[], serverFaction?: string): { name: string; flag: string } | null {
  if (serverFaction) {
    for (const key of Object.keys(FACTION_META)) {
      if (serverFaction === key || serverFaction.endsWith(`_${key}`)) return FACTION_META[key];
    }
  }
  for (const p of players) {
    if (!p.role || typeof p.role !== "string") continue;
    const prefix = p.role.split("_")[0];
    if (prefix && FACTION_META[prefix]) return FACTION_META[prefix];
  }
  return null;
}

const CONSOLE_TYPES: ConsoleEntry["type"][] = [
  "warn", "kick", "ban", "broadcast", "connect", "disconnect", "teamkill", "kill", "newgame", "wound", "revive", "squad",
  "admincam", "rconerror", "teamchange", "squadchange", "autokick", "roundend",
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
  const canClanMove = hasPermission("manage:clan-move");
  const canRandomize = hasPermission("manage:randomize");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connected, setConnected] = useState(false);
  const [squadjsConnected, setSquadjsConnected] = useState(false);
  const [squadjsConfigured, setSquadjsConfigured] = useState(true);
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
  const [consoleFilters, setConsoleFilters] = useState<Set<ConsoleEntry["type"]>>(() => {
    if (typeof window === "undefined") return new Set(CONSOLE_TYPES);
    try {
      const stored = localStorage.getItem("rb-console-filters");
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set(CONSOLE_TYPES);
  });
  const [consoleFilterOpen, setConsoleFilterOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [activity, setActivity] = useState(false);
  const activityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server management actions
  const [endMatchConfirm, setEndMatchConfirm] = useState(false);
  const [nextLayerInput, setNextLayerInput] = useState("");
  const [onlineClans, setOnlineClans] = useState<OnlineClanData>({});
  const [clanMoveModalOpen, setClanMoveModalOpen] = useState(false);
  const [clanMoveTargetTeam, setClanMoveTargetTeam] = useState<"1" | "2">("1");
  const [clanMoveSelectedKey, setClanMoveSelectedKey] = useState<string | null>(null);
  const [randomizationStatus, setRandomizationStatus] = useState<RandomizationStatus | null>(null);
  const [randomizeModalOpen, setRandomizeModalOpen] = useState(false);
  const [randomizeMode, setRandomizeMode] = useState<"all" | "squad">("all");
  const [demoteDropdownOpen, setDemoteDropdownOpen] = useState(false);
  const demoteDropdownRef = useRef<HTMLDivElement>(null);

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

  const applyGameEventActions = useCallback((actions: GameEventAction[]) => {
    for (const action of actions) {
      switch (action.type) {
        case "setPlayers":
          setPlayers(action.players);
          break;
        case "setServerInfo":
          setServerInfo(action.updater);
          break;
        case "setSquadjsConnected":
          setSquadjsConnected(action.connected);
          break;
        case "appendChat":
          setChatLog((prev) => {
            const next = [...prev, action.message];
            return next.length > 100 ? next.slice(-100) : next;
          });
          break;
        case "setTickRate":
          setTickRate(action.tickRate);
          break;
        case "appendConsole":
          setConsoleLog((prev) => {
            const next = [...prev, { time: new Date().toISOString(), ...action.entry }];
            return next.length > 200 ? next.slice(-200) : next;
          });
          break;
        case "requestClanRefresh":
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "get_online_clans" }));
          }
          break;
        case "setRandomizationStatus":
          setRandomizationStatus(action.status);
          break;
      }
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (activityTimeout.current) clearTimeout(activityTimeout.current);
    setActivity(true);
    activityTimeout.current = setTimeout(() => setActivity(false), 150);

    try {
      const msg: WSMessage = JSON.parse(event.data);

      switch (msg.type) {
        case "servers": {
          setServerKeys(msg.data);
          const stored = localStorage.getItem("rb-default-server");
          const initial = (stored && msg.data.includes(stored)) ? stored : msg.data[0];
          setActiveServer((prev) =>
            !prev && msg.data.length > 0 ? initial : prev
          );
          break;
        }
        case "snapshot":
          if (msg.configured !== undefined) setSquadjsConfigured(msg.configured);
          setSquadjsConnected(msg.data.connected);
          setPlayers(msg.data.players);
          setServerInfo(msg.data.serverInfo);
          setChatLog(msg.data.chatLog);
          if (msg.data.consoleLog?.length) setConsoleLog(msg.data.consoleLog);
          setTickRate(msg.data.tickRate);
          if (msg.data.metricHistory?.length) setMetricHistory(msg.data.metricHistory);
          if (msg.data.randomizationStatus != null) setRandomizationStatus(msg.data.randomizationStatus);
          // Request clan data after snapshot
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "get_online_clans" }));
          }
          break;
        case "event": {
          const actions = handleGameEvent(msg.event, msg.data);
          applyGameEventActions(actions);
          break;
        }
        case "action_result":
          if (msg.success) {
            setActionFeedback(`${msg.action} executed successfully`);
          } else {
            setActionFeedback(`Error: ${msg.error}`);
          }
          setTimeout(() => setActionFeedback(null), 4000);
          break;
        case "online_clans":
          setOnlineClans(msg.data);
          break;
      }
    } catch (err) {
      console.error("[live-server] Failed to process WebSocket message:", err, event.data);
    }
  }, [applyGameEventActions]);

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

    const ws = new WebSocket(`${WS_BASE}/live-server/ws`, [`auth-${apiToken}`]);
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

  // Auto-scroll chat & console (use container scrollTo to avoid pulling the page)
  useEffect(() => {
    const el = chatEndRef.current?.parentElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chatLog]);
  useEffect(() => {
    const el = consoleEndRef.current?.parentElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [consoleLog]);

  // Close demote dropdown on outside click
  useEffect(() => {
    if (!demoteDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (demoteDropdownRef.current && !demoteDropdownRef.current.contains(e.target as Node)) {
        setDemoteDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [demoteDropdownOpen]);

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

  const handleWarn = useCallback(() => {
    if (!warnTarget || !warnMsg.trim()) return;
    sendAction({
      action: "warn",
      steamId: warnTarget.steamID,
      eosId: warnTarget.eosID,
      playerName: warnTarget.name,
      message: warnMsg.trim(),
    });
    setWarnTarget(null);
    setWarnMsg("");
  }, [warnTarget, warnMsg]);

  const handleKick = useCallback(() => {
    if (!kickTarget) return;
    sendAction({
      action: "kick",
      steamId: kickTarget.steamID,
      eosId: kickTarget.eosID,
      playerName: kickTarget.name,
      reason: kickReason.trim() || "Kicked by admin",
    });
    setKickTarget(null);
    setKickReason("");
  }, [kickTarget, kickReason]);

  const handleSwitchTeam = useCallback((player: Player) => {
    sendAction({
      action: "switchteam",
      steamId: player.steamID,
      eosId: player.eosID,
      playerName: player.name,
    });
  }, []);

  const handleDisbandSquad = useCallback((teamID: string, squadID: string) => {
    sendAction({ action: "disband", teamID, squadID });
  }, []);

  const handleSwitchSquad = useCallback(() => {
    if (!switchSquadTarget) return;
    sendAction({
      action: "switchsquad",
      players: switchSquadTarget.players.map((p) => ({
        steamId: p.steamID,
        eosId: p.eosID,
        name: p.name,
      })),
    });
    setSwitchSquadTarget(null);
  }, [switchSquadTarget]);

  function handleEndMatch() {
    sendAction({ action: "endmatch" });
    setEndMatchConfirm(false);
  }

  function handleSetNextLayer() {
    if (!nextLayerInput.trim()) return;
    sendAction({ action: "setnextlayer", message: nextLayerInput.trim() });
    setNextLayerInput("");
  }

  function handleDemoteCommander(player: Player) {
    sendAction({ action: "demotecommander", steamId: player.steamID, eosId: player.eosID, playerName: player.name });
  }

  function handleSwitchClan(mode: "move" | "queue") {
    if (!clanMoveSelectedKey) return;
    const clan = onlineClans[clanMoveSelectedKey];
    if (!clan) return;
    const action = mode === "queue" ? "queueclan" : "switchclan";
    if (clan.id) {
      sendAction({ action, clanId: clan.id, targetTeam: clanMoveTargetTeam });
    } else {
      sendAction({ action, clanTag: clan.tag, targetTeam: clanMoveTargetTeam });
    }
    setClanMoveModalOpen(false);
    setClanMoveSelectedKey(null);
  }

  function handleQueueRandomize(mode: "all" | "squad") {
    sendAction({ action: "queuerandomize", message: mode });
  }

  function handleRunRandomize(mode: "all" | "squad") {
    sendAction({ action: "runrandomize", message: mode });
  }

  function handleCancelRandomize() {
    sendAction({ action: "cancelrandomize" });
  }

  function isCommander(player: Player): boolean {
    return typeof player.role === "string" && player.role.includes("_Cmd_");
  }

  function getTeamCommander(teamId: string): Player | undefined {
    return players.find((p) => String(p.teamID) === teamId && isCommander(p));
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
      case "admincam": return "text-purple-400";
      case "rconerror": return "text-danger font-bold";
      case "teamchange": return "text-blue-400/70";
      case "squadchange": return "text-text-muted";
      case "autokick": return "text-danger";
      case "roundend": return "text-accent font-bold";
      default: return "text-text-secondary";
    }
  }

  function toggleConsoleFilter(type: ConsoleEntry["type"]) {
    setConsoleFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      localStorage.setItem("rb-console-filters", JSON.stringify([...next]));
      return next;
    });
  }

  const formatPlaytime = useCallback((seconds?: number): string => {
    if (!seconds || seconds < 60) return "";
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h${mins % 60}m`;
  }, []);

  const onWarnPlayer = useCallback((p: Player) => { setWarnTarget(p); setWarnMsg(""); }, []);
  const onKickPlayer = useCallback((p: Player) => { setKickTarget(p); setKickReason(""); }, []);
  const onSwitchSquadCallback = useCallback((name: string, squadPlayers: Player[]) => setSwitchSquadTarget({ squadName: name, players: squadPlayers }), []);
  const onSelectPlayer = useCallback((p: Player) => setSelectedPlayer(p), []);

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
      : chatLog.filter((m) => m.chat === chatFilter || m.chat === "__DIVIDER__");

  // Compute clans that can be moved to a target team
  function getMovableClans(targetTeam: string): { key: string; tag: string; count: number; team1: number; team2: number }[] {
    const result: { key: string; tag: string; count: number; team1: number; team2: number }[] = [];
    for (const [key, clan] of Object.entries(onlineClans)) {
      const team1 = clan.members.filter((m) => String(m.teamID) === "1").length;
      const team2 = clan.members.filter((m) => String(m.teamID) === "2").length;
      const toMove = clan.members.filter((m) => m.teamID !== targetTeam).length;
      if (toMove > 0) result.push({ key, tag: clan.tag, count: toMove, team1, team2 });
    }
    return result.sort((a, b) => b.count - a.count);
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-3rem)] lg:overflow-hidden">
      <div className="shrink-0">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
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
              className={`h-2 w-2 rounded-full transition-all duration-150 ${
                connected && squadjsConnected
                  ? "bg-success"
                  : connected
                    ? "bg-warning"
                    : "bg-danger"
              } ${activity ? "scale-150 brightness-150" : ""}`}
            />
            <span className="text-xs text-text-muted">
              {connected && squadjsConnected
                ? "Connected"
                : connected && !squadjsConfigured
                  ? "SquadJS not configured (SQUADJS_SERVERS env var missing)"
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
        <div className="facet-border mb-4 grid grid-cols-2 gap-3 rounded-sm bg-bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
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

      {/* Admin Controls */}
      {canManage && serverInfo && connected && (
        <div className="facet-border mb-4 flex flex-wrap items-center gap-3 rounded-sm bg-bg-card p-3">
          {/* End Match */}
          <button
            onClick={() => setEndMatchConfirm(true)}
            className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
          >
            End Match
          </button>

          {/* Set Next Layer */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={nextLayerInput}
              onChange={(e) => setNextLayerInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSetNextLayer(); }}
              placeholder="Layer name..."
              className="w-48 rounded-sm border border-border/50 bg-bg-tertiary px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleSetNextLayer}
              disabled={!nextLayerInput.trim()}
              className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
            >
              Set Next Layer
            </button>
          </div>

          <div className="h-6 w-px bg-border/50" />

          {/* Demote Commander */}
          {(() => {
            const cmd1 = getTeamCommander("1");
            const cmd2 = getTeamCommander("2");
            const commanders = [
              ...(cmd1 ? [{ team: "1" as const, player: cmd1 }] : []),
              ...(cmd2 ? [{ team: "2" as const, player: cmd2 }] : []),
            ];
            return (
              <div className="relative" ref={demoteDropdownRef}>
                <button
                  onClick={() => setDemoteDropdownOpen((v) => !v)}
                  disabled={commanders.length === 0}
                  className="rounded-sm border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/15 disabled:opacity-40"
                >
                  Demote Commander
                </button>
                {demoteDropdownOpen && commanders.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-sm border border-border bg-bg-secondary shadow-lg">
                    {commanders.map(({ team, player }) => (
                      <button
                        key={player.steamID || player.eosID}
                        onClick={() => { handleDemoteCommander(player); setDemoteDropdownOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-bg-tertiary"
                      >
                        <span className={`font-medium ${team === "1" ? "text-blue-400" : "text-red-400"}`}>T{team}</span>
                        <span className="text-text-primary">{player.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="h-6 w-px bg-border/50" />

          {/* Move Clan */}
          {canClanMove && (
            <button
              onClick={() => setClanMoveModalOpen(true)}
              disabled={Object.keys(onlineClans).length === 0}
              className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
            >
              Move Clan
            </button>
          )}

          {/* Randomize Teams */}
          {canRandomize && (
            <>
              <div className="h-6 w-px bg-border/50" />
              {randomizationStatus?.pending ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-warning">
                    Randomize ({randomizationStatus.mode}) queued
                  </span>
                  <button
                    onClick={handleCancelRandomize}
                    className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setRandomizeModalOpen(true)}
                  className="rounded-sm border border-purple-500/30 bg-purple-500/5 px-3 py-1.5 text-xs font-medium text-purple-400 transition-colors hover:bg-purple-500/15"
                >
                  Randomize
                </button>
              )}
            </>
          )}
        </div>
      )}
      </div>{/* end shrink-0 */}

      {/* End Match confirmation */}
      <Modal open={endMatchConfirm} onClose={() => setEndMatchConfirm(false)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          End Match
        </h3>
        <p className="text-sm text-text-secondary">
          Are you sure you want to end the current match? This will immediately end the game for all players.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => setEndMatchConfirm(false)}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleEndMatch}
            className="rounded-sm bg-danger px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-danger/80 disabled:opacity-40"
          >
            End Match
          </button>
        </div>
      </Modal>

      {/* Clan move modal */}
      <Modal open={clanMoveModalOpen} onClose={() => { setClanMoveModalOpen(false); setClanMoveSelectedKey(null); }} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Move Clan
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-text-muted uppercase">Target Team</label>
            <div className="flex gap-2">
              {(["1", "2"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setClanMoveTargetTeam(t); setClanMoveSelectedKey(null); }}
                  className={`flex-1 rounded-sm border px-4 py-2 text-sm font-medium transition-colors ${
                    clanMoveTargetTeam === t
                      ? t === "1" ? "border-blue-500/40 bg-blue-500/10 text-blue-400" : "border-red-500/40 bg-red-500/10 text-red-400"
                      : "border-border bg-bg-tertiary text-text-muted hover:text-text-primary"
                  }`}
                >
                  Team {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-text-muted uppercase">Select Clan</label>
            {getMovableClans(clanMoveTargetTeam).length === 0 ? (
              <p className="text-sm text-text-muted">No clans with players to move to this team.</p>
            ) : (
              <div className="space-y-1">
                {getMovableClans(clanMoveTargetTeam).map((clan) => (
                  <button
                    key={clan.key}
                    type="button"
                    onClick={() => setClanMoveSelectedKey(clan.key)}
                    className={`flex w-full items-center justify-between rounded-sm border px-3 py-2 text-sm transition-colors ${
                      clanMoveSelectedKey === clan.key
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 hover:text-text-primary"
                    }`}
                  >
                    <span>[{clan.tag}]</span>
                    <span className="text-xs text-text-muted">T1: {clan.team1} / T2: {clan.team2} ({clan.count} to move)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {clanMoveSelectedKey && onlineClans[clanMoveSelectedKey] && (() => {
            const members = onlineClans[clanMoveSelectedKey].members;
            const willMove = members.filter((m) => String(m.teamID) !== clanMoveTargetTeam);
            const alreadyOn = members.filter((m) => String(m.teamID) === clanMoveTargetTeam);
            return (
              <div className="space-y-2">
                {willMove.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-warning uppercase">Will be moved ({willMove.length})</p>
                    <div className="space-y-0.5">
                      {willMove.map((m) => (
                        <div key={m.steamId} className="flex items-center justify-between rounded-sm border border-warning/20 bg-warning/5 px-2.5 py-1">
                          <span className="text-xs text-text-primary">{m.name}</span>
                          <span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-blue-400" : "text-red-400"}`}>T{m.teamID}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {alreadyOn.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-green-400 uppercase">Already on Team {clanMoveTargetTeam} ({alreadyOn.length})</p>
                    <div className="space-y-0.5">
                      {alreadyOn.map((m) => (
                        <div key={m.steamId} className="flex items-center justify-between rounded-sm border border-green-500/20 bg-green-500/5 px-2.5 py-1">
                          <span className="text-xs text-text-primary">{m.name}</span>
                          <span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-blue-400" : "text-red-400"}`}>T{m.teamID}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => { setClanMoveModalOpen(false); setClanMoveSelectedKey(null); }}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSwitchClan("queue")}
            disabled={!clanMoveSelectedKey}
            className="rounded-sm border border-accent/30 bg-accent/5 px-5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
          >
            {clanMoveSelectedKey ? `Queue ${getMovableClans(clanMoveTargetTeam).find((c) => c.key === clanMoveSelectedKey)?.count || 0} players` : "Queue Move"}
          </button>
          <button
            onClick={() => handleSwitchClan("move")}
            disabled={!clanMoveSelectedKey}
            className="rounded-sm bg-warning px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-warning/80 disabled:opacity-40"
          >
            {clanMoveSelectedKey ? `Move ${getMovableClans(clanMoveTargetTeam).find((c) => c.key === clanMoveSelectedKey)?.count || 0} players` : "Select a clan"}
          </button>
        </div>
      </Modal>

      {/* Randomize modal */}
      <Modal open={randomizeModalOpen} onClose={() => setRandomizeModalOpen(false)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Randomize Teams
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-text-muted uppercase">Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRandomizeMode("all")}
                className={`flex-1 rounded-sm border px-4 py-2 text-sm font-medium transition-colors ${
                  randomizeMode === "all"
                    ? "border-purple-500/40 bg-purple-500/10 text-purple-400"
                    : "border-border bg-bg-tertiary text-text-muted hover:text-text-primary"
                }`}
              >
                All Players
              </button>
              <button
                type="button"
                onClick={() => setRandomizeMode("squad")}
                className={`flex-1 rounded-sm border px-4 py-2 text-sm font-medium transition-colors ${
                  randomizeMode === "squad"
                    ? "border-purple-500/40 bg-purple-500/10 text-purple-400"
                    : "border-border bg-bg-tertiary text-text-muted hover:text-text-primary"
                }`}
              >
                By Squads
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              {randomizeMode === "all"
                ? "Shuffles all players individually between teams (breaks squads)."
                : "Shuffles squads as units between teams (keeps squads together)."}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => setRandomizeModalOpen(false)}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={() => { handleQueueRandomize(randomizeMode); setRandomizeModalOpen(false); }}
            className="rounded-sm border border-purple-500/30 bg-purple-500/5 px-5 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/15"
            title="Will queue and execute after next game starts"
          >
            Queue
          </button>
          <button
            onClick={() => { handleRunRandomize(randomizeMode); setRandomizeModalOpen(false); }}
            className="rounded-sm bg-purple-500 px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-purple-500/80"
            title="Will execute immediately"
          >
            Run
          </button>
        </div>
      </Modal>

      {/* Main grid: Players + Chat */}
      <div className="grid gap-4 lg:grid-cols-3 flex-1 min-h-0">
        {/* Player list - 2 cols */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <div className="facet-border flex flex-1 flex-col min-h-0 rounded-sm bg-bg-card">
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
              <div className="grid gap-0 md:grid-cols-2 overflow-y-auto flex-1 min-h-0">
                <TeamColumn
                  label="Team 1"
                  players={team1}
                  totalCount={team1All.length}
                  showActions={canManage}
                  searchValue={team1Search}
                  onSearchChange={setTeam1Search}
                  faction={getFaction(team1All, serverInfo?.team1Faction)}
                  onWarn={onWarnPlayer}
                  onKick={onKickPlayer}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                  onSwitchSquad={onSwitchSquadCallback}
                  onSelectPlayer={onSelectPlayer}
                  formatPlaytime={formatPlaytime}
                  teamId="1"
                />
                <TeamColumn
                  label="Team 2"
                  players={team2}
                  totalCount={team2All.length}
                  className="border-t border-border md:border-l md:border-t-0"
                  showActions={canManage}
                  searchValue={team2Search}
                  onSearchChange={setTeam2Search}
                  faction={getFaction(team2All, serverInfo?.team2Faction)}
                  onWarn={onWarnPlayer}
                  onKick={onKickPlayer}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                  onSwitchSquad={onSwitchSquadCallback}
                  onSelectPlayer={onSelectPlayer}
                  formatPlaytime={formatPlaytime}
                  teamId="2"
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
                  onWarn={onWarnPlayer}
                  onKick={onKickPlayer}
                  onSwitchTeam={handleSwitchTeam}
                  onDisbandSquad={handleDisbandSquad}
                  onSwitchSquad={onSwitchSquadCallback}
                  onSelectPlayer={onSelectPlayer}
                  formatPlaytime={formatPlaytime}
                />
              </div>
            )}
          </div>
        </div>

        {/* Chat + Broadcast */}
        <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
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
          <div className="facet-border flex min-h-[200px] lg:min-h-0 flex-1 flex-col rounded-sm bg-bg-card">
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
                  if (msg.chat === "__DIVIDER__") {
                    return (
                      <div key={i} className="my-2 flex items-center gap-2">
                        <div className="flex-1 border-t border-border" />
                        <span className="whitespace-nowrap text-[10px] text-text-muted">New Game: {msg.message}</span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                    );
                  }
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
          <div className="facet-border flex min-h-[200px] lg:min-h-0 flex-1 flex-col rounded-sm bg-bg-card">
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
      <Modal open={!!warnTarget} onClose={() => setWarnTarget(null)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Warn {warnTarget?.name}
        </h3>
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
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => setWarnTarget(null)}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleWarn}
            disabled={!warnMsg.trim()}
            className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-40"
          >
            Send Warning
          </button>
        </div>
      </Modal>

      {/* Kick modal */}
      <Modal open={!!kickTarget} onClose={() => setKickTarget(null)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Kick {kickTarget?.name}
        </h3>
        <input
          type="text"
          value={kickReason}
          onChange={(e) => setKickReason(e.target.value)}
          placeholder="Reason (optional)..."
          className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => setKickTarget(null)}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleKick}
            className="rounded-sm bg-danger px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-danger/80 disabled:opacity-40"
          >
            Kick Player
          </button>
        </div>
      </Modal>

      {/* Switch squad modal */}
      <Modal open={!!switchSquadTarget} onClose={() => setSwitchSquadTarget(null)} className="max-w-md bg-bg-secondary p-6">
        <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
          Switch Squad: {switchSquadTarget?.squadName}
        </h3>
        <div className="space-y-3 text-sm">
          <div className="rounded-sm border border-warning/20 bg-warning/5 px-3 py-2 text-warning">
            This is a force team switch. It may exceed the 50-player team cap.
          </div>
          <p className="text-text-secondary">
            All {switchSquadTarget?.players.length} players in this squad will be moved to the other team individually.
          </p>
          <p className="text-xs text-text-muted">
            A queue-based switch system is planned for a future update.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => setSwitchSquadTarget(null)}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSwitchSquad}
            className="rounded-sm bg-warning px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-warning/80 disabled:opacity-40"
          >
            Switch {switchSquadTarget?.players.length} Players
          </button>
        </div>
      </Modal>

      {/* Player card */}
      {selectedPlayer && (
        <PlayerCard
          player={selectedPlayer}
          showActions={canManage}
          onClose={() => setSelectedPlayer(null)}
          onWarn={onWarnPlayer}
          onKick={onKickPlayer}
          onSwitchTeam={handleSwitchTeam}
          formatPlaytime={formatPlaytime}
        />
      )}
    </div>
  );
}

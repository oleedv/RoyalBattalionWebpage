"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePermissions } from "@/lib/permission-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { SkeletonStatGrid } from "@/components/skeleton";

import type { Player, ServerInfo, ChatMessage, ConsoleEntry, MetricSample, WSMessage, OnlineClanData, ChatFilter, RandomizationStatus } from "./lib/types";
import { handleGameEvent, type GameEventAction } from "./lib/handle-game-event";
import { InfoCell } from "./components/info-cell";
import { AreaSparkline } from "@/components/sparkline";
import { ConnectionStatus, ServerScope } from "@/components/connection-status";
import { MapImg, getMapThumbnailUrls } from "./components/map-img";
import { TeamColumn } from "./components/team-column";
import { PlayerCard } from "./components/player-card";
import { LiveServerTabs } from "./components/live-server-tabs";

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
  const { apiToken, hasPermission, permissions } = usePermissions();
  const canView = hasPermission("view:live-server") || hasPermission("manage:live-server");
  const canManage = hasPermission("manage:live-server");
  const isDeveloper = permissions.includes("developer");
  const canClanMove = hasPermission("manage:clan-move");
  const canRandomize = hasPermission("manage:randomize");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiTokenRef = useRef(apiToken);
  apiTokenRef.current = apiToken;
  // Tracks whether the first server snapshot has ever arrived, so the
  // pre-first-frame skeleton shows only until the initial snapshot and
  // never flashes again on later socket events or server switches.
  const hasSnapshotRef = useRef(false);

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
  const activeServerRef = useRef(activeServer);
  activeServerRef.current = activeServer;

  // Admin actions
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [warnTarget, setWarnTarget] = useState<Player | null>(null);
  const [warnMsg, setWarnMsg] = useState("");
  const [kickTarget, setKickTarget] = useState<Player | null>(null);
  const [kickReason, setKickReason] = useState("");
  const [banTarget, setBanTarget] = useState<Player | null>(null);
  const [banLength, setBanLength] = useState("1d");
  const [banReason, setBanReason] = useState("");
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
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [nextLayerInput, setNextLayerInput] = useState("");
  const [changeLayerInput, setChangeLayerInput] = useState("");
  const [changeLayerConfirm, setChangeLayerConfirm] = useState(false);
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
  const chatAutoScroll = useRef(true);
  const consoleAutoScroll = useRef(true);
  const consoleFilterRef = useRef<HTMLDivElement>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [consoleSearch, setConsoleSearch] = useState("");
  const [expandedPanel, setExpandedPanel] = useState<"chat" | "console" | null>(null);
  const [testWarnOpen, setTestWarnOpen] = useState(false);
  const [testWarnEosId, setTestWarnEosId] = useState("");

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
            return next.length > 5000 ? next.slice(-5000) : next;
          });
          break;
        case "setTickRate":
          setTickRate(action.tickRate);
          break;
        case "appendConsole":
          setConsoleLog((prev) => {
            const next = [...prev, { time: new Date().toISOString(), ...action.entry }];
            return next.length > 5000 ? next.slice(-5000) : next;
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
          // On reconnect, restore the previously active server
          const current = activeServerRef.current;
          if (current && msg.data.includes(current)) {
            // Re-subscribe to the server that was active before disconnect
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ action: "switch_server", server: current }));
            }
          } else {
            const stored = localStorage.getItem("rb-default-server");
            const initial = (stored && msg.data.includes(stored)) ? stored : msg.data[0];
            if (!current && msg.data.length > 0) {
              setActiveServer(initial);
            }
          }
          break;
        }
        case "snapshot":
          hasSnapshotRef.current = true;
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
        case "action_progress":
          setActionFeedback(`Moving ${msg.count} player${msg.count !== 1 ? "s" : ""}... ~${msg.estimatedSeconds}s`);
          break;
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
    const token = apiTokenRef.current;
    if (!token) return;
    // Clean up any existing connection without triggering reconnect
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    const ws = new WebSocket(`${WS_BASE}/live-server/ws`, [`auth-${token}`]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMessage]);

  // Connect WS once when canView becomes true (decoupled from token refresh)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // Application-level keepalive ping every 30s to prevent Cloudflare idle timeout
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "ping" }));
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [connected]);

  // Auto-scroll chat & console only when user is near bottom
  useEffect(() => {
    if (!chatAutoScroll.current) return;
    const el = chatEndRef.current?.parentElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chatLog]);
  useEffect(() => {
    if (!consoleAutoScroll.current) return;
    const el = consoleEndRef.current?.parentElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [consoleLog]);

  // Track scroll position to toggle auto-scroll
  useEffect(() => {
    const chatEl = chatEndRef.current?.parentElement;
    const consoleEl = consoleEndRef.current?.parentElement;
    function isNearBottom(el: HTMLElement, threshold = 50) {
      return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    }
    function onChatScroll() { if (chatEl) chatAutoScroll.current = isNearBottom(chatEl); }
    function onConsoleScroll() { if (consoleEl) consoleAutoScroll.current = isNearBottom(consoleEl); }
    chatEl?.addEventListener("scroll", onChatScroll);
    consoleEl?.addEventListener("scroll", onConsoleScroll);
    return () => {
      chatEl?.removeEventListener("scroll", onChatScroll);
      consoleEl?.removeEventListener("scroll", onConsoleScroll);
    };
  }, []);

  // Close console filter on outside click
  useEffect(() => {
    if (!consoleFilterOpen) return;
    function handleClick(e: MouseEvent) {
      if (consoleFilterRef.current && !consoleFilterRef.current.contains(e.target as Node)) {
        setConsoleFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [consoleFilterOpen]);

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

  const handleBan = useCallback(() => {
    if (!banTarget) return;
    sendAction({
      action: "ban",
      steamId: banTarget.steamID,
      eosId: banTarget.eosID,
      playerName: banTarget.name,
      banLength,
      reason: banReason.trim() || "Banned by admin",
    });
    setBanTarget(null);
    setBanReason("");
    setBanLength("1d");
  }, [banTarget, banLength, banReason]);

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

  function handleRestartMatch() {
    sendAction({ action: "restartmatch" });
    setRestartConfirm(false);
  }

  function handleSetNextLayer() {
    if (!nextLayerInput.trim()) return;
    sendAction({ action: "setnextlayer", message: nextLayerInput.trim() });
    setNextLayerInput("");
  }

  function handleChangeLayerNow() {
    if (!changeLayerInput.trim()) return;
    setChangeLayerConfirm(true);
  }

  function confirmChangeLayerNow() {
    sendAction({ action: "changelayer", message: changeLayerInput.trim() });
    setChangeLayerInput("");
    setChangeLayerConfirm(false);
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

  function handleTestWarn() {
    setTestWarnEosId("");
    setTestWarnOpen(true);
  }

  function confirmTestWarn() {
    if (!testWarnEosId.trim()) return;
    sendAction({ action: "testwarn", eosId: testWarnEosId.trim() });
    setTestWarnOpen(false);
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
      case "kill": return "text-danger";
      case "wound": return "text-warning/70";
      case "revive": return "text-success";
      case "squad": return "text-team-one";
      case "newgame": return "text-accent font-bold";
      case "admincam": return "text-accent";
      case "rconerror": return "text-danger font-bold";
      case "teamchange": return "text-team-one/70";
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
  const onBanPlayer = useCallback((p: Player) => { setBanTarget(p); setBanReason(""); setBanLength("1d"); }, []);
  const onSwitchSquadCallback = useCallback((name: string, squadPlayers: Player[]) => setSwitchSquadTarget({ squadName: name, players: squadPlayers }), []);
  const onSelectPlayer = useCallback((p: Player) => setSelectedPlayer(p), []);

  if (!canView) {
    return (
      <AccessDeniedCard
        message="You do not have access to the live server monitor."
        cta={hasPermission("manage:rcon-console") ? { href: "/live-server/console", label: "Open RCON Console" } : undefined}
      />
    );
  }

  // Show the snapshot skeleton only before the very first server snapshot
  // arrives (socket open, no data yet). Once any snapshot has been received
  // it never returns, even when serverInfo is transiently null (e.g. SquadJS
  // down or after a server switch).
  const showSnapshotSkeleton = connected && !serverInfo && !hasSnapshotRef.current;

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

  const filteredChat = chatLog
    .filter((m) => chatFilter === "All" || m.chat === chatFilter || m.chat === "__DIVIDER__")
    .filter((m) => !chatSearch || m.chat === "__DIVIDER__" || m.name?.toLowerCase().includes(chatSearch.toLowerCase()) || m.message?.toLowerCase().includes(chatSearch.toLowerCase()));

  const expandIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 8V4a1 1 0 011-1h4a1 1 0 010 2H5v3a1 1 0 01-2 0zm14 0V5h-3a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0zm0 4v3h-3a1 1 0 010 2h4a1 1 0 001-1v-4a1 1 0 00-2 0zM3 12v4a1 1 0 001 1h4a1 1 0 010-2H5v-3a1 1 0 00-2 0z" />
    </svg>
  );
  const minimizeIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M3.28 2.22a.75.75 0 00-1.06 1.06L5.94 7H4a.75.75 0 000 1.5h3.75A.75.75 0 008.5 7.75V4a.75.75 0 00-1.5 0v1.94L3.28 2.22zm13.44 0a.75.75 0 010 1.06L13.06 7H15a.75.75 0 010 1.5h-3.75a.75.75 0 01-.75-.75V4a.75.75 0 011.5 0v1.94l3.72-3.72a.75.75 0 011.06 0zm0 15.56a.75.75 0 001.06-1.06L14.06 13H16a.75.75 0 000-1.5h-3.75a.75.75 0 00-.75.75V16a.75.75 0 001.5 0v-1.94l3.72 3.72zM3.28 17.78a.75.75 0 01-1.06-1.06L5.94 13H4a.75.75 0 010-1.5h3.75a.75.75 0 01.75.75V16a.75.75 0 01-1.5 0v-1.94l-3.72 3.72z" />
    </svg>
  );

  function renderChatContent(isExpanded: boolean) {
    return (
      <>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
            Chat
          </h2>
          <div className="flex items-center gap-1">
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
            <button
              onClick={() => setExpandedPanel(isExpanded ? null : "chat")}
              className="ml-1 rounded-sm p-1 text-text-muted transition-colors hover:text-text-secondary"
              title={isExpanded ? "Minimize chat" : "Expand chat"}
            >
              {isExpanded ? minimizeIcon : expandIcon}
            </button>
          </div>
        </div>
        <div className="border-b border-border px-4 py-1.5">
          <input
            type="text"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Search chat..."
            className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
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
                ? "text-team-one"
                : String(player?.teamID) === "2"
                  ? "text-team-two"
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
      </>
    );
  }

  function renderConsoleContent(isExpanded: boolean) {
    return (
      <>
        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
              Console
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative" ref={consoleFilterRef}>
                <button
                  onClick={() => setConsoleFilterOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:border-accent/30 hover:text-text-secondary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" /></svg>
                  Filters
                  {consoleFilters.size < CONSOLE_TYPES.length && (
                    <span className="rounded-sm bg-accent/15 px-1 text-xs font-bold text-accent">
                      {consoleFilters.size}/{CONSOLE_TYPES.length}
                    </span>
                  )}
                </button>
                {consoleFilterOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-sm border border-border bg-bg-secondary p-3 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-text-primary">Console Filters</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setConsoleFilters(new Set(CONSOLE_TYPES)); localStorage.setItem("rb-console-filters", JSON.stringify(CONSOLE_TYPES)); }}
                          className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
                        >
                          All
                        </button>
                        <button
                          onClick={() => { setConsoleFilters(new Set()); localStorage.setItem("rb-console-filters", "[]"); }}
                          className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CONSOLE_TYPES.map((t) => (
                        <button
                          key={t}
                          onClick={() => toggleConsoleFilter(t)}
                          className={`rounded-sm border px-1.5 py-0.5 text-xs font-medium tracking-wide transition-colors ${
                            consoleFilters.has(t)
                              ? "border-accent/30 bg-accent/10 text-accent"
                              : "border-border text-text-muted/50 line-through"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setConsoleLog([])}
                className="rounded-sm border border-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:border-accent/30 hover:text-text-secondary"
              >
                Clear
              </button>
              <button
                onClick={() => setExpandedPanel(isExpanded ? null : "console")}
                className="rounded-sm border border-border p-1 text-text-muted transition-colors hover:border-accent/30 hover:text-text-secondary"
                title={isExpanded ? "Minimize console" : "Expand console"}
              >
                {isExpanded ? minimizeIcon : expandIcon}
              </button>
            </div>
          </div>
        </div>
        <div className="border-b border-border px-4 py-1.5">
          <input
            type="text"
            value={consoleSearch}
            onChange={(e) => setConsoleSearch(e.target.value)}
            placeholder="Search console..."
            className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex-1 overflow-auto px-4 py-2 font-mono">
          {consoleLog.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              No events yet
            </div>
          ) : (
            consoleLog
              .filter((e) => consoleFilters.has(e.type))
              .filter((e) => !consoleSearch || e.message.toLowerCase().includes(consoleSearch.toLowerCase()))
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
      </>
    );
  }

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
      <LiveServerTabs active="monitor" canConsole={hasPermission("manage:rcon-console")} />
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
          <ConnectionStatus
            tone={connected && squadjsConnected ? "success" : connected ? "warning" : "danger"}
            active={activity}
            label={
              connected && squadjsConnected
                ? "Connected"
                : connected && !squadjsConfigured
                  ? "SquadJS not configured (SQUADJS_SERVERS env var missing)"
                  : connected
                    ? "API connected, SquadJS disconnected"
                    : "Disconnected"
            }
          />
        </div>
      </div>

      {/* Server tabs */}
      <ServerScope
        servers={serverKeys}
        active={activeServer}
        onSwitch={switchServer}
        variant="tabs"
        className="mb-6"
      />

      {/* Action feedback */}
      {actionFeedback && (
        <div
          className={`mb-4 rounded-sm border px-4 py-2.5 text-sm ${
            actionFeedback.startsWith("Error")
              ? "border-danger/20 bg-danger/5 text-danger"
              : actionFeedback.startsWith("Moving")
                ? "border-accent/20 bg-accent/5 text-accent"
                : "border-success/20 bg-success/5 text-success"
          }`}
        >
          {actionFeedback}
        </div>
      )}

      {/* Server info bar skeleton (pre-first-frame only) */}
      {showSnapshotSkeleton && (
        <SkeletonStatGrid
          count={6}
          className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        />
      )}

      {/* Server info bar */}
      {serverInfo && (
        <div className="facet-border mb-4 grid grid-cols-2 gap-3 rounded-sm bg-bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
          <InfoCell label="Players" value={`${serverInfo.playerCount} / ${serverInfo.maxPlayers}`}>
            <AreaSparkline values={metricHistory.map((s) => s.playerCount)} className="text-accent" fixedMax={serverInfo.maxPlayers || 100} />
          </InfoCell>
          <InfoCell label="Queue" value={`${serverInfo.publicQueue + serverInfo.reserveQueue}`}>
            <AreaSparkline values={metricHistory.map((s) => s.publicQueue + s.reserveQueue)} className="text-warning" fixedMax={25} />
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
            <AreaSparkline values={metricHistory.map((s) => s.tickRate ?? 0)} className="text-success" />
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

          {/* Restart Match */}
          <button
            onClick={() => setRestartConfirm(true)}
            className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
          >
            Restart Match
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

          {/* Change Layer Now */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={changeLayerInput}
              onChange={(e) => setChangeLayerInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleChangeLayerNow(); }}
              placeholder="Change layer NOW..."
              className="w-48 rounded-sm border border-border/50 bg-bg-tertiary px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleChangeLayerNow}
              disabled={!changeLayerInput.trim()}
              className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/15 disabled:opacity-40"
            >
              Change Now
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
                        <span className={`font-medium ${team === "1" ? "text-team-one" : "text-team-two"}`}>T{team}</span>
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
                  className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                >
                  Randomize
                </button>
              )}
            </>
          )}
          {isDeveloper && (
            <button
              onClick={handleTestWarn}
              className="rounded-sm border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/15"
            >
              Test Warn
            </button>
          )}
        </div>
      )}
      </div>{/* end shrink-0 */}

      {/* End Match confirmation */}
      <AlertDialog open={endMatchConfirm} onOpenChange={setEndMatchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide">End Match</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end the current match? This will immediately end the
              game for all players.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleEndMatch}>
              End Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restart Match confirmation */}
      <AlertDialog open={restartConfirm} onOpenChange={setRestartConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide">Restart Match</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restart the current match? This will reload the current
              layer and restart the round for all players.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRestartMatch}>
              Restart Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Layer Now confirmation */}
      <AlertDialog open={changeLayerConfirm} onOpenChange={setChangeLayerConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wide">Change Layer Now</AlertDialogTitle>
            <AlertDialogDescription>
              Change the CURRENT layer to{" "}
              <span className="font-mono text-text-primary">{changeLayerInput.trim()}</span> now?
              This restarts the round.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmChangeLayerNow}>
              Change Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clan move modal */}
      <Dialog open={clanMoveModalOpen} onOpenChange={(o) => { if (!o) { setClanMoveModalOpen(false); setClanMoveSelectedKey(null); } }}>
        <DialogContent className="max-w-md sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Move Clan</DialogTitle>
          </DialogHeader>
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
                      ? t === "1" ? "border-team-one/40 bg-team-one/10 text-team-one" : "border-team-two/40 bg-team-two/10 text-team-two"
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
                          <span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-team-one" : "text-team-two"}`}>T{m.teamID}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {alreadyOn.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-success uppercase">Already on Team {clanMoveTargetTeam} ({alreadyOn.length})</p>
                    <div className="space-y-0.5">
                      {alreadyOn.map((m) => (
                        <div key={m.steamId} className="flex items-center justify-between rounded-sm border border-success/20 bg-success/5 px-2.5 py-1">
                          <span className="text-xs text-text-primary">{m.name}</span>
                          <span className={`text-[10px] font-medium ${String(m.teamID) === "1" ? "text-team-one" : "text-team-two"}`}>T{m.teamID}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {clanMoveSelectedKey && (() => {
            const moveCount = onlineClans[clanMoveSelectedKey]?.members.filter((m) => String(m.teamID) !== clanMoveTargetTeam).length || 0;
            if (moveCount <= 1) return null;
            const est = Math.ceil((moveCount - 1) * 0.5 + 1);
            return <p className="mt-2 text-xs text-text-muted">Estimated time: ~{est}s ({moveCount} players at 500ms intervals)</p>;
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
        </DialogContent>
      </Dialog>

      {/* Randomize modal */}
      <Dialog open={randomizeModalOpen} onOpenChange={(o) => { if (!o) setRandomizeModalOpen(false); }}>
        <DialogContent className="max-w-md sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Randomize Teams</DialogTitle>
          </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-text-muted uppercase">Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRandomizeMode("all")}
                className={`flex-1 rounded-sm border px-4 py-2 text-sm font-medium transition-colors ${
                  randomizeMode === "all"
                    ? "border-accent/40 bg-accent/10 text-accent"
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
                    ? "border-accent/40 bg-accent/10 text-accent"
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
            className="rounded-sm border border-accent/30 bg-accent/5 px-5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
            title="Will queue and execute after next game starts"
          >
            Queue
          </button>
          <button
            onClick={() => { handleRunRandomize(randomizeMode); setRandomizeModalOpen(false); }}
            className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"
            title="Will execute immediately"
          >
            Run
          </button>
        </div>
        </DialogContent>
      </Dialog>

      {/* Main grid: Players + Chat */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] flex-1 min-h-0">
        {/* Player list - 2 cols */}
        <div className="flex flex-col min-h-0">
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
          {expandedPanel === "chat" ? (
            <button
              onClick={() => setExpandedPanel(null)}
              className="facet-border flex min-h-[60px] items-center justify-center rounded-sm bg-bg-card text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              Chat expanded — click to minimize
            </button>
          ) : (
            <div className="facet-border flex min-h-[200px] lg:min-h-0 flex-1 flex-col rounded-sm bg-bg-card">
              {renderChatContent(false)}
            </div>
          )}

          {/* Console */}
          {expandedPanel === "console" ? (
            <button
              onClick={() => setExpandedPanel(null)}
              className="facet-border flex min-h-[60px] items-center justify-center rounded-sm bg-bg-card text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              Console expanded — click to minimize
            </button>
          ) : (
            <div className="facet-border flex min-h-[200px] lg:min-h-0 flex-1 flex-col rounded-sm bg-bg-card">
              {renderConsoleContent(false)}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Chat/Console modal */}
      <Dialog open={expandedPanel !== null} onOpenChange={(o) => { if (!o) setExpandedPanel(null); }}>
        <DialogContent showCloseButton={false} className="flex h-[85vh] w-[90vw] max-w-6xl sm:max-w-6xl flex-col p-0">
          <DialogTitle className="sr-only">{expandedPanel === "chat" ? "Chat" : "Console"}</DialogTitle>
          {expandedPanel === "chat" && (
            <div className="facet-border flex flex-1 flex-col rounded-sm bg-bg-card min-h-0">
              {renderChatContent(true)}
            </div>
          )}
          {expandedPanel === "console" && (
            <div className="facet-border flex flex-1 flex-col rounded-sm bg-bg-card min-h-0">
              {renderConsoleContent(true)}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Warn modal */}
      <Dialog open={!!warnTarget} onOpenChange={(o) => { if (!o) setWarnTarget(null); }}>
        <DialogContent className="max-w-md sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Warn {warnTarget?.name}</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

      {/* Kick modal */}
      <Dialog open={!!kickTarget} onOpenChange={(o) => { if (!o) setKickTarget(null); }}>
        <DialogContent className="max-w-md sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Kick {kickTarget?.name}</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

      {/* Ban modal */}
      <Dialog open={!!banTarget} onOpenChange={(o) => { if (!o) setBanTarget(null); }}>
        <DialogContent className="max-w-md sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Ban {banTarget?.name}</DialogTitle>
          </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-text-muted uppercase">Duration</label>
            <select
              value={banLength}
              onChange={(e) => setBanLength(e.target.value)}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="0">Permanent</option>
              <option value="1h">1 hour</option>
              <option value="1d">1 day</option>
              <option value="3d">3 days</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-text-muted uppercase">Reason</label>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason shown to player"
              className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              autoFocus
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => setBanTarget(null)}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleBan}
            className="rounded-sm bg-danger px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-danger/80 disabled:opacity-40"
          >
            Ban Player
          </button>
        </div>
        </DialogContent>
      </Dialog>

      {/* Switch squad modal */}
      <Dialog open={!!switchSquadTarget} onOpenChange={(o) => { if (!o) setSwitchSquadTarget(null); }}>
        <DialogContent className="max-w-md sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Switch Squad: {switchSquadTarget?.squadName}</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

      {/* Test Warn (developer) */}
      <Dialog open={testWarnOpen} onOpenChange={(o) => { if (!o) setTestWarnOpen(false); }}>
        <DialogContent className="max-w-md sm:max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold tracking-wide">Test Warn</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={testWarnEosId}
            onChange={(e) => setTestWarnEosId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmTestWarn(); }}
            placeholder="EOS ID to warn"
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => setTestWarnOpen(false)}
              className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={confirmTestWarn}
              disabled={!testWarnEosId.trim()}
              className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-40"
            >
              Send Test Warn
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Player card */}
      {selectedPlayer && (
        <PlayerCard
          player={selectedPlayer}
          showActions={canManage}
          apiToken={apiToken}
          onClose={() => setSelectedPlayer(null)}
          onWarn={onWarnPlayer}
          onKick={onKickPlayer}
          onBan={onBanPlayer}
          onSwitchTeam={handleSwitchTeam}
          formatPlaytime={formatPlaytime}
        />
      )}
    </div>
  );
}

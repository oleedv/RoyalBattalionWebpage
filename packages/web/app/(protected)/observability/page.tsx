"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { getGracePeriodHistory, getSwapQueueHistory } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table";
import { SearchInput } from "@/components/search-input";
import { formatDateTime } from "@/lib/format";
import type { GracePeriodEventRow, SwapQueueActionRow } from "shared";

// --- Types for real-time events ---

interface GracePeriodEvent {
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

interface SwapQueueEvent {
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

interface WSSnapshot {
  connected: boolean;
  gracePeriodEvents: GracePeriodEvent[];
  swapQueueEvents: SwapQueueEvent[];
  gracePeriodActive: boolean;
  gracePeriodEndTime: number | null;
}

type WSMessage =
  | { type: "servers"; data: string[] }
  | { type: "snapshot"; data: WSSnapshot; configured?: boolean }
  | { type: "event"; event: string; data: unknown; server: string }
  | { type: "action_result"; success: boolean; action: string; error?: string };

const WS_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
).replace(/^http/, "ws");

const PAGE_SIZE = 50;

// --- Action badge colors ---

const GP_ACTION_COLORS: Record<string, string> = {
  started: "bg-blue-500/15 text-blue-400",
  ended: "bg-slate-500/15 text-slate-400",
  allowed: "bg-emerald-500/15 text-emerald-400",
  disbanded: "bg-red-500/15 text-red-400",
  warned: "bg-amber-500/15 text-amber-400",
  kicked: "bg-rose-500/15 text-rose-400",
};

const SQ_ACTION_COLORS: Record<string, string> = {
  queued: "bg-blue-500/15 text-blue-400",
  swapped: "bg-emerald-500/15 text-emerald-400",
  "cross-swapped": "bg-cyan-500/15 text-cyan-400",
  denied: "bg-red-500/15 text-red-400",
  removed: "bg-amber-500/15 text-amber-400",
  processing_complete: "bg-slate-500/15 text-slate-400",
};

function ActionBadge({
  action,
  colorMap,
}: {
  action: string;
  colorMap: Record<string, string>;
}) {
  const cls = colorMap[action] || "bg-gray-500/15 text-gray-400";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${cls}`}
    >
      {action.replace(/_/g, " ")}
    </span>
  );
}

// --- Grace period event description ---

function gpEventDescription(e: GracePeriodEvent): string {
  switch (e.action) {
    case "started":
      return `Grace period started (${e.gracePeriodSeconds || "?"}s)`;
    case "ended":
      return "Grace period ended";
    case "allowed":
      return `${e.playerName || "Unknown"} allowed: "${e.squadName || "?"}" on Team ${e.teamID || "?"}${e.reason ? ` (${e.reason})` : ""}`;
    case "disbanded":
      return `${e.playerName || "Unknown"}: squad "${e.squadName || "?"}" disbanded on Team ${e.teamID || "?"}${e.attemptNumber ? ` (attempt #${e.attemptNumber})` : ""}`;
    case "warned":
      return `${e.playerName || "Unknown"} warned${e.attemptNumber ? ` (attempt #${e.attemptNumber})` : ""}${e.reason ? `: ${e.reason}` : ""}`;
    case "kicked":
      return `${e.playerName || "Unknown"} kicked${e.reason ? `: ${e.reason}` : ""}`;
    default:
      return `${e.playerName || ""} ${e.action}`;
  }
}

// --- Swap queue event description ---

function sqEventDescription(e: SwapQueueEvent): string {
  switch (e.action) {
    case "queued":
      return `${e.player?.name || "Unknown"} queued (pos ${e.position ?? "?"}, priority ${e.priority ?? "?"}, queue size ${e.queueSize ?? "?"})`;
    case "swapped":
      return `${e.player?.name || "Unknown"} swapped Team ${e.fromTeam} -> ${e.toTeam}${e.waitSeconds != null ? ` (waited ${e.waitSeconds}s)` : ""}`;
    case "cross-swapped":
      return `Cross-swap: ${e.playerA?.name || "?"} <-> ${e.playerB?.name || "?"}`;
    case "denied":
      return `${e.player?.name || "Unknown"} denied${e.reason ? `: ${e.reason}` : ""}`;
    case "removed":
      return `${e.player?.name || "Unknown"} removed${e.reason ? `: ${e.reason}` : ""}`;
    case "processing_complete":
      return `Queue processed: ${e.swappedCount ?? 0} swapped, ${e.remaining ?? 0} remaining${e.durationMs != null ? ` (${e.durationMs}ms)` : ""}`;
    default:
      return `${e.player?.name || ""} ${e.action}`;
  }
}

// --- Countdown hook ---

function useCountdown(endTime: number | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endTime) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [endTime]);
  return remaining;
}

// --- Format timestamp for feed ---

function feedTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

// --- Main page ---

export default function ObservabilityPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canView =
    hasPermission("view:live-server") || hasPermission("manage:live-server");

  // --- WebSocket state ---
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [squadjsConnected, setSquadjsConnected] = useState(false);

  // Real-time feeds
  const [gpEvents, setGpEvents] = useState<GracePeriodEvent[]>([]);
  const [sqEvents, setSqEvents] = useState<SwapQueueEvent[]>([]);
  const [gpActive, setGpActive] = useState(false);
  const [gpEndTime, setGpEndTime] = useState<number | null>(null);

  // Historical tab
  const [historyTab, setHistoryTab] = useState<"grace" | "swap">("grace");
  const [gpHistory, setGpHistory] = useState<GracePeriodEventRow[]>([]);
  const [sqHistory, setSqHistory] = useState<SwapQueueActionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Filters
  const [playerSearch, setPlayerSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const gpCountdown = useCountdown(gpActive ? gpEndTime : null);

  // Auto-scroll refs
  const gpFeedRef = useRef<HTMLDivElement>(null);
  const sqFeedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new events
  useEffect(() => {
    gpFeedRef.current?.scrollTo({ top: gpFeedRef.current.scrollHeight, behavior: "smooth" });
  }, [gpEvents.length]);

  useEffect(() => {
    sqFeedRef.current?.scrollTo({ top: sqFeedRef.current.scrollHeight, behavior: "smooth" });
  }, [sqEvents.length]);

  // --- WebSocket ---

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg: WSMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "snapshot": {
          setSquadjsConnected(msg.data.connected);
          if (msg.data.gracePeriodEvents?.length) setGpEvents(msg.data.gracePeriodEvents);
          if (msg.data.swapQueueEvents?.length) setSqEvents(msg.data.swapQueueEvents);
          setGpActive(msg.data.gracePeriodActive);
          setGpEndTime(msg.data.gracePeriodEndTime);
          break;
        }
        case "event": {
          switch (msg.event) {
            case "GRACE_PERIOD_STARTED": {
              const e = msg.data as GracePeriodEvent;
              setGpActive(true);
              setGpEndTime(Date.now() + (e.gracePeriodSeconds || 10) * 1000);
              setGpEvents((prev) => {
                const next = [...prev, e];
                return next.length > 200 ? next.slice(-200) : next;
              });
              break;
            }
            case "GRACE_PERIOD_ENDED": {
              const e = msg.data as GracePeriodEvent;
              setGpActive(false);
              setGpEndTime(null);
              setGpEvents((prev) => {
                const next = [...prev, e];
                return next.length > 200 ? next.slice(-200) : next;
              });
              break;
            }
            case "GRACE_PERIOD_EVENT": {
              const e = msg.data as GracePeriodEvent;
              setGpEvents((prev) => {
                const next = [...prev, e];
                return next.length > 200 ? next.slice(-200) : next;
              });
              break;
            }
            case "SWAP_QUEUE_EVENT": {
              const e = msg.data as SwapQueueEvent;
              setSqEvents((prev) => {
                const next = [...prev, e];
                return next.length > 200 ? next.slice(-200) : next;
              });
              break;
            }
            case "CONNECTION_STATUS": {
              const d = msg.data as { connected: boolean };
              setSquadjsConnected(d.connected);
              break;
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("[observability] Failed to process WebSocket message:", err);
    }
  }, []);

  const connectWs = useCallback(() => {
    if (!apiToken) return;
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
      if (wsRef.current === ws) {
        reconnectRef.current = setTimeout(connectWs, 3000);
      }
    };
    ws.onerror = () => ws.close();
    ws.onmessage = handleMessage;
  }, [apiToken, handleMessage]);

  useEffect(() => {
    if (!apiToken || !canView) return;
    connectWs();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [apiToken, canView, connectWs]);

  // --- Historical data ---

  const fetchHistory = useCallback(async () => {
    if (!apiToken) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = {
        from: fromDate || undefined,
        to: toDate ? toDate + "T23:59:59.999Z" : undefined,
        limit: PAGE_SIZE,
        player: playerSearch || undefined,
      };
      if (historyTab === "grace") {
        const res = await getGracePeriodHistory(apiToken, params);
        if (res.success && res.data) {
          setGpHistory(res.data.data);
        } else {
          setHistoryError(res.error || "Failed to load grace period history");
        }
      } else {
        const res = await getSwapQueueHistory(apiToken, params);
        if (res.success && res.data) {
          setSqHistory(res.data.data);
        } else {
          setHistoryError(res.error || "Failed to load swap queue history");
        }
      }
    } catch {
      setHistoryError("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [apiToken, historyTab, fromDate, toDate, playerSearch]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const silentRefresh = useCallback(async () => {
    if (!apiToken) return;
    try {
      const params = {
        from: fromDate || undefined,
        to: toDate ? toDate + "T23:59:59.999Z" : undefined,
        limit: PAGE_SIZE,
        player: playerSearch || undefined,
      };
      if (historyTab === "grace") {
        const res = await getGracePeriodHistory(apiToken, params);
        if (res.success && res.data) setGpHistory(res.data.data);
      } else {
        const res = await getSwapQueueHistory(apiToken, params);
        if (res.success && res.data) setSqHistory(res.data.data);
      }
    } catch { /* silent */ }
  }, [apiToken, historyTab, fromDate, toDate, playerSearch]);

  useAutoRefresh(silentRefresh, 30_000, !!apiToken);

  // --- Historical table columns ---

  const gpColumns = useMemo(
    (): Column<GracePeriodEventRow>[] => [
      {
        key: "time",
        header: "Time",
        render: (row) => (
          <span className="whitespace-nowrap text-text-secondary">
            {formatDateTime(row.timestamp)}
          </span>
        ),
      },
      {
        key: "action",
        header: "Action",
        render: (row) => (
          <ActionBadge action={row.action} colorMap={GP_ACTION_COLORS} />
        ),
      },
      {
        key: "player",
        header: "Player",
        render: (row) => (
          <span className="font-medium text-text-primary">
            {row.player_name || "--"}
          </span>
        ),
      },
      {
        key: "squad",
        header: "Squad",
        render: (row) =>
          row.squad_name ? (
            <span className="text-text-secondary">
              {row.squad_name}
              {row.squad_id != null && (
                <span className="ml-1 text-text-muted">(#{row.squad_id})</span>
              )}
            </span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        key: "team",
        header: "Team",
        render: (row) =>
          row.team_id != null ? (
            <span className="text-text-secondary">Team {row.team_id}</span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        key: "details",
        header: "Details",
        render: (row) => {
          const parts: string[] = [];
          if (row.attempt_number) parts.push(`Attempt #${row.attempt_number}`);
          if (row.reason) parts.push(row.reason);
          if (row.grace_remaining_seconds != null)
            parts.push(`${row.grace_remaining_seconds}s remaining`);
          return parts.length > 0 ? (
            <span className="text-xs text-text-muted">{parts.join(" | ")}</span>
          ) : (
            <span className="text-text-muted">--</span>
          );
        },
      },
    ],
    []
  );

  const sqColumns = useMemo(
    (): Column<SwapQueueActionRow>[] => [
      {
        key: "time",
        header: "Time",
        render: (row) => (
          <span className="whitespace-nowrap text-text-secondary">
            {formatDateTime(row.timestamp)}
          </span>
        ),
      },
      {
        key: "action",
        header: "Action",
        render: (row) => (
          <ActionBadge action={row.action} colorMap={SQ_ACTION_COLORS} />
        ),
      },
      {
        key: "player",
        header: "Player",
        render: (row) => (
          <span className="font-medium text-text-primary">
            {row.player_name || "--"}
          </span>
        ),
      },
      {
        key: "teams",
        header: "Teams",
        render: (row) =>
          row.from_team != null && row.to_team != null ? (
            <span className="text-text-secondary">
              {row.from_team} &rarr; {row.to_team}
            </span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        key: "details",
        header: "Details",
        render: (row) => {
          const parts: string[] = [];
          if (row.priority != null) parts.push(`Priority ${row.priority}`);
          if (row.queue_position != null) parts.push(`Pos #${row.queue_position}`);
          if (row.wait_time_seconds != null) parts.push(`Wait ${row.wait_time_seconds}s`);
          if (row.reason) parts.push(row.reason);
          return parts.length > 0 ? (
            <span className="text-xs text-text-muted">{parts.join(" | ")}</span>
          ) : (
            <span className="text-text-muted">--</span>
          );
        },
      },
    ],
    []
  );

  // --- Permission gate ---

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  const hasFilters = playerSearch || fromDate || toDate;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-text-primary">
            Observability
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Grace period enforcement and swap queue activity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot
            label="WebSocket"
            active={connected}
          />
          <StatusDot
            label="SquadJS"
            active={squadjsConnected}
          />
        </div>
      </div>

      {/* Real-time feeds */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Grace Period Feed */}
        <div className="rounded-sm border border-border bg-bg-secondary">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-primary">
              Grace Period
            </h2>
            {gpActive ? (
              <span className="flex items-center gap-2 rounded bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                Active &mdash; {gpCountdown}s
              </span>
            ) : (
              <span className="rounded bg-slate-500/10 px-2.5 py-1 text-xs text-text-muted">
                Inactive
              </span>
            )}
          </div>
          <div
            ref={gpFeedRef}
            className="h-72 overflow-y-auto p-3"
          >
            {gpEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">
                No grace period events yet
              </p>
            ) : (
              <div className="space-y-1">
                {gpEvents.map((e, i) => (
                  <FeedRow
                    key={`gp-${i}`}
                    time={feedTime(e.timestamp)}
                    badge={
                      <ActionBadge
                        action={e.action}
                        colorMap={GP_ACTION_COLORS}
                      />
                    }
                    text={gpEventDescription(e)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Swap Queue Feed */}
        <div className="rounded-sm border border-border bg-bg-secondary">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-primary">
              Swap Queue
            </h2>
            <span className="rounded bg-slate-500/10 px-2.5 py-1 text-xs text-text-muted">
              {sqEvents.length} events
            </span>
          </div>
          <div
            ref={sqFeedRef}
            className="h-72 overflow-y-auto p-3"
          >
            {sqEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">
                No swap queue events yet
              </p>
            ) : (
              <div className="space-y-1">
                {sqEvents.map((e, i) => (
                  <FeedRow
                    key={`sq-${i}`}
                    time={feedTime(e.timestamp)}
                    badge={
                      <ActionBadge
                        action={e.action}
                        colorMap={SQ_ACTION_COLORS}
                      />
                    }
                    text={sqEventDescription(e)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historical section */}
      <div>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {/* Tab selector */}
          <div className="flex rounded-sm border border-border">
            <button
              onClick={() => { setHistoryTab("grace"); setPage(1); }}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                historyTab === "grace"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Grace Period
            </button>
            <button
              onClick={() => { setHistoryTab("swap"); setPage(1); }}
              className={`border-l border-border px-4 py-1.5 text-xs font-medium transition-colors ${
                historyTab === "swap"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Swap Queue
            </button>
          </div>

          {/* Filters */}
          <div>
            <label className="mb-1 block text-xs text-text-muted">Player</label>
            <SearchInput
              value={playerSearch}
              onChange={(v) => { setPlayerSearch(v); setPage(1); }}
              placeholder="Search by name..."
              className="w-44"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => {
                setPlayerSearch("");
                setFromDate("");
                setToDate("");
                setPage(1);
              }}
              className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            >
              Clear filters
            </button>
          )}
        </div>

        {historyError && (
          <div className="mb-4 rounded-sm border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {historyError}
          </div>
        )}

        <div className="rounded-sm border border-border">
          {historyTab === "grace" ? (
            <DataTable<GracePeriodEventRow>
              columns={gpColumns}
              data={historyLoading ? [] : gpHistory}
              keyExtractor={(row) => String(row.id)}
              emptyMessage={historyLoading ? "Loading..." : "No grace period events found"}
            />
          ) : (
            <DataTable<SwapQueueActionRow>
              columns={sqColumns}
              data={historyLoading ? [] : sqHistory}
              keyExtractor={(row) => String(row.id)}
              emptyMessage={historyLoading ? "Loading..." : "No swap queue actions found"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Small components ---

function StatusDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          active ? "bg-emerald-400" : "bg-red-400"
        }`}
      />
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

function FeedRow({
  time,
  badge,
  text,
}: {
  time: string;
  badge: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-bg-primary/50">
      <span className="shrink-0 font-mono text-text-muted">{time}</span>
      <span className="shrink-0">{badge}</span>
      <span className="text-text-secondary">{text}</span>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import {
  getLobbyStats,
  getLobbyHealth,
  reconnectLobbyServiceSteam,
} from "@/lib/api-client";
import type { LobbyStats, LobbyHealth } from "@/lib/api-client";

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        active ? "bg-emerald-400" : "bg-red-400"
      }`}
    />
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-bg-secondary p-4">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
        {label}
      </div>
      <div className="font-display text-2xl font-bold tracking-wide text-text-primary">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function anonymizeIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.***.**`;
  }
  return ip;
}

export default function LobbyMonitorPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canView = hasPermission("developer");

  const [stats, setStats] = useState<LobbyStats | null>(null);
  const [health, setHealth] = useState<LobbyHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">(
    "all"
  );

  const fetchData = useCallback(async () => {
    if (!apiToken) return;
    try {
      const [statsRes, healthRes] = await Promise.all([
        getLobbyStats(apiToken),
        getLobbyHealth(apiToken),
      ]);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (healthRes.success && healthRes.data) setHealth(healthRes.data);
      setError(null);
    } catch {
      setError("Failed to fetch lobby service data");
    } finally {
      setLoading(false);
    }
  }, [apiToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const silentRefresh = useCallback(async () => {
    if (!apiToken) return;
    try {
      const [statsRes, healthRes] = await Promise.all([
        getLobbyStats(apiToken),
        getLobbyHealth(apiToken),
      ]);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (healthRes.success && healthRes.data) setHealth(healthRes.data);
    } catch {
      /* silent */
    }
  }, [apiToken]);

  useAutoRefresh(silentRefresh, 10_000, !!apiToken);

  const handleReconnect = async () => {
    if (!apiToken || reconnecting) return;
    setReconnecting(true);
    try {
      await reconnectLobbyServiceSteam(apiToken);
      // Refresh after a short delay to pick up new status
      setTimeout(fetchData, 2000);
    } catch {
      /* handled by UI */
    } finally {
      setReconnecting(false);
    }
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">Loading lobby service data...</p>
      </div>
    );
  }

  const filteredCalls =
    stats?.recentCalls.filter((call) => {
      if (statusFilter === "success") return call.status < 400;
      if (statusFilter === "error") return call.status >= 400;
      return true;
    }) ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-text-primary">
            Lobby API
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Steam lobby service monitoring and diagnostics
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Service Status */}
      {health && (
        <div className="mb-6 rounded-sm border border-border bg-bg-secondary">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-primary">
              Service Status
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="flex items-center gap-2">
              <StatusDot active={health.steam.connected} />
              <div>
                <div className="text-xs text-text-muted">Steam</div>
                <div className="text-sm font-medium text-text-primary">
                  {health.steam.connected ? "Connected" : "Disconnected"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusDot active={health.eos.tokenValid} />
              <div>
                <div className="text-xs text-text-muted">EOS Token</div>
                <div className="text-sm font-medium text-text-primary">
                  {health.eos.tokenValid
                    ? `Valid (${formatUptime(health.eos.tokenTTLSeconds)})`
                    : "Expired"}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Uptime</div>
              <div className="text-sm font-medium text-text-primary">
                {formatUptime(health.service.uptime)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Build ID</div>
              <div className="text-sm font-medium text-text-primary">
                {health.service.buildId}
              </div>
            </div>
            <div>
              <button
                onClick={handleReconnect}
                disabled={reconnecting}
                className="rounded-sm border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-accent transition-colors hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reconnecting ? "Reconnecting..." : "Reconnect Steam"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Usage Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Today"
            value={stats.stats.callsToday}
            sub="requests"
          />
          <StatCard
            label="This Hour"
            value={stats.stats.callsThisHour}
            sub="requests"
          />
          <StatCard
            label="Rate Limit Hits"
            value={stats.stats.rateLimitHits}
          />
          <StatCard
            label="Error Rate"
            value={`${stats.stats.errorRate}%`}
            sub={`avg ${stats.stats.avgLatencyMs}ms latency`}
          />
        </div>
      )}

      {/* Server Discovery Cache */}
      {health && (
        <div className="mb-6 rounded-sm border border-border bg-bg-secondary">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-primary">
                Server Discovery Cache
              </h2>
              <span className="text-xs text-text-muted">
                Last refresh:{" "}
                {health.discovery.lastRefresh
                  ? new Date(health.discovery.lastRefresh).toLocaleTimeString("en-GB")
                  : "never"}
              </span>
            </div>
          </div>
          <div className="p-4">
            <span className="text-sm text-text-secondary">
              {health.discovery.serverCount} server(s) cached
            </span>
          </div>
        </div>
      )}

      {/* Recent API Calls */}
      <div className="rounded-sm border border-border bg-bg-secondary">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-primary">
            Recent API Calls
          </h2>
          <div className="flex rounded-sm border border-border">
            {(["all", "success", "error"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  statusFilter === filter
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-primary"
                } ${filter !== "all" ? "border-l border-border" : ""}`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Time
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Endpoint
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Caller
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Server
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Status
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                  Latency
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No API calls recorded
                  </td>
                </tr>
              ) : (
                filteredCalls.slice(0, 100).map((call, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-text-secondary">
                      {formatTimestamp(call.timestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-text-primary">{call.endpoint}</div>
                      {call.error && (
                        <div className="mt-0.5 text-xs text-red-400">{call.error}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-text-secondary">
                      {anonymizeIp(call.callerIp)}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {call.serverRequested || "--"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          call.status < 400
                            ? "bg-emerald-500/15 text-emerald-400"
                            : call.status === 429
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-text-muted">
                      {call.latencyMs}ms
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuditLogs } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { AuditLogEntry } from "shared";

const RESOURCE_OPTIONS = [
  "whitelist",
  "role",
  "user",
  "admin_group",
  "clan",
  "server_config",
  "match",
  "squadjs",
  "discord_bot",
  "prospect",
  "live_server",
];

const ACTION_PREFIXES = [
  "whitelist",
  "role",
  "member",
  "admin_group",
  "clan",
  "server_config",
  "match",
  "squadjs",
  "discord_bot",
  "rcon",
];

const PAGE_SIZE = 50;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActionBadge({ action }: { action: string }) {
  const prefix = action.split(".")[0];
  const colorMap: Record<string, string> = {
    whitelist: "bg-blue-500/15 text-blue-400",
    role: "bg-purple-500/15 text-purple-400",
    member: "bg-green-500/15 text-green-400",
    admin_group: "bg-yellow-500/15 text-yellow-400",
    clan: "bg-orange-500/15 text-orange-400",
    server_config: "bg-red-500/15 text-red-400",
    match: "bg-cyan-500/15 text-cyan-400",
    squadjs: "bg-pink-500/15 text-pink-400",
    discord_bot: "bg-indigo-500/15 text-indigo-400",
    rcon: "bg-rose-500/15 text-rose-400",
  };
  const cls = colorMap[prefix] || "bg-gray-500/15 text-gray-400";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {formatAction(action)}
    </span>
  );
}

function formatDetailSummary(action: string, detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const name = detail.playerName as string | undefined;
  const names = detail.playerNames as string[] | undefined;
  switch (action) {
    case "rcon.warn":
      return name
        ? `Warned ${name}${detail.message ? ` -- "${detail.message}"` : ""}`
        : null;
    case "rcon.kick":
      return name
        ? `Kicked ${name}${detail.reason ? ` -- ${detail.reason}` : ""}`
        : null;
    case "rcon.switchteam":
      return name ? `Moved ${name} to other team` : null;
    case "rcon.switchsquad":
      return names?.length
        ? `Moved ${detail.count} players (${names.join(", ")})`
        : detail.count
          ? `Moved ${detail.count} players`
          : null;
    case "rcon.switchclan":
      return `Moved ${detail.count || 0} clan members${detail.clanTag ? ` [${detail.clanTag}]` : ""}${names?.length ? ` (${names.join(", ")})` : ""} to Team ${detail.targetTeam || "?"}`;
    case "rcon.demotecommander":
      return name ? `Demoted ${name}` : null;
    case "rcon.broadcast":
      return detail.message ? `"${detail.message}"` : null;
    case "rcon.disband":
      return `Disbanded squad ${detail.squadID || "?"} on team ${detail.teamID || "?"}`;
    case "rcon.setnextlayer":
      return detail.layer ? `Set next layer: ${detail.layer}` : null;
    case "rcon.endmatch":
      return "Ended current match";
    case "whitelist.add":
      return detail.name ? `Added ${detail.name}${detail.server ? ` on ${detail.server}` : ""}` : null;
    case "whitelist.delete":
      return detail.name ? `Removed ${detail.name}` : null;
    default:
      return null;
  }
}

function DetailView({ detail }: { detail: Record<string, unknown> | null }) {
  if (!detail || Object.keys(detail).length === 0) {
    return <span className="text-text-muted">--</span>;
  }

  return (
    <div className="max-h-40 overflow-auto rounded bg-bg-primary p-2 text-xs">
      {Object.entries(detail).map(([key, value]) => (
        <div key={key} className="mb-1 last:mb-0">
          <span className="text-text-muted">{key}: </span>
          <span className="text-text-secondary">
            {typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AuditLogsPage() {
  const { apiToken } = usePermissions();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!apiToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLogs(apiToken, {
        page,
        limit: PAGE_SIZE,
        action: actionFilter || undefined,
        resource: resourceFilter || undefined,
        from: fromDate || undefined,
        to: toDate ? toDate + "T23:59:59.999Z" : undefined,
      });
      if (res.success && res.data) {
        setLogs(res.data.items);
        setTotal(res.data.total);
      } else {
        setError(res.error || "Failed to load audit logs");
      }
    } catch {
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [apiToken, page, actionFilter, resourceFilter, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredLogs = userSearch
    ? logs.filter((l) => l.userName.toLowerCase().includes(userSearch.toLowerCase()))
    : logs;

  function resetFilters() {
    setActionFilter("");
    setResourceFilter("");
    setUserSearch("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const hasFilters = actionFilter || resourceFilter || userSearch || fromDate || toDate;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-text-primary">
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Track all administrative actions across the website
          </p>
        </div>
        <div className="text-sm text-text-muted">
          {total} {total === 1 ? "entry" : "entries"}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="">All actions</option>
            {ACTION_PREFIXES.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Resource</label>
          <select
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}
            className="rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="">All resources</option>
            {RESOURCE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">User</label>
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-40 rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
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
            onClick={resetFilters}
            className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-sm border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-secondary text-left text-xs uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">Resource ID</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-muted">
                  No audit log entries found
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <tr
                    key={log.id}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-bg-tertiary/50 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {log.userName}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {log.resource.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      {log.resourceId ? (
                        <code className="text-xs text-text-muted">
                          {log.resourceId.length > 16
                            ? log.resourceId.slice(0, 12) + "..."
                            : log.resourceId}
                        </code>
                      ) : (
                        <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isExpanded ? (
                        <DetailView detail={log.detail} />
                      ) : (() => {
                        const summary = formatDetailSummary(log.action, log.detail);
                        if (summary) {
                          return (
                            <span className="text-xs text-text-secondary" title="Click for full details">
                              {summary}
                            </span>
                          );
                        }
                        if (log.detail && Object.keys(log.detail).length > 0) {
                          return <span className="text-xs text-accent">Click to expand</span>;
                        }
                        return <span className="text-text-muted">--</span>;
                      })()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-text-muted">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

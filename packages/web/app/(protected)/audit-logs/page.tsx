"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getAuditLogs, deleteAuditLog } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePermissions } from "@/lib/permission-context";
import { DataTable, type Column } from "@/components/data-table";
import { SearchInput } from "@/components/search-input";
import { AuditLogDetail, FilterNameButton } from "@/components/audit-log-detail";
import { formatDateTime } from "@/lib/format";
import { formatActionLabel, formatAuditSummary, formatResourceLabel } from "@/lib/audit-inspect";
import type { AuditLogEntry } from "shared";

const RESOURCE_OPTIONS = [
  { value: "WhitelistEntry", label: "Whitelist" },
  { value: "DiscordRole", label: "Role" },
  { value: "user", label: "Member" },
  { value: "admin_group", label: "Admin group" },
  { value: "clan", label: "Clan" },
  { value: "server_config", label: "Server config" },
  { value: "match", label: "Match" },
  { value: "SquadJSConfig", label: "SquadJS" },
  { value: "discord_bot", label: "Discord bot" },
  { value: "prospect", label: "Prospect" },
  { value: "LiveServer", label: "Live server" },
  { value: "giveaway", label: "Giveaway" },
  { value: "seeding", label: "Seeding" },
  { value: "ticket_timeout", label: "Ticket timeout" },
];

const ACTION_PREFIXES = [
  { value: "whitelist", label: "Whitelist" },
  { value: "role", label: "Role" },
  { value: "member", label: "Member" },
  { value: "admin_group", label: "Admin group" },
  { value: "clan", label: "Clan" },
  { value: "server_config", label: "Server config" },
  { value: "match", label: "Match" },
  { value: "squadjs", label: "SquadJS" },
  { value: "discord_bot", label: "Discord bot" },
  { value: "prospect", label: "Prospect" },
  { value: "rcon", label: "RCON" },
  { value: "giveaway", label: "Giveaway" },
];

const PAGE_SIZE = 50;

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
    giveaway: "bg-emerald-500/15 text-emerald-400",
    prospect: "bg-teal-500/15 text-teal-400",
  };
  const cls = colorMap[prefix] || "bg-gray-500/15 text-gray-400";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {formatActionLabel(action)}
    </span>
  );
}

export default function AuditLogsPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canDelete = hasPermission("developer");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!apiToken || !canDelete) return;
    if (!confirm("Delete this audit log entry? This cannot be undone.")) return;
    const res = await deleteAuditLog(apiToken, id);
    if (res.success) {
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    }
  }

  function filterByName(name: string) {
    const next = userSearch === name ? "" : name;
    setUserSearch(next);
    setPage(1);
  }

  const query = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    action: actionFilter || undefined,
    resource: resourceFilter || undefined,
    q: userSearch.trim() || undefined,
    from: fromDate || undefined,
    to: toDate ? toDate + "T23:59:59.999Z" : undefined,
  }), [page, actionFilter, resourceFilter, userSearch, fromDate, toDate]);

  const fetchLogs = useCallback(async () => {
    if (!apiToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLogs(apiToken, query);
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
  }, [apiToken, query]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const silentRefreshLogs = useCallback(async () => {
    if (!apiToken) return;
    try {
      const res = await getAuditLogs(apiToken, query);
      if (res.success && res.data) {
        setLogs(res.data.items);
        setTotal(res.data.total);
      }
    } catch { /* silent */ }
  }, [apiToken, query]);

  useAutoRefresh(silentRefreshLogs, 20_000, !!apiToken);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetFilters() {
    setActionFilter("");
    setResourceFilter("");
    setUserSearch("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const hasFilters = actionFilter || resourceFilter || userSearch || fromDate || toDate;

  const auditColumns = useMemo((): Column<AuditLogEntry>[] => [
    {
      key: "time",
      header: "Time",
      render: (log) => (
        <span className="whitespace-nowrap text-text-secondary">
          {formatDateTime(log.createdAt)}
        </span>
      ),
    },
    {
      key: "user",
      header: "User",
      render: (log) => (
        <FilterNameButton
          name={log.userName}
          active={userSearch === log.userName}
          onFilter={filterByName}
        />
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (log) => <ActionBadge action={log.action} />,
    },
    {
      key: "resource",
      header: "Resource",
      render: (log) => (
        <span className="text-text-secondary">{formatResourceLabel(log.resource)}</span>
      ),
    },
    {
      key: "resourceId",
      header: "Resource ID",
      render: (log) =>
        log.resourceId ? (
          <code className="text-xs text-text-muted">
            {log.resourceId.length > 16 ? log.resourceId.slice(0, 12) + "..." : log.resourceId}
          </code>
        ) : (
          <span className="text-text-muted">--</span>
        ),
    },
    {
      key: "details",
      header: "Details",
      render: (log) => {
        const summary = formatAuditSummary(log.action, log.detail);
        return (
          <span className="text-xs text-text-secondary" title="Click row for full details">
            {summary}
          </span>
        );
      },
    },
    ...(canDelete
      ? [{
          key: "actions",
          header: "",
          render: (log: AuditLogEntry) => (
            <button
              onClick={(e) => handleDelete(log.id, e)}
              className="text-xs text-text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
              title="Delete audit log entry (developer only)"
            >
              Delete
            </button>
          ),
        }]
      : []),
  ], [canDelete, userSearch]);

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
              <option key={a.value} value={a.value}>{a.label}</option>
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
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Person</label>
          <SearchInput
            value={userSearch}
            onChange={(value) => { setUserSearch(value); setPage(1); }}
            placeholder="Name, Steam ID, or staff..."
            className="w-56"
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
        <span className="pb-1 text-[11px] text-text-muted">
          Click a name to filter by that person.
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-sm border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="rounded-sm border border-border">
        <DataTable<AuditLogEntry>
          columns={auditColumns}
          data={logs}
          keyExtractor={(log) => log.id}
          emptyMessage={hasFilters ? "No audit log entries match these filters" : "No audit log entries found"}
          loading={loading && logs.length === 0}
          skeletonRows={8}
          onRowClick={(log) => {
            if (window.getSelection()?.toString()) return;
            setExpandedId(expandedId === log.id ? null : log.id);
          }}
          rowClassName="group"
          isExpanded={(log) => expandedId === log.id}
          renderExpanded={(log) => (
            <AuditLogDetail
              log={log}
              filterName={userSearch}
              onFilterName={filterByName}
            />
          )}
        />
      </div>

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

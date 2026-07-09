"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { getAuditLogs, deleteAuditLog } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { SearchInput } from "@/components/search-input";
import { AuditDetail } from "@/components/audit-detail";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
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
import { formatDateTime } from "@/lib/format";
import { formatAction, actionTone, formatDetailSummary, toAuditDetail } from "./lib";
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

export type AuditLogsApi = {
  getAuditLogs: typeof getAuditLogs;
  deleteAuditLog: typeof deleteAuditLog;
};

export const defaultApi: AuditLogsApi = { getAuditLogs, deleteAuditLog };

export function AuditLogsView({
  token,
  canDelete,
  api,
}: {
  token: string | null;
  canDelete: boolean;
  api: AuditLogsApi;
}) {
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

  // Delete dialog
  const [pendingDelete, setPendingDelete] = useState<AuditLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditLogs(token, {
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
        setError((res as { error?: string }).error || "Failed to load audit logs");
      }
    } catch {
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [token, page, actionFilter, resourceFilter, fromDate, toDate, api]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const silentRefreshLogs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getAuditLogs(token, {
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
      }
    } catch { /* silent */ }
  }, [token, page, actionFilter, resourceFilter, fromDate, toDate, api]);

  useAutoRefresh(silentRefreshLogs, 20_000, !!token);

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

  async function handleConfirmDelete() {
    if (!pendingDelete || !token) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    const res = await api.deleteAuditLog(token, id);
    if (res.success) {
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    }
  }

  const activeFilters = useMemo((): ActiveFilter[] => {
    const filters: ActiveFilter[] = [];
    if (actionFilter) filters.push({ key: "action", label: `Action: ${actionFilter.replace(/_/g, " ")}` });
    if (resourceFilter) filters.push({ key: "resource", label: `Resource: ${resourceFilter.replace(/_/g, " ")}` });
    if (userSearch) filters.push({ key: "user", label: `User: ${userSearch}` });
    if (fromDate) filters.push({ key: "from", label: `From: ${fromDate}` });
    if (toDate) filters.push({ key: "to", label: `To: ${toDate}` });
    return filters;
  }, [actionFilter, resourceFilter, userSearch, fromDate, toDate]);

  function clearFilter(key: string) {
    if (key === "action") { setActionFilter(""); setPage(1); }
    else if (key === "resource") { setResourceFilter(""); setPage(1); }
    else if (key === "user") setUserSearch("");
    else if (key === "from") { setFromDate(""); setPage(1); }
    else if (key === "to") { setToDate(""); setPage(1); }
  }

  const auditColumns = useMemo((): ColumnDef<AuditLogEntry, unknown>[] => {
    const cols: ColumnDef<AuditLogEntry, unknown>[] = [
      {
        id: "time",
        header: "Time",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-text-secondary">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "user",
        header: "User",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-medium text-text-primary">{row.original.userName}</span>
        ),
      },
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge tone={actionTone(row.original.action)}>
            {formatAction(row.original.action)}
          </StatusBadge>
        ),
      },
      {
        id: "resource",
        header: "Resource",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-text-secondary">{row.original.resource.replace(/_/g, " ")}</span>
        ),
      },
      {
        id: "resourceId",
        header: "Resource ID",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.resourceId ? (
            <code className="text-xs text-text-muted">
              {row.original.resourceId.length > 16
                ? row.original.resourceId.slice(0, 12) + "..."
                : row.original.resourceId}
            </code>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        id: "details",
        header: "Details",
        enableSorting: false,
        cell: ({ row }) => {
          const log = row.original;
          const summary = formatDetailSummary(log.action, log.detail);
          if (summary) {
            return (
              <span className="text-xs text-text-secondary" title="Expand for full details">
                {summary}
              </span>
            );
          }
          if (log.detail && Object.keys(log.detail).length > 0) {
            return <span className="text-xs text-text-muted">expand for details</span>;
          }
          return <span className="text-text-muted">--</span>;
        },
      },
    ];

    if (canDelete) {
      cols.push({
        id: "delete",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            aria-label="delete"
            onClick={(e) => {
              e.stopPropagation();
              setPendingDelete(row.original);
            }}
            className="text-xs text-text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
            title="Delete audit log entry (developer only)"
          >
            Delete
          </button>
        ),
      });
    }

    return cols;
  }, [canDelete]);

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
      <div className="mb-4">
        <FilterBar
          activeFilters={activeFilters}
          onClear={clearFilter}
          onClearAll={resetFilters}
        >
          <div>
            <label className="mb-1 block text-xs text-text-muted">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary"
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
              className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary"
            >
              <option value="">All resources</option>
              {RESOURCE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">User</label>
            <SearchInput
              value={userSearch}
              onChange={setUserSearch}
              placeholder="Search by name..."
              className="w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary"
            />
          </div>
        </FilterBar>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-sm border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Table */}
      <DataTable<AuditLogEntry>
        columns={auditColumns}
        data={filteredLogs}
        getRowId={(l) => l.id}
        serverPagination={{ page, totalPages, onPageChange: setPage }}
        loading={loading && logs.length === 0}
        rowClassName={() => "group"}
        renderDetail={(log) => (
          <AuditDetail {...toAuditDetail(log.detail)} changes={[]} />
        )}
        emptyState={<EmptyState message="No audit log entries found" />}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete audit log entry</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

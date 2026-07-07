"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { getAuditLogs } from "@/lib/api-client";
import type { AdminGroup, AuditLogEntry, Clan } from "shared";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { DataTable } from "@/components/data-table-v2";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { AuditDetail } from "@/components/audit-detail";
import { EmptyState } from "@/components/empty-state";
import {
  ACTION_OPTIONS,
  getActionLabel,
  getActionTone,
  getDetailSummary,
  wlAuditDetailProps,
} from "./lib";

const PAGE_SIZE = 50;

export type GetAuditLogsParams = NonNullable<Parameters<typeof getAuditLogs>[1]>;

export interface ActivityApi {
  getAuditLogs: (token: string, params: GetAuditLogsParams) => ReturnType<typeof getAuditLogs>;
}

const defaultApi: ActivityApi = { getAuditLogs };

export default function ActivityTab({
  token,
  groups,
  clans,
  api = defaultApi,
}: {
  token: string | null;
  groups: AdminGroup[];
  clans: Clan[];
  api?: ActivityApi;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await api.getAuditLogs(token, {
      page,
      limit: PAGE_SIZE,
      resource: "WhitelistEntry",
      action: actionFilter || undefined,
      userId: userSearch || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    });
    if (res.success && res.data) {
      setLogs(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [token, api, page, actionFilter, userSearch, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useAutoRefresh(fetchLogs, 20_000, !!token);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const activeFilters: ActiveFilter[] = [];
  if (actionFilter) {
    const label = ACTION_OPTIONS.find((o) => o.value === actionFilter)?.label ?? actionFilter;
    activeFilters.push({ key: "action", label: `Action: ${label}` });
  }
  if (userSearch) activeFilters.push({ key: "user", label: `User: ${userSearch}` });
  if (fromDate) activeFilters.push({ key: "from", label: `From: ${fromDate}` });
  if (toDate) activeFilters.push({ key: "to", label: `To: ${toDate}` });

  function clearFilter(key: string) {
    if (key === "action") setActionFilter("");
    if (key === "user") setUserSearch("");
    if (key === "from") setFromDate("");
    if (key === "to") setToDate("");
    setPage(1);
  }

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(
    () => [
      {
        id: "time",
        header: "Time",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary" title={formatDateTime(row.original.createdAt)}>
            {formatRelativeTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "user",
        header: "User",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs font-medium text-text-primary">{row.original.userName}</span>
        ),
      },
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge tone={getActionTone(row.original.action)}>
            {getActionLabel(row.original.action)}
          </StatusBadge>
        ),
      },
      {
        id: "details",
        header: "Details",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary">
            {getDetailSummary(row.original, groups, clans)}
          </span>
        ),
      },
    ],
    [groups, clans],
  );

  return (
    <>
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={clearFilter}
        onClearAll={() => {
          setActionFilter("");
          setUserSearch("");
          setFromDate("");
          setToDate("");
          setPage(1);
        }}
      >
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={userSearch}
          onChange={(e) => { setUserSearch(e.target.value); setPage(1); }}
          placeholder="User ID..."
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          title="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          title="To date"
        />
        <span className="ml-auto text-xs text-text-muted">{total} total</span>
      </FilterBar>

      <DataTable
        columns={columns}
        data={logs}
        getRowId={(l) => l.id}
        loading={loading && logs.length === 0}
        skeletonRows={8}
        serverPagination={{ page, totalPages, onPageChange: setPage }}
        emptyState={<EmptyState className="py-8" message="No activity logs found." />}
        renderDetail={(log) =>
          log.detail ? (
            <AuditDetail {...wlAuditDetailProps(log, groups, clans)} />
          ) : (
            <p className="text-xs text-text-muted">No details recorded.</p>
          )
        }
      />
    </>
  );
}

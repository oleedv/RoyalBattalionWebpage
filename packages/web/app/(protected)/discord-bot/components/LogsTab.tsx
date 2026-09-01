"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getBotLogs } from "@/lib/api-client";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { BotLog } from "shared";

const PAGE_SIZE = 100;

function LevelBadge({ level, label }: { level: number; label: string }) {
  const colors: Record<number, string> = {
    30: "bg-accent/15 text-accent border-accent/30",
    40: "bg-warning/15 text-warning border-warning/30",
    50: "bg-danger/15 text-danger border-danger/30",
    60: "bg-danger/25 text-danger border-danger/50",
  };
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium uppercase ${colors[level] || colors[30]}`}>
      {label}
    </span>
  );
}

export default function LogsTab({ apiToken }: { apiToken: string }) {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filters
  const [levelFilter, setLevelFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    const res = await getBotLogs(apiToken, {
      limit: PAGE_SIZE,
      page: pageNum + 1,
      level: levelFilter ? Number(levelFilter) : undefined,
      module: moduleFilter || undefined,
      search: search || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    });
    if (res.success && res.data) {
      setLogs(res.data.items);
      setTotal(res.data.total);
    } else {
      setError(res.error || "Failed to load logs");
    }
    setLoading(false);
  }, [apiToken, levelFilter, moduleFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  // Auto-refresh with visibility-based pausing
  useEffect(() => {
    function startInterval() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => fetchLogs(page), 15000);
    }

    function stopInterval() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stopInterval();
      } else if (autoRefresh) {
        fetchLogs(page);
        startInterval();
      }
    }

    if (autoRefresh) {
      startInterval();
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [autoRefresh, page, fetchLogs]);

  function applyFilters() {
    setPage(0);
    fetchLogs(0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") applyFilters();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={levelFilter}
          onChange={(e) => { setLevelFilter(e.target.value); setPage(0); }}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        >
          <option value="">All Levels</option>
          <option value="30">Info</option>
          <option value="40">Warn</option>
          <option value="50">Error</option>
          <option value="60">Fatal</option>
        </select>
        <input
          type="text"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Module..."
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
        />
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages..."
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
        <button
          onClick={applyFilters}
          className="rounded-sm bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Filter
        </button>
        <label className="flex items-center gap-2 rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded-sm"
          />
          Auto-refresh
        </label>
      </div>

      {/* Date range */}
      <div className="mb-6 flex gap-3">
        <input
          type="datetime-local"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        />
        <span className="self-center text-xs text-text-muted">to</span>
        <input
          type="datetime-local"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        />
      </div>

      {/* Results info + pagination */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {formatNumber(total)} logs {loading && "(loading...)"} {autoRefresh && " -- auto-refreshing"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs text-text-muted">
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Log entries */}
      {error ? (
        <div className="text-danger">{error}</div>
      ) : loading && logs.length === 0 ? (
        <SkeletonRegion className="space-y-1" label="Loading logs…">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="facet-border rounded-sm bg-bg-card px-4 py-2.5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-32 shrink-0" />
                <Skeleton className="h-4 w-12 shrink-0 rounded-sm" />
                <Skeleton className="h-4 w-20 shrink-0 rounded-sm" />
                <Skeleton className="h-3 flex-1" />
              </div>
            </div>
          ))}
        </SkeletonRegion>
      ) : logs.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
          No logs found
        </div>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const rowBg = log.level >= 50 ? "bg-danger/5" : log.level >= 40 ? "bg-warning/5" : "bg-bg-card";
            return (
              <div key={log.id} className={`facet-border rounded-sm ${rowBg} transition-all`}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-card-hover"
                >
                  <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">
                    {formatDateTime(log.createdAt)}
                  </span>
                  <span className="shrink-0">
                    <LevelBadge level={log.level} label={log.levelLabel} />
                  </span>
                  {log.module && (
                    <span className="shrink-0 rounded-sm bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
                      {log.module}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {log.message}
                  </span>
                  {log.data != null && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                {isExpanded && log.data != null && (
                  <div className="border-t border-border/30 px-4 py-3">
                    <pre className="max-h-64 overflow-auto rounded-sm bg-bg-tertiary p-3 text-xs text-text-secondary">
                      {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

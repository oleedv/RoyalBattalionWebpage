"use client";

import { useState, useEffect, useCallback } from "react";
import { getBotLogs } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/search-input-v2";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ChevronDown } from "lucide-react";
import type { BotLog } from "shared";

const PAGE_SIZE = 100;

export type LogsApi = { getBotLogs: typeof getBotLogs };
const defaultApi: LogsApi = { getBotLogs };

function levelTone(level: number): "neutral" | "warning" | "danger" {
  if (level >= 50) return "danger";
  if (level >= 40) return "warning";
  return "neutral";
}

export default function LogsTab({
  apiToken,
  api = defaultApi,
}: {
  apiToken: string;
  api?: LogsApi;
}) {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Filters
  const [levelFilter, setLevelFilter] = useState("0"); // "0" = all levels
  const [moduleFilter, setModuleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      const res = await api.getBotLogs(apiToken, {
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
        level: levelFilter !== "0" ? Number(levelFilter) : undefined,
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
    },
    [apiToken, api, levelFilter, moduleFilter, search, dateFrom, dateTo],
  );

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  // Silent auto-refresh - no loading state change
  const silentRefreshLogs = useCallback(async () => {
    try {
      const res = await api.getBotLogs(apiToken, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        level: levelFilter !== "0" ? Number(levelFilter) : undefined,
        module: moduleFilter || undefined,
        search: search || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      if (res.success && res.data) {
        setLogs(res.data.items);
        setTotal(res.data.total);
      }
    } catch {
      /* silent */
    }
  }, [apiToken, api, page, levelFilter, moduleFilter, search, dateFrom, dateTo]);

  // useAutoRefresh pauses ticks on document.hidden; resumes + fetches on visibility restore
  useAutoRefresh(silentRefreshLogs, 15_000, autoRefresh);

  function applyFilters() {
    setPage(0);
    fetchLogs(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={levelFilter}
          onValueChange={(v) => {
            if (v !== null) {
              setLevelFilter(v);
              setPage(0);
            }
          }}
        >
          <SelectTrigger aria-label="Level" className="min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">All Levels</SelectItem>
            <SelectItem value="30">Info</SelectItem>
            <SelectItem value="40">Warn</SelectItem>
            <SelectItem value="50">Error</SelectItem>
            <SelectItem value="60">Fatal</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="text"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Module..."
          className="w-36"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search messages..."
          className="flex-1"
        />
        <Button onClick={applyFilters}>Filter</Button>
        <div className="flex items-center gap-2">
          <Switch
            aria-label="Auto-refresh"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
          <span className="text-sm text-text-secondary">Auto-refresh</span>
        </div>
      </div>

      {/* Date range */}
      <div className="mb-4 flex gap-3">
        <Input
          type="datetime-local"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-auto"
        />
        <span className="self-center text-xs text-text-muted">to</span>
        <Input
          type="datetime-local"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-auto"
        />
      </div>

      {/* Results info + pagination */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {total.toLocaleString()} logs {loading && "(loading...)"}
          {autoRefresh && " — auto-refreshing"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
          >
            Prev
          </Button>
          <span className="text-xs text-text-muted">
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
          >
            Next
          </Button>
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
        <EmptyState message="No logs found" />
      ) : (
        <div className="space-y-1">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const rowBg =
              log.level >= 50
                ? "bg-danger/5"
                : log.level >= 40
                  ? "bg-warning/5"
                  : "bg-bg-card";
            return (
              <div
                key={log.id}
                className={`facet-border rounded-sm ${rowBg} transition-all`}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-card-hover"
                >
                  <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                  <StatusBadge tone={levelTone(log.level)}>
                    {log.levelLabel}
                  </StatusBadge>
                  {log.module && (
                    <span className="shrink-0 rounded-sm bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
                      {log.module}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {log.message}
                  </span>
                  {log.data != null && (
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 shrink-0 text-text-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>
                {isExpanded && log.data != null && (
                  <div className="border-t border-border/30 px-4 py-3">
                    <pre className="max-h-64 overflow-auto rounded-sm bg-bg-tertiary p-3 text-xs text-text-secondary">
                      {typeof log.data === "string"
                        ? log.data
                        : JSON.stringify(log.data, null, 2)}
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

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getSeedTrackerLeaderboard,
  getSeedTrackerPlayer,
  getSeedTrackerStats,
  searchSeedTracker,
} from "@/lib/api-client";
import type {
  SeedTrackerLeaderboardEntry,
  SeedTrackerPlayerDetail,
  SeedTrackerSession,
  SeedTrackerStats,
} from "shared";
import { HourlyChart } from "./HourlyChart";
import { WeekdayChart } from "./WeekdayChart";
import { DataTable } from "@/components/data-table-v2";
import { SearchInput } from "@/components/search-input-v2";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (!seconds) return "--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function formatQuality(quality: number | null): string {
  if (quality == null) return "--";
  return `${Math.round(quality * 100)}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// DI seam
// ---------------------------------------------------------------------------

export type SeedingLeaderboardApi = {
  getSeedTrackerLeaderboard: typeof getSeedTrackerLeaderboard;
  getSeedTrackerStats: typeof getSeedTrackerStats;
  getSeedTrackerPlayer: typeof getSeedTrackerPlayer;
  searchSeedTracker: typeof searchSeedTracker;
};

export const defaultApi: SeedingLeaderboardApi = {
  getSeedTrackerLeaderboard,
  getSeedTrackerStats,
  getSeedTrackerPlayer,
  searchSeedTracker,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SeedingLeaderboard({
  apiToken,
  api = defaultApi,
}: {
  apiToken: string;
  api?: SeedingLeaderboardApi;
}) {
  const [tab, setTab] = useState<"leaderboard" | "search">("leaderboard");
  const [days, setDays] = useState(30);
  const [leaderboard, setLeaderboard] = useState<SeedTrackerLeaderboardEntry[]>([]);
  const [stats, setStats] = useState<SeedTrackerStats | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SeedTrackerLeaderboardEntry[]>([]);
  const [selectedSteamId, setSelectedSteamId] = useState<string | null>(null);
  const [playerDetail, setPlayerDetail] = useState<SeedTrackerPlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [lbRes, statsRes] = await Promise.all([
      api.getSeedTrackerLeaderboard(apiToken, days),
      api.getSeedTrackerStats(apiToken),
    ]);
    if (lbRes.success && lbRes.data) setLeaderboard(lbRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    setLoading(false);
  }, [apiToken, days, api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectPlayer = useCallback(
    async (steamId: string) => {
      setSelectedSteamId(steamId);
      setDetailLoading(true);
      const res = await api.getSeedTrackerPlayer(apiToken, steamId);
      if (res.success && res.data) setPlayerDetail(res.data);
      setDetailLoading(false);
    },
    [apiToken, api],
  );

  // SearchInput's built-in debounce fires this after 300ms of typing inactivity
  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }
      const res = await api.searchSeedTracker(apiToken, query.trim());
      if (res.success && res.data) setSearchResults(res.data);
    },
    [apiToken, api],
  );

  // Keep a ref so the tab-change effect can read the current query without
  // including it in deps (avoids re-running the effect on every keystroke).
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  // Clear search results when leaving search tab; re-run search when returning
  // with an existing query (restores original behaviour where tab re-entry
  // re-triggered the debounced fetch).
  useEffect(() => {
    if (tab !== "search") {
      setSearchResults([]);
    } else if (searchQueryRef.current.trim()) {
      handleSearch(searchQueryRef.current);
    }
  }, [tab, handleSearch]);

  // ---------------------------------------------------------------------------
  // Shared 6-column ColumnDef (leaderboard + search tables)
  // ---------------------------------------------------------------------------

  const sharedColumns = useMemo<ColumnDef<SeedTrackerLeaderboardEntry, unknown>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        enableSorting: false,
        cell: ({ row, table }) => {
          const { pageIndex, pageSize } = table.getState().pagination;
          return (
            <span className="tabular-nums text-text-muted">
              {pageIndex * pageSize + row.index + 1}
            </span>
          );
        },
      },
      {
        id: "player",
        header: "Player",
        accessorFn: (e) => e.name,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium text-text-primary">{row.original.name}</span>
            {row.original.isActive && (
              <span
                className="inline-block h-2 w-2 rounded-full bg-success"
                title="Currently seeding"
              />
            )}
          </span>
        ),
      },
      {
        id: "seedDays",
        header: "Seed Days",
        accessorFn: (e) => e.seedDays,
        cell: ({ row }) => row.original.seedDays,
      },
      {
        id: "duration",
        header: "Duration",
        accessorFn: (e) => e.totalDuration,
        cell: ({ row }) => formatDuration(row.original.totalDuration),
      },
      {
        id: "avgQuality",
        header: "Avg Quality",
        accessorFn: (e) => e.avgQuality,
        cell: ({ row }) => formatQuality(row.original.avgQuality),
      },
      {
        id: "lastSeed",
        header: "Last Seed",
        accessorFn: (e) => e.lastSeedDate ?? undefined,
        sortUndefined: "last",
        cell: ({ row }) => (
          <span className="text-text-muted">{formatDate(row.original.lastSeedDate)}</span>
        ),
      },
    ],
    [],
  );

  // ---------------------------------------------------------------------------
  // Session ColumnDef (detail view)
  // ---------------------------------------------------------------------------

  const sessionColumns = useMemo<ColumnDef<SeedTrackerSession, unknown>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        accessorFn: (s) => s.seedDate,
        cell: ({ row }) => (
          <span className="flex items-center gap-2 text-text-muted">
            {formatDate(row.original.seedDate)}
            {row.original.status === "active" && (
              <StatusBadge tone="success" className="py-0 text-[10px]">
                LIVE
              </StatusBadge>
            )}
          </span>
        ),
      },
      {
        id: "duration",
        header: "Duration",
        accessorFn: (s) => s.durationSeconds ?? undefined,
        sortUndefined: "last",
        cell: ({ row }) =>
          row.original.status === "active"
            ? "In progress"
            : formatDuration(row.original.durationSeconds ?? 0),
      },
      {
        id: "joinPop",
        header: "Join Pop",
        accessorFn: (s) => s.joinPopulation,
        cell: ({ row }) => row.original.joinPopulation,
      },
      {
        id: "peakPop",
        header: "Peak Pop",
        accessorFn: (s) => s.peakPopulation,
        cell: ({ row }) => row.original.peakPopulation,
      },
      {
        id: "threshold",
        header: "Threshold",
        accessorFn: (s) => Number(s.thresholdReached),
        cell: ({ row }) =>
          row.original.thresholdReached ? (
            <span className="text-success">Yes</span>
          ) : (
            <span className="text-text-muted">No</span>
          ),
      },
      {
        id: "quality",
        header: "Quality",
        accessorFn: (s) => s.qualityScore ?? undefined,
        sortUndefined: "last",
        cell: ({ row }) => formatQuality(row.original.qualityScore),
      },
    ],
    [],
  );

  // ---------------------------------------------------------------------------
  // Detail view (page takeover — preserve this early-return pattern)
  // ---------------------------------------------------------------------------

  if (selectedSteamId) {
    return (
      <div>
        <button
          onClick={() => {
            setSelectedSteamId(null);
            setPlayerDetail(null);
          }}
          className="mb-6 flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-accent"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to list
        </button>

        {detailLoading || !playerDetail ? (
          <div className="text-text-secondary">Loading player data...</div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text-primary">{playerDetail.name}</h2>
                <a
                  href={`https://steamid.io/lookup/${playerDetail.steamId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-text-muted hover:text-accent"
                >
                  {playerDetail.steamId}
                </a>
              </div>
              {playerDetail.whitelistStatus?.hasWhitelist ? (
                <StatusBadge tone="success">
                  Whitelisted ({playerDetail.whitelistStatus.role})
                  {playerDetail.whitelistStatus.expiresAt &&
                    ` - expires ${new Date(
                      playerDetail.whitelistStatus.expiresAt,
                    ).toLocaleDateString()}`}
                </StatusBadge>
              ) : (
                <StatusBadge tone="neutral">No Whitelist</StatusBadge>
              )}
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                label="Seed Days (30d / 90d / All)"
                value={`${playerDetail.seedDays30} / ${playerDetail.seedDays90} / ${playerDetail.seedDaysAll}`}
              />
              <StatCard
                label="Total Duration (30d)"
                value={formatDuration(playerDetail.totalDuration30)}
              />
              <StatCard label="Avg Quality" value={formatQuality(playerDetail.avgQuality)} />
              <StatCard
                label="Current Streak"
                value={`${playerDetail.streak} day${playerDetail.streak !== 1 ? "s" : ""}`}
              />
            </div>

            {/* Charts */}
            <div className="grid gap-6 md:grid-cols-2">
              <HourlyChart data={playerDetail.timeOfDayDistribution} />
              <WeekdayChart data={playerDetail.frequencyByWeekday} />
            </div>

            {/* Recent Sessions */}
            <div className="rounded-sm border border-border bg-bg-card p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
                Recent Sessions
              </div>
              <DataTable
                data={playerDetail.recentSessions}
                columns={sessionColumns}
                getRowId={(s) => String(s.id)}
                pageSize={10}
                emptyState={
                  <EmptyState variant="hint" message="No sessions recorded." />
                }
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // List view
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* Stats overview */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total Seeders" value={stats?.totalSeeders ?? "--"} />
        <StatCard
          label="Total Seed Hours"
          value={
            stats?.totalSeedHours != null ? `${Math.round(stats.totalSeedHours)}h` : "--"
          }
        />
        <StatCard
          label="Avg Quality"
          value={
            stats?.avgQuality != null ? `${Math.round(stats.avgQuality * 100)}%` : "--"
          }
        />
        <StatCard label="Active (7d)" value={stats?.activeSeeders7d ?? "--"} />
        <StatCard
          label="Seeding Now"
          value={
            <span className="text-success">{stats?.currentlySeedingCount ?? "--"}</span>
          }
          className="border-success/30 bg-success/5"
        />
      </div>

      {/* Tab bar — onClick-per-trigger is the proven happy-dom fallback for Base UI Tabs */}
      <Tabs value={tab} className="mb-4">
        <TabsList variant="line">
          <TabsTrigger value="leaderboard" onClick={() => setTab("leaderboard")}>
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="search" onClick={() => setTab("search")}>
            Search
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Leaderboard content */}
      {tab === "leaderboard" && (
        <div>
          <div className="mb-4">
            <ToggleGroup
              value={[String(days)]}
              onValueChange={(next) => {
                const d = next[0];
                if (d) setDays(Number(d));
              }}
              size="sm"
              variant="outline"
            >
              {[30, 60, 90].map((d) => (
                <ToggleGroupItem key={d} value={String(d)}>
                  {d}d
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <DataTable
            data={leaderboard}
            columns={sharedColumns}
            getRowId={(e) => e.steamId}
            onRowClick={(e) => selectPlayer(e.steamId)}
            loading={loading}
            emptyState={
              <EmptyState message="No seeding data found for this period." />
            }
          />
        </div>
      )}

      {/* Search content */}
      {tab === "search" && (
        <div>
          <SearchInput
            value={searchQuery}
            onChange={(v) => setSearchQuery(v)}
            onSearch={handleSearch}
            debounceMs={300}
            placeholder="Search by player name..."
            className="mb-4"
          />

          {searchQuery.trim() ? (
            <DataTable
              data={searchResults}
              columns={sharedColumns}
              getRowId={(e) => e.steamId}
              onRowClick={(e) => selectPlayer(e.steamId)}
              emptyState={<EmptyState message="No results found." />}
            />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">
              Type a player name to search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

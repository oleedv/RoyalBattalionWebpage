"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getSeedTrackerLeaderboard,
  getSeedTrackerPlayer,
  getSeedTrackerStats,
  searchSeedTracker,
} from "@/lib/api-client";
import type {
  SeedTrackerLeaderboardEntry,
  SeedTrackerPlayerDetail,
  SeedTrackerStats,
} from "shared";
import { formatDate as formatDateGb } from "@/lib/format";
import { HourlyChart } from "./HourlyChart";
import { WeekdayChart } from "./WeekdayChart";

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
  return formatDateGb(d);
}

interface Props {
  apiToken: string;
}

export function SeedingLeaderboard({ apiToken }: Props) {
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
      getSeedTrackerLeaderboard(apiToken, days),
      getSeedTrackerStats(apiToken),
    ]);
    if (lbRes.success && lbRes.data) setLeaderboard(lbRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    setLoading(false);
  }, [apiToken, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  useEffect(() => {
    if (tab !== "search" || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchSeedTracker(apiToken, searchQuery.trim());
      if (res.success && res.data) setSearchResults(res.data);
    }, 300);
    return () => clearTimeout(timer);
  }, [apiToken, searchQuery, tab]);

  const selectPlayer = useCallback(
    async (steamId: string) => {
      setSelectedSteamId(steamId);
      setDetailLoading(true);
      const res = await getSeedTrackerPlayer(apiToken, steamId);
      if (res.success && res.data) setPlayerDetail(res.data);
      setDetailLoading(false);
    },
    [apiToken]
  );

  // Player Detail view
  if (selectedSteamId) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-wide">Seeding</h1>
        </div>

        <button
          onClick={() => {
            setSelectedSteamId(null);
            setPlayerDetail(null);
          }}
          className="mb-6 flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-accent"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
                <span className="rounded-sm border border-success/30 bg-success/15 px-2 py-1 text-xs font-medium text-success">
                  Whitelisted ({playerDetail.whitelistStatus.role})
                  {playerDetail.whitelistStatus.expiresAt &&
                    ` - expires ${formatDate(playerDetail.whitelistStatus.expiresAt)}`}
                </span>
              ) : (
                <span className="rounded-sm border border-text-muted/30 bg-text-muted/15 px-2 py-1 text-xs font-medium text-text-secondary">
                  No Whitelist
                </span>
              )}
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-sm border border-border bg-bg-card p-5">
                <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                  Seed Days (30d / 90d / All)
                </div>
                <div className="mt-2 text-2xl font-bold text-text-primary">
                  {playerDetail.seedDays30} / {playerDetail.seedDays90} / {playerDetail.seedDaysAll}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-bg-card p-5">
                <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                  Total Duration (30d)
                </div>
                <div className="mt-2 text-2xl font-bold text-text-primary">
                  {formatDuration(playerDetail.totalDuration30)}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-bg-card p-5">
                <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                  Avg Quality
                </div>
                <div className="mt-2 text-2xl font-bold text-text-primary">
                  {formatQuality(playerDetail.avgQuality)}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-bg-card p-5">
                <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                  Current Streak
                </div>
                <div className="mt-2 text-2xl font-bold text-text-primary">
                  {playerDetail.streak} day{playerDetail.streak !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid gap-6 md:grid-cols-2">
              <HourlyChart data={playerDetail.timeOfDayDistribution} />
              <WeekdayChart data={playerDetail.frequencyByWeekday} />
            </div>

            {/* Recent Sessions */}
            <div className="rounded-sm border border-border bg-bg-card p-5">
              <div className="mb-3 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                Recent Sessions
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                        Date
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                        Duration
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                        Join Pop
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                        Peak Pop
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                        Threshold
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                        Quality
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerDetail.recentSessions.map((s) => (
                      <tr key={s.id} className="border-b border-border/50">
                        <td className="px-3 py-2.5 text-text-muted">
                          <span className="flex items-center gap-2">
                            {formatDate(s.seedDate)}
                            {s.status === "active" && (
                              <span className="rounded-sm bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                                LIVE
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">{s.status === "active" ? "In progress" : formatDuration(s.durationSeconds ?? 0)}</td>
                        <td className="px-3 py-2.5">{s.joinPopulation}</td>
                        <td className="px-3 py-2.5">{s.peakPopulation}</td>
                        <td className="px-3 py-2.5">
                          {s.thresholdReached ? (
                            <span className="text-success">Yes</span>
                          ) : (
                            <span className="text-text-muted">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">{formatQuality(s.qualityScore)}</td>
                      </tr>
                    ))}
                    {playerDetail.recentSessions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                          No sessions recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main list view
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-wide">Seeding</h1>
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-sm border border-border bg-bg-card p-5">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
            Total Seeders
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">
            {stats?.totalSeeders ?? "--"}
          </div>
        </div>
        <div className="rounded-sm border border-border bg-bg-card p-5">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
            Total Seed Hours
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">
            {stats?.totalSeedHours != null ? `${Math.round(stats.totalSeedHours)}h` : "--"}
          </div>
        </div>
        <div className="rounded-sm border border-border bg-bg-card p-5">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
            Avg Quality
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">
            {stats?.avgQuality != null ? `${Math.round(stats.avgQuality * 100)}%` : "--"}
          </div>
        </div>
        <div className="rounded-sm border border-border bg-bg-card p-5">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
            Active (7d)
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">
            {stats?.activeSeeders7d ?? "--"}
          </div>
        </div>
        <div className="rounded-sm border border-success/30 bg-success/5 p-5">
          <div className="text-xs font-semibold tracking-[0.15em] uppercase text-success/70">
            Seeding Now
          </div>
          <div className="mt-2 text-2xl font-bold text-success">
            {stats?.currentlySeedingCount ?? "--"}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-sm border border-border bg-bg-tertiary/50 p-1">
        <button
          onClick={() => setTab("leaderboard")}
          className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium tracking-wide transition-colors ${
            tab === "leaderboard"
              ? "bg-bg-card text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Leaderboard
        </button>
        <button
          onClick={() => setTab("search")}
          className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium tracking-wide transition-colors ${
            tab === "search"
              ? "bg-bg-card text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Search
        </button>
      </div>

      {/* Leaderboard tab */}
      {tab === "leaderboard" && (
        <div>
          {/* Date range selector */}
          <div className="mb-4 flex gap-2">
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-sm px-3 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                  days === d
                    ? "bg-accent text-bg-primary"
                    : "border border-border text-text-muted hover:text-text-secondary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-8 text-center text-text-secondary">Loading leaderboard...</div>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-border bg-bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      #
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Player
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Seed Days
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Duration
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Avg Quality
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Last Seed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => (
                    <tr
                      key={entry.steamId}
                      onClick={() => selectPlayer(entry.steamId)}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-bg-tertiary"
                    >
                      <td className="px-3 py-2.5 text-text-muted">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-text-primary">
                        <span className="flex items-center gap-2">
                          {entry.name}
                          {entry.isActive && (
                            <span className="inline-block h-2 w-2 rounded-full bg-success" title="Currently seeding" />
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{entry.seedDays}</td>
                      <td className="px-3 py-2.5">{formatDuration(entry.totalDuration)}</td>
                      <td className="px-3 py-2.5">{formatQuality(entry.avgQuality)}</td>
                      <td className="px-3 py-2.5 text-text-muted">{formatDate(entry.lastSeedDate)}</td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                        No seeding data found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Search tab */}
      {tab === "search" && (
        <div>
          <input
            type="text"
            placeholder="Search by player name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-4 w-full rounded-sm border border-border bg-bg-card px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />

          {searchQuery.trim() && searchResults.length > 0 && (
            <div className="overflow-x-auto rounded-sm border border-border bg-bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      #
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Player
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Seed Days
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Duration
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Avg Quality
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
                      Last Seed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((entry, i) => (
                    <tr
                      key={entry.steamId}
                      onClick={() => selectPlayer(entry.steamId)}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-bg-tertiary"
                    >
                      <td className="px-3 py-2.5 text-text-muted">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-text-primary">
                        <span className="flex items-center gap-2">
                          {entry.name}
                          {entry.isActive && (
                            <span className="inline-block h-2 w-2 rounded-full bg-success" title="Currently seeding" />
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{entry.seedDays}</td>
                      <td className="px-3 py-2.5">{formatDuration(entry.totalDuration)}</td>
                      <td className="px-3 py-2.5">{formatQuality(entry.avgQuality)}</td>
                      <td className="px-3 py-2.5 text-text-muted">{formatDate(entry.lastSeedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {searchQuery.trim() && searchResults.length === 0 && (
            <div className="py-8 text-center text-text-muted">No results found.</div>
          )}

          {!searchQuery.trim() && (
            <div className="py-8 text-center text-text-muted">
              Type a player name to search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

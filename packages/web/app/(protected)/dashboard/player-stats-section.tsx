"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPlayerStats } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { StatCard, StatGroup } from "@/components/stat-card";
import { InfoTip } from "@/components/info-tip";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  PlayerStatsCharts,
  type ChartPoint,
} from "@/app/(protected)/dashboard/player-stats-charts";
import type {
  ApiResponse,
  PlayerStats,
  PlayerStatsWindow,
  StatWindowKey,
} from "shared";

/* ── helpers ─────────────────────────────────────────────────────────── */

const WINDOWS: { key: StatWindowKey; label: string; days: number }[] = [
  { key: "d7", label: "7D", days: 7 },
  { key: "d30", label: "30D", days: 30 },
  { key: "d90", label: "90D", days: 90 },
  { key: "all", label: "All", days: 90 },
];

export const fmtHours = (h: number) => (h >= 10 ? `${Math.round(h)}h` : `${h}h`);
const fmtNum = (n: number) => n.toLocaleString("en-US");

export function prettyWeapon(raw: string): string {
  return raw
    .replace(/_C$/, "")
    .replace(/^BP_/, "")
    .replace(/_/g, " ")
    .trim();
}

export function shortDate(iso: string): string {
  // iso is "YYYY-MM-DD"
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1] ?? ""}`;
}

export interface StatsApi {
  getPlayerStats: (token: string) => Promise<ApiResponse<PlayerStats>>;
}

const defaultApi: StatsApi = { getPlayerStats };

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
        My Squad Stats
      </h2>
      {children}
    </div>
  );
}

/* ── main section ────────────────────────────────────────────────────── */

export default function PlayerStatsSection({
  api = defaultApi,
  Charts = PlayerStatsCharts,
}: {
  api?: StatsApi;
  Charts?: React.ComponentType<{ data: ChartPoint[] }>;
}) {
  const { apiToken } = usePermissions();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeWindow, setActiveWindow] = useState<StatWindowKey>("d30");

  useEffect(() => {
    if (!apiToken) return;
    let cancelled = false;
    async function fetchStats() {
      const res = await api.getPlayerStats(apiToken!);
      if (!cancelled) {
        if (res.success && res.data) setStats(res.data);
        setLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [apiToken, api]);

  const win: PlayerStatsWindow | null = stats ? stats.windows[activeWindow] : null;

  const chartData: ChartPoint[] = useMemo(() => {
    if (!stats) return [];
    const days = WINDOWS.find((w) => w.key === activeWindow)?.days ?? 90;
    return stats.daily.slice(-days).map((p) => ({
      date: shortDate(p.date),
      kills: p.kills,
      deaths: p.deaths,
      playtime: p.playtimeHours,
    }));
  }, [stats, activeWindow]);

  if (loading) {
    return (
      <SkeletonCard>
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded" />
          ))}
        </div>
      </SkeletonCard>
    );
  }

  if (!stats) return null;

  // Not linked -> nudge toward the Steam-link form in the profile header above.
  if (!stats.linked) {
    return (
      <SectionCard>
        <EmptyState
          className="py-8"
          message="Link your Steam ID above to unlock your personal Squad stats — kills, K/D, playtime, squad-lead time and more."
          action={
            <Button
              variant="outlineGold"
              size="sm"
              render={<a href="#steam-link" />}
            >
              Link Steam ID
            </Button>
          }
        />
      </SectionCard>
    );
  }

  // Linked but no record on our servers yet.
  if (!stats.hasData) {
    return (
      <SectionCard>
        <EmptyState
          className="py-8"
          message="No recorded activity on our servers yet. Jump in-game and your stats will show up here."
          action={
            <Button
              variant="outlineGold"
              size="sm"
              render={<Link href="/server" />}
            >
              How to Connect
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const records = stats.records;

  return (
    <div className="facet-border rounded-sm bg-bg-card">
      {/* Header + window toggle */}
      <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
            My Squad Stats
          </h2>
          <p className="text-[11px] text-text-muted">
            {stats.playerName ? `${stats.playerName} · ` : ""}Royal Battalion servers · kills = enemies
            incapacitated
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <InfoTip
            label="Time window"
            text="7D, 30D and 90D show totals for the last 7, 30 or 90 days. All shows your lifetime totals. The charts below always cover the last 90 days."
          />
          <ToggleGroup
            value={[activeWindow]}
            onValueChange={(next) => {
              const key = next[0] as StatWindowKey | undefined;
              if (key) setActiveWindow(key);
            }}
            aria-label="Time window"
          >
            {WINDOWS.map((w) => (
              <ToggleGroupItem key={w.key} value={w.key}>
                {w.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {win && (
        <div className="space-y-5 p-5">
          <StatGroup label="Combat">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="KDR"
                value={win.kdr.toFixed(2)}
                accent
                tip="Kills ÷ deaths. With no deaths yet, this just shows your kill count."
              />
              <StatCard
                label="Kills"
                value={fmtNum(win.kills)}
                tip="Enemies you incapacitated (downed). The down counts even if they're revived afterwards. Teamkills don't count."
              />
              <StatCard
                label="Deaths"
                value={fmtNum(win.deaths)}
                tip="Times you were incapacitated (downed), from any cause."
              />
              <StatCard
                label="Teamkills"
                value={fmtNum(win.teamkills)}
                tip="Friendly players you downed by mistake."
              />
              <StatCard
                label="Revives"
                value={fmtNum(win.revivesGiven)}
                tip="Teammates you revived — counted each time you picked up a downed ally."
              />
              <StatCard
                label="Revived"
                value={fmtNum(win.revivesReceived)}
                tip="Times a teammate picked you up after you went down."
              />
            </div>
          </StatGroup>

          <StatGroup label="Activity">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Playtime"
                value={fmtHours(win.playtimeHours)}
                accent
                tip="Total time connected to our servers, added up across all your sessions."
              />
              <StatCard
                label="Sessions"
                value={fmtNum(win.sessions)}
                tip="How many times you joined and left — one session per connect-to-disconnect."
              />
              <StatCard
                label="Avg Session"
                value={
                  win.avgSessionMinutes >= 60
                    ? `${(win.avgSessionMinutes / 60).toFixed(1)}h`
                    : `${win.avgSessionMinutes}m`
                }
                tip="Your average session length (playtime ÷ sessions)."
              />
              <StatCard
                label="Seed Days"
                value={fmtNum(win.seedDays)}
                tip="Distinct days you helped seed the server, counted once per day."
              />
              <StatCard
                label="Seed Time"
                value={fmtHours(win.seedHours)}
                tip="Time you spent on the server while it was seeding (low population)."
              />
              <StatCard
                label="Vehicles"
                value={fmtNum(win.vehiclesDestroyed)}
                tip="Enemy vehicles you destroyed. Friendly vehicles don't count."
              />
            </div>
          </StatGroup>

          <StatGroup label="Leadership & Objectives">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="SL Time"
                value={fmtHours(win.slHours)}
                tip="Total time you spent leading a squad."
              />
              <StatCard
                label="Rounds as SL"
                value={fmtNum(win.slRounds)}
                tip="Number of rounds in which you led a squad."
              />
              <StatCard
                label="Squads Made"
                value={fmtNum(win.squadsCreated)}
                tip="Squads you created."
              />
              <StatCard
                label="FOB/HAB Hits"
                value={fmtNum(win.fobHabHits)}
                tip="Damage you dealt to enemy FOBs and HABs (their spawn structures)."
              />
            </div>
          </StatGroup>

          <Charts data={chartData} />

          {(records.favoriteWeapon || records.favoriteMap || records.bestRound) && (
            <StatGroup label="Records (all-time)">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Favorite Weapon"
                  tip="The weapon you've gotten the most kills with, all-time."
                  value={
                    records.favoriteWeapon
                      ? prettyWeapon(records.favoriteWeapon.name)
                      : "—"
                  }
                  hint={
                    records.favoriteWeapon
                      ? `${fmtNum(records.favoriteWeapon.kills)} kills`
                      : undefined
                  }
                />
                <StatCard
                  label="Most Played Map"
                  tip="The map you've played the most rounds on, all-time."
                  value={records.favoriteMap ? records.favoriteMap.map : "—"}
                  hint={
                    records.favoriteMap
                      ? `${fmtNum(records.favoriteMap.rounds)} rounds`
                      : undefined
                  }
                />
                <StatCard
                  label="Best Round (kills)"
                  tip="Your highest kill count in a single round, all-time."
                  accent
                  value={
                    records.bestRound
                      ? `${fmtNum(records.bestRound.kills)} kills`
                      : "—"
                  }
                  hint={
                    records.bestRound
                      ? `${records.bestRound.map ?? "Unknown"} · ${new Date(
                          records.bestRound.date,
                        ).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}`
                      : undefined
                  }
                />
              </div>
            </StatGroup>
          )}
        </div>
      )}
    </div>
  );
}

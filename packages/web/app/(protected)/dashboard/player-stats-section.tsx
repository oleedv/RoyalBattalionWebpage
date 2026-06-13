"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getPlayerStats } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { PlayerStats, PlayerStatsWindow, StatWindowKey } from "shared";

/* ── helpers ─────────────────────────────────────────────────────────── */

const ACCENT = "#c8a84e";
const RED = "#ef4444";

const WINDOWS: { key: StatWindowKey; label: string; days: number }[] = [
  { key: "d7", label: "7D", days: 7 },
  { key: "d30", label: "30D", days: 30 },
  { key: "d90", label: "90D", days: 90 },
  { key: "all", label: "All", days: 90 },
];

const fmtHours = (h: number) => (h >= 10 ? `${Math.round(h)}h` : `${h}h`);
const fmtNum = (n: number) => n.toLocaleString("en-US");

function prettyWeapon(raw: string): string {
  return raw
    .replace(/_C$/, "")
    .replace(/^BP_/, "")
    .replace(/_/g, " ")
    .trim();
}

function shortDate(iso: string): string {
  // iso is "YYYY-MM-DD"
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1] ?? ""}`;
}

/* ── small pieces ────────────────────────────────────────────────────── */

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-4">
      <div className="mb-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
        {label}
      </div>
      <div
        className={`font-display text-xl font-bold tracking-wide ${
          accent ? "text-accent" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium tracking-[0.15em] text-text-secondary uppercase">
      {children}
    </div>
  );
}

const tooltipStyle = {
  background: "rgba(18,17,13,0.96)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  fontSize: 12,
  color: "#e7e5e4",
} as const;

/* ── main section ────────────────────────────────────────────────────── */

export default function PlayerStatsSection() {
  const { apiToken } = usePermissions();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeWindow, setActiveWindow] = useState<StatWindowKey>("d30");

  useEffect(() => {
    if (!apiToken) return;
    let cancelled = false;
    async function fetchStats() {
      const res = await getPlayerStats(apiToken!);
      if (!cancelled) {
        if (res.success && res.data) setStats(res.data);
        setLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [apiToken]);

  const win: PlayerStatsWindow | null = stats ? stats.windows[activeWindow] : null;

  const chartData = useMemo(() => {
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
      <div className="facet-border animate-pulse rounded-sm bg-bg-card p-5">
        <div className="mb-4 h-4 w-40 rounded bg-bg-tertiary" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded bg-bg-tertiary" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Not linked → gentle nudge toward the Steam-link form in the profile header above.
  if (!stats.linked) {
    return (
      <div className="facet-border rounded-sm bg-bg-card p-5">
        <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
          My Squad Stats
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Link your Steam ID above to unlock your personal Squad stats — kills, K/D, playtime,
          squad-lead time and more.
        </p>
      </div>
    );
  }

  // Linked but no record on our servers yet.
  if (!stats.hasData) {
    return (
      <div className="facet-border rounded-sm bg-bg-card p-5">
        <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
          My Squad Stats
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          No recorded activity on our servers yet. Jump in-game and your stats will show up here.
        </p>
      </div>
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
        <div className="flex shrink-0 gap-1 rounded-sm bg-bg-tertiary p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setActiveWindow(w.key)}
              className={`rounded-sm px-3 py-1 text-xs font-semibold tracking-wide transition-colors ${
                activeWindow === w.key
                  ? "bg-accent text-bg-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {win && (
        <div className="space-y-5 p-5">
          {/* Combat */}
          <div className="space-y-2">
            <GroupLabel>Combat</GroupLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="KDR" value={win.kdr.toFixed(2)} accent />
              <StatTile label="Kills" value={fmtNum(win.kills)} />
              <StatTile label="Deaths" value={fmtNum(win.deaths)} />
              <StatTile label="Teamkills" value={fmtNum(win.teamkills)} />
              <StatTile label="Revives" value={fmtNum(win.revivesGiven)} />
              <StatTile label="Revived" value={fmtNum(win.revivesReceived)} />
            </div>
          </div>

          {/* Activity */}
          <div className="space-y-2">
            <GroupLabel>Activity</GroupLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Playtime" value={fmtHours(win.playtimeHours)} accent />
              <StatTile label="Sessions" value={fmtNum(win.sessions)} />
              <StatTile
                label="Avg Session"
                value={win.avgSessionMinutes >= 60
                  ? `${(win.avgSessionMinutes / 60).toFixed(1)}h`
                  : `${win.avgSessionMinutes}m`}
              />
              <StatTile label="Seed Days" value={fmtNum(win.seedDays)} />
              <StatTile label="Seed Time" value={fmtHours(win.seedHours)} />
              <StatTile label="Vehicles" value={fmtNum(win.vehiclesDestroyed)} />
            </div>
          </div>

          {/* Leadership & objectives */}
          <div className="space-y-2">
            <GroupLabel>Leadership &amp; Objectives</GroupLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="SL Time" value={fmtHours(win.slHours)} />
              <StatTile label="Rounds as SL" value={fmtNum(win.slRounds)} />
              <StatTile label="Squads Made" value={fmtNum(win.squadsCreated)} />
              <StatTile label="FOB/HAB Hits" value={fmtNum(win.fobHabHits)} />
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="facet-border rounded-sm bg-bg-card p-4">
              <div className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                Playtime / day (hrs)
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ptFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#8a8780" }}
                    minTickGap={24}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#8a8780" }}
                    width={32}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a8a29e" }} />
                  <Area
                    type="monotone"
                    dataKey="playtime"
                    name="Hours"
                    stroke={ACCENT}
                    strokeWidth={2}
                    fill="url(#ptFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="facet-border rounded-sm bg-bg-card p-4">
              <div className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                Kills vs Deaths / day
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#8a8780" }}
                    minTickGap={24}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#8a8780" }}
                    width={32}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a8a29e" }} />
                  <Line type="monotone" dataKey="kills" name="Kills" stroke={ACCENT} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="deaths" name="Deaths" stroke={RED} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Records */}
          {(records.favoriteWeapon || records.favoriteMap || records.bestRound) && (
            <div className="space-y-2">
              <GroupLabel>Records (all-time)</GroupLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="facet-border rounded-sm bg-bg-card p-4">
                  <div className="mb-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
                    Favorite Weapon
                  </div>
                  {records.favoriteWeapon ? (
                    <>
                      <div className="font-display text-base font-bold text-text-primary">
                        {prettyWeapon(records.favoriteWeapon.name)}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {fmtNum(records.favoriteWeapon.kills)} kills
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-text-muted">—</div>
                  )}
                </div>
                <div className="facet-border rounded-sm bg-bg-card p-4">
                  <div className="mb-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
                    Most Played Map
                  </div>
                  {records.favoriteMap ? (
                    <>
                      <div className="font-display text-base font-bold text-text-primary">
                        {records.favoriteMap.map}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {fmtNum(records.favoriteMap.rounds)} rounds
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-text-muted">—</div>
                  )}
                </div>
                <div className="facet-border rounded-sm bg-bg-card p-4">
                  <div className="mb-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
                    Best Round (kills)
                  </div>
                  {records.bestRound ? (
                    <>
                      <div className="font-display text-base font-bold text-accent">
                        {fmtNum(records.bestRound.kills)} kills
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {records.bestRound.map ?? "Unknown"} ·{" "}
                        {new Date(records.bestRound.date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-text-muted">—</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

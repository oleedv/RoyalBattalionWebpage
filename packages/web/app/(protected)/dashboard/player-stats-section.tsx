"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { formatDateCompact, formatNumber } from "@/lib/format";
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
const fmtNum = (n: number) => formatNumber(n);

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

/**
 * Small "i" info tooltip. Opens on hover + focus + tap (so it works on touch and
 * for keyboard users), closes on outside-click / Escape / blur. Themed to match the
 * dashboard; the popover floats above the icon and overrides the label's
 * uppercase/tracking styling so the explanation reads as normal prose.
 */
function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label} — what's this?`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex items-center justify-center rounded-full text-text-muted/60 transition-colors hover:text-accent focus-visible:text-accent focus:outline-none"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-sm border border-white/10 bg-[rgba(18,17,13,0.97)] px-2.5 py-1.5 text-[11px] leading-snug font-normal normal-case tracking-normal text-text-secondary shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
  tip,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  tip?: string;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-4">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
        <span>{label}</span>
        {tip && <InfoTip text={tip} label={label} />}
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
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-text-muted">
            <InfoTip
              label="Time window"
              text="7D, 30D and 90D show totals for the last 7, 30 or 90 days. All shows your lifetime totals. The charts below always cover the last 90 days."
            />
          </span>
          <div className="flex gap-1 rounded-sm bg-bg-tertiary p-1">
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
      </div>

      {win && (
        <div className="space-y-5 p-5">
          {/* Combat */}
          <div className="space-y-2">
            <GroupLabel>Combat</GroupLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile
                label="KDR"
                value={win.kdr.toFixed(2)}
                accent
                tip="Kills ÷ deaths. With no deaths yet, this just shows your kill count."
              />
              <StatTile
                label="Kills"
                value={fmtNum(win.kills)}
                tip="Enemies you incapacitated (downed). The down counts even if they're revived afterwards. Teamkills don't count."
              />
              <StatTile
                label="Deaths"
                value={fmtNum(win.deaths)}
                tip="Times you were incapacitated (downed), from any cause."
              />
              <StatTile
                label="Teamkills"
                value={fmtNum(win.teamkills)}
                tip="Friendly players you downed by mistake."
              />
              <StatTile
                label="Revives"
                value={fmtNum(win.revivesGiven)}
                tip="Teammates you revived — counted each time you picked up a downed ally."
              />
              <StatTile
                label="Revived"
                value={fmtNum(win.revivesReceived)}
                tip="Times a teammate picked you up after you went down."
              />
            </div>
          </div>

          {/* Activity */}
          <div className="space-y-2">
            <GroupLabel>Activity</GroupLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile
                label="Playtime"
                value={fmtHours(win.playtimeHours)}
                accent
                tip="Total time connected to our servers, added up across all your sessions."
              />
              <StatTile
                label="Sessions"
                value={fmtNum(win.sessions)}
                tip="How many times you joined and left — one session per connect-to-disconnect."
              />
              <StatTile
                label="Avg Session"
                value={win.avgSessionMinutes >= 60
                  ? `${(win.avgSessionMinutes / 60).toFixed(1)}h`
                  : `${win.avgSessionMinutes}m`}
                tip="Your average session length (playtime ÷ sessions)."
              />
              <StatTile
                label="Seed Days"
                value={fmtNum(win.seedDays)}
                tip="Distinct days you helped seed the server, counted once per day."
              />
              <StatTile
                label="Seed Time"
                value={fmtHours(win.seedHours)}
                tip="Time you spent on the server while it was seeding (low population)."
              />
              <StatTile
                label="Vehicles"
                value={fmtNum(win.vehiclesDestroyed)}
                tip="Enemy vehicles you destroyed. Friendly vehicles don't count."
              />
            </div>
          </div>

          {/* Leadership & objectives */}
          <div className="space-y-2">
            <GroupLabel>Leadership &amp; Objectives</GroupLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile
                label="SL Time"
                value={fmtHours(win.slHours)}
                tip="Total time you spent leading a squad."
              />
              <StatTile
                label="Rounds as SL"
                value={fmtNum(win.slRounds)}
                tip="Number of rounds in which you led a squad."
              />
              <StatTile
                label="Squads Made"
                value={fmtNum(win.squadsCreated)}
                tip="Squads you created."
              />
              <StatTile
                label="FOB/HAB Hits"
                value={fmtNum(win.fobHabHits)}
                tip="Damage you dealt to enemy FOBs and HABs (their spawn structures)."
              />
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
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
                    <span>Favorite Weapon</span>
                    <InfoTip
                      label="Favorite Weapon"
                      text="The weapon you've gotten the most kills with, all-time."
                    />
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
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
                    <span>Most Played Map</span>
                    <InfoTip
                      label="Most Played Map"
                      text="The map you've played the most rounds on, all-time."
                    />
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
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
                    <span>Best Round (kills)</span>
                    <InfoTip
                      label="Best Round"
                      text="Your highest kill count in a single round, all-time."
                    />
                  </div>
                  {records.bestRound ? (
                    <>
                      <div className="font-display text-base font-bold text-accent">
                        {fmtNum(records.bestRound.kills)} kills
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {records.bestRound.map ?? "Unknown"} ·{" "}
                        {formatDateCompact(records.bestRound.date)}
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

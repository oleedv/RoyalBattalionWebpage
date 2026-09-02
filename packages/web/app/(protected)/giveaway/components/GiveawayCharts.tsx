"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { GiveawaySnapshot, GiveawayHistoryItem } from "shared";
import {
  cumulativeByDay,
  ticketHistogram,
  topMakeup,
  historyBars,
} from "@/lib/giveaway-charts";

const GOLD = "#c8a84e";
const GREEN = "#22c55e";
const BLUE = "#5865F2";

function ChartCard({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="mb-3 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
        {title}
      </div>
      {empty ? (
        <div className="flex h-40 items-center justify-center text-sm text-text-muted">
          No data yet
        </div>
      ) : (
        <div className="h-48">{children}</div>
      )}
    </div>
  );
}

function tooltipStyle(): CSSProperties {
  return {
    background: "#16161b",
    border: "1px solid #222228",
    borderRadius: 2,
    fontSize: 12,
  };
}

export function GiveawayCharts({
  snapshot,
  history,
  displayName,
}: {
  snapshot: GiveawaySnapshot | null;
  history: GiveawayHistoryItem[];
  displayName: (id: string) => string;
}) {
  const entriesOverTime = snapshot
    ? cumulativeByDay(snapshot.leaderboard.map((r) => r.enteredAt).filter((x): x is string => Boolean(x)))
    : [];
  const dist = snapshot ? ticketHistogram(snapshot.leaderboard.map((r) => r.tickets)) : [];
  const makeup = snapshot
    ? topMakeup(snapshot.leaderboard.slice(0, 10), {
        hours: snapshot.giveaway.hoursWeight,
        seed: snapshot.giveaway.seedWeight,
        vote: snapshot.giveaway.voteWeight,
      }).map((r) => ({ ...r, name: displayName(r.userId) }))
    : [];
  const votesOverTime =
    snapshot && (snapshot.giveaway.status === "voting" || snapshot.giveaway.status === "drawn")
      ? cumulativeByDay(snapshot.votes.map((v) => v.createdAt))
      : [];
  const hist = historyBars(
    [...history].reverse().map((h) => ({
      monthLabel: h.monthLabel,
      entryCount: h.entryCount,
      winnerTickets: null,
    })),
  );

  const showVotes =
    snapshot &&
    (snapshot.giveaway.status === "voting" || snapshot.giveaway.status === "drawn") &&
    votesOverTime.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Entries over time" empty={entriesOverTime.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={entriesOverTime}>
            <CartesianGrid stroke="#222228" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#555558", fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fill: "#555558", fontSize: 10 }} />
            <Tooltip contentStyle={tooltipStyle()} />
            <Area type="monotone" dataKey="count" stroke={GOLD} fill={`${GOLD}33`} name="Entries" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Ticket distribution" empty={dist.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dist}>
            <CartesianGrid stroke="#222228" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: "#555558", fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fill: "#555558", fontSize: 10 }} />
            <Tooltip contentStyle={tooltipStyle()} />
            <Bar dataKey="count" fill={GOLD} name="Entrants" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Top 10 ticket makeup" empty={makeup.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={makeup} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid stroke="#222228" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#555558", fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fill: "#9a9a98", fontSize: 10 }}
            />
            <Tooltip contentStyle={tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="played" stackId="a" fill={GOLD} name="Played" />
            <Bar dataKey="seed" stackId="a" fill={GREEN} name="Seed" />
            <Bar dataKey="votes" stackId="a" fill={BLUE} name="Votes" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {showVotes ? (
        <ChartCard title="Votes over time" empty={votesOverTime.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={votesOverTime}>
              <CartesianGrid stroke="#222228" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#555558", fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#555558", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle()} />
              <Area type="monotone" dataKey="count" stroke={BLUE} fill={`${BLUE}33`} name="Votes" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : (
        <ChartCard title="History" empty={hist.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hist}>
              <CartesianGrid stroke="#222228" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#555558", fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#555558", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle()} />
              <Bar dataKey="entries" fill={GOLD} name="Entries" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {showVotes && hist.length > 0 && (
        <div className="lg:col-span-2">
          <ChartCard title="History" empty={hist.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist}>
                <CartesianGrid stroke="#222228" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#555558", fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#555558", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Bar dataKey="entries" fill={GOLD} name="Entries" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

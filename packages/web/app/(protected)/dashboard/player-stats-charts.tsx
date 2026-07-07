"use client";

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
import { useChartTokens } from "@/lib/chart-tokens";

export interface ChartPoint {
  date: string;
  kills: number;
  deaths: number;
  playtime: number;
}

/**
 * Dashboard personal-stats charts, themed through the chart-token bridge so
 * both themes render correctly. recharts animations are disabled per the
 * design spec's motion rules.
 */
export function PlayerStatsCharts({ data }: { data: ChartPoint[] }) {
  const t = useChartTokens();
  const axisTick = { fontSize: 10, fill: t.axis } as const;
  const tooltipStyle = {
    background: t.tooltip.bg,
    border: `1px solid ${t.tooltip.border}`,
    borderRadius: 4,
    fontSize: 12,
    color: t.tooltip.text,
  } as const;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="facet-border rounded-sm bg-bg-card p-4">
        <div className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
          Playtime / day (hrs)
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="ptFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={axisTick}
              minTickGap={24}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisTick}
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: t.axis }} />
            <Area
              type="monotone"
              dataKey="playtime"
              name="Hours"
              stroke={t.accent}
              strokeWidth={2}
              fill="url(#ptFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="facet-border rounded-sm bg-bg-card p-4">
        <div className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
          Kills vs Deaths / day
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={axisTick}
              minTickGap={24}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisTick}
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: t.axis }} />
            <Line
              type="monotone"
              dataKey="kills"
              name="Kills"
              stroke={t.accent}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="deaths"
              name="Deaths"
              stroke={t.danger}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

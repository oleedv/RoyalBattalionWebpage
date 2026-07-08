"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useChartTokens } from "@/lib/chart-tokens";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function toWeekdayData(data: number[]): { day: string; value: number }[] {
  return data.map((value, i) => ({ day: DAYS[i] ?? String(i), value }));
}

export function WeekdayChart({ data }: { data: number[] }) {
  const t = useChartTokens();
  const axisTick = { fontSize: 10, fill: t.axis } as const;
  const chartData = toWeekdayData(data);

  return (
    <div className="rounded-sm border border-border bg-bg-card p-5">
      <div className="mb-3 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
        Day of Week
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={axisTick}
            width={28}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: t.tooltip.bg,
              border: `1px solid ${t.tooltip.border}`,
              borderRadius: 4,
              fontSize: 12,
              color: t.tooltip.text,
            }}
            labelStyle={{ color: t.axis }}
          />
          <Bar dataKey="value" fill={t.accent} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

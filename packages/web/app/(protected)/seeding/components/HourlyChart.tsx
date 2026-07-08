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

export function toHourlyData(data: number[]): { hour: number; value: number }[] {
  return data.map((value, hour) => ({ hour, value }));
}

export function HourlyChart({ data }: { data: number[] }) {
  const t = useChartTokens();
  const axisTick = { fontSize: 10, fill: t.axis } as const;
  const chartData = toHourlyData(data);

  return (
    <div className="rounded-sm border border-border bg-bg-card p-5">
      <div className="mb-3 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
        Time of Day
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="hour"
            tick={axisTick}
            ticks={[0, 6, 12, 18, 23]}
            tickFormatter={(v) => `${String(v).padStart(2, "0")}:00`}
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

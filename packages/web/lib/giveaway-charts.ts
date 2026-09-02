import type { TicketWeights } from "shared";

export interface DayCount {
  date: string;
  count: number;
}

export interface HistogramBin {
  bucket: string;
  count: number;
}

export interface MakeupRow {
  userId: string;
  played: number;
  seed: number;
  votes: number;
}

export interface HistoryBar {
  month: string;
  entries: number;
  winnerTickets: number;
}

function utcDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function cumulativeByDay(timestamps: string[]): DayCount[] {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const day = utcDay(ts);
    if (!day) continue;
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  const days = [...counts.keys()].sort();
  let running = 0;
  return days.map((date) => {
    running += counts.get(date) || 0;
    return { date, count: running };
  });
}

export function ticketHistogram(tickets: number[]): HistogramBin[] {
  if (tickets.length === 0) return [];
  const max = Math.max(0, ...tickets);
  const bucketSize = max <= 20 ? 1 : Math.max(1, Math.ceil(max / 12));
  const binCount = Math.floor(max / bucketSize) + 1;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const start = i * bucketSize;
    const end = start + bucketSize - 1;
    const bucket = bucketSize === 1 ? String(start) : `${start}–${end}`;
    bins.push({ bucket, count: 0 });
  }
  for (const t of tickets) {
    const idx = Math.min(binCount - 1, Math.floor(Math.max(0, t) / bucketSize));
    bins[idx].count += 1;
  }
  return bins;
}

export function topMakeup(
  rows: Array<{ userId: string; hours: number; seed: number; votes: number }>,
  weights: TicketWeights,
): MakeupRow[] {
  return rows.map((r) => ({
    userId: r.userId,
    played: r.hours * weights.hours,
    seed: r.seed * weights.seed,
    votes: r.votes * weights.vote,
  }));
}

export function historyBars(
  rows: Array<{ monthLabel: string; entryCount: number; winnerTickets: number | null }>,
): HistoryBar[] {
  return rows.map((r) => ({
    month: r.monthLabel,
    entries: r.entryCount,
    winnerTickets: r.winnerTickets ?? 0,
  }));
}

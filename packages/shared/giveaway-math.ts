export interface TicketWeights {
  hours: number;
  seed: number;
  vote: number;
}

export interface TicketEntryHours {
  manualHours: number | null;
  manualSeed: number | null;
}

export interface LivePlaytime {
  playtimeHours: number;
  seedHours: number;
}

export function computeTickets(
  entry: TicketEntryHours,
  live: LivePlaytime | null,
  votes: number,
  weights: TicketWeights,
): number {
  const hours =
    entry.manualHours != null ? Number(entry.manualHours) : Number(live?.playtimeHours ?? 0);
  const seed =
    entry.manualSeed != null ? Number(entry.manualSeed) : Number(live?.seedHours ?? 0);
  const raw = hours * weights.hours + seed * weights.seed + votes * weights.vote;
  return Math.floor(raw);
}

export function windowStartIso(windowDays: number, nowMs: number = Date.now()): string {
  const d = new Date(nowMs - windowDays * 86400000);
  return d.toISOString().slice(0, 10);
}

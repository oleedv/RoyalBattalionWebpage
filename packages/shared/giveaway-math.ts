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
  bonus: number = 0,
): number {
  const hours =
    entry.manualHours != null ? Number(entry.manualHours) : Number(live?.playtimeHours ?? 0);
  const seed =
    entry.manualSeed != null ? Number(entry.manualSeed) : Number(live?.seedHours ?? 0);
  const raw = hours * weights.hours + seed * weights.seed + votes * weights.vote;
  const earned = Math.floor(raw);
  const extra = Number.isFinite(bonus) ? Math.trunc(bonus) : 0;
  return Math.max(0, earned + extra);
}

/** Next stored bonus after giving (`delta` > 0) or taking (`delta` < 0) tickets. */
export function nextTicketBonus(earned: number, bonus: number, delta: number): number {
  const current = Math.max(0, earned + bonus);
  let applied = Math.trunc(delta);
  if (applied < 0 && -applied > current) applied = -current;
  return bonus + applied;
}

export function windowStartIso(windowDays: number, nowMs: number = Date.now()): string {
  const d = new Date(nowMs - windowDays * 86400000);
  return d.toISOString().slice(0, 10);
}

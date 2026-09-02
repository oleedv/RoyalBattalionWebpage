/** How long a dismissed whitelist request stays hidden. */
export const WHITELIST_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Cap on the eligible-user query. Hitting it means the list may be incomplete. */
export const WHITELIST_CANDIDATE_QUERY_LIMIT = 1000;

export type EligibleCandidate = {
  userId: string;
  steamId: string;
};

export type SteamOnServer = {
  steamId: string;
  server: string;
};

export type DismissalOnServer = {
  userId: string;
  server: string;
};

export type CandidatePartition<T extends EligibleCandidate = EligibleCandidate> = {
  pending: T[];
  dismissed: T[];
  alreadyWhitelisted: T[];
};

export type ServerPendingCount = {
  server: string;
  pending: number;
};

export function isActiveWhitelistEntry(
  entry: { deactivatedAt: Date | null; expiresAt: Date | null },
  now: Date,
): boolean {
  if (entry.deactivatedAt) return false;
  if (entry.expiresAt && entry.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function isActiveDismissal(
  dismissal: { expiresAt: Date; restoredAt: Date | null },
  now: Date,
): boolean {
  if (dismissal.restoredAt) return false;
  return dismissal.expiresAt.getTime() > now.getTime();
}

export function dismissExpiresAt(
  from: Date,
  ttlMs: number = WHITELIST_DISMISS_TTL_MS,
): Date {
  return new Date(from.getTime() + ttlMs);
}

export function remainingDismissMs(expiresAt: Date, now: Date): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/** Whole days remaining, rounded up. 0 once expired. */
export function remainingDismissDays(expiresAt: Date | string, now: Date): number {
  const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const ms = remainingDismissMs(exp, now);
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

export function formatDismissRemaining(expiresAt: Date | string, now: Date): string {
  const days = remainingDismissDays(expiresAt, now);
  if (days <= 0) return "expired";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function partitionCandidatesForServer<T extends EligibleCandidate>(
  eligible: T[],
  server: string,
  activeEntries: SteamOnServer[],
  dismissals: DismissalOnServer[],
): CandidatePartition<T> {
  const activeSteam = new Set(
    activeEntries.filter((e) => e.server === server).map((e) => e.steamId),
  );
  const dismissedIds = new Set(
    dismissals.filter((d) => d.server === server).map((d) => d.userId),
  );

  const pending: T[] = [];
  const dismissed: T[] = [];
  const alreadyWhitelisted: T[] = [];

  for (const user of eligible) {
    if (activeSteam.has(user.steamId)) {
      alreadyWhitelisted.push(user);
    } else if (dismissedIds.has(user.userId)) {
      dismissed.push(user);
    } else {
      pending.push(user);
    }
  }

  return { pending, dismissed, alreadyWhitelisted };
}

export function pendingCountsByServer(
  eligible: EligibleCandidate[],
  servers: string[],
  activeEntries: SteamOnServer[],
  dismissals: DismissalOnServer[],
): ServerPendingCount[] {
  return servers.map((server) => ({
    server,
    pending: partitionCandidatesForServer(eligible, server, activeEntries, dismissals).pending.length,
  }));
}

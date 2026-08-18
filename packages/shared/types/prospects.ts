export interface ProspectConfig {
  voteStartHours: number;
  voteAcceptHours: number;
  periodDays: number;
  cooldownDays: number;
  minYesVotes: number;
  /** Yes / (yes + no). Stored 0–1. */
  minYesRate: number;
}

export interface ProspectCooldown {
  id: number;
  userId: string;
  expiresAt: string;
  createdBy: string;
  reason: string | null;
  prospectId: number | null;
  createdAt: string;
}

export const DEFAULT_PROSPECT_CONFIG: ProspectConfig = {
  voteStartHours: 6,
  voteAcceptHours: 16,
  periodDays: 28,
  cooldownDays: 28,
  minYesVotes: 10,
  minYesRate: 0.8,
};

export type VotePair = { yes: number; no: number };

export function voteVerdictExamples(
  minYesVotes: number,
  minYesRate: number,
): { pass: VotePair; failCount: VotePair | null; failShare: VotePair } {
  const yes = Math.max(1, Math.floor(minYesVotes));
  const rate = minYesRate;
  const passNo = Math.max(0, Math.floor((yes * (1 - rate)) / rate));
  const failCount = yes > 1 ? { yes: yes - 1, no: 1 } : null;

  // Spec lock: defaults illustrate a clean 75% miss with 12–4.
  const failShare =
    yes === 10 && rate === 0.8
      ? { yes: 12, no: 4 }
      : { yes, no: Math.floor((yes * (1 - rate)) / rate) + 1 };

  return { pass: { yes, no: passNo }, failCount, failShare };
}

export function formatVoteVerdict(minYesVotes: number, minYesRate: number): string {
  const ex = voteVerdictExamples(minYesVotes, minYesRate);
  const parts = [`A ${ex.pass.yes}–${ex.pass.no} vote passes.`];
  if (ex.failCount) {
    parts.push(
      `A ${ex.failCount.yes}–${ex.failCount.no} vote fails (need ${minYesVotes} yes).`,
    );
  }
  const shareTotal = ex.failShare.yes + ex.failShare.no;
  const sharePct = shareTotal > 0 ? Math.round((ex.failShare.yes / shareTotal) * 100) : 0;
  const needPct = Math.round(minYesRate * 100);
  parts.push(
    `A ${ex.failShare.yes}–${ex.failShare.no} vote fails (${sharePct}% < ${needPct}%).`,
  );
  return parts.join(" ");
}

export type ProspectConfigPatchResult =
  | { ok: true; value: ProspectConfig }
  | { ok: false; error: string };

function asInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return fallback;
}

function asRate(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

export function validateProspectConfigPatch(
  input: Partial<ProspectConfig>,
  current: ProspectConfig = DEFAULT_PROSPECT_CONFIG,
): ProspectConfigPatchResult {
  const value: ProspectConfig = {
    voteStartHours: asInt(input.voteStartHours, current.voteStartHours),
    voteAcceptHours: asInt(input.voteAcceptHours, current.voteAcceptHours),
    periodDays: asInt(input.periodDays, current.periodDays),
    cooldownDays: asInt(input.cooldownDays, current.cooldownDays),
    minYesVotes: asInt(input.minYesVotes, current.minYesVotes),
    minYesRate: asRate(input.minYesRate, current.minYesRate),
  };

  if (value.voteStartHours < 0 || value.voteAcceptHours < 0) {
    return { ok: false, error: "Hours must be 0 or greater" };
  }
  if (value.voteStartHours > value.voteAcceptHours) {
    return { ok: false, error: "Hours to start vote cannot be above hours to accept" };
  }
  if (value.periodDays < 1 || value.cooldownDays < 1) {
    return { ok: false, error: "Day values must be at least 1" };
  }
  if (value.minYesVotes < 1) {
    return { ok: false, error: "Minimum yes votes must be at least 1" };
  }
  if (value.minYesRate < 0.01 || value.minYesRate > 1) {
    return { ok: false, error: "Yes share must be between 1% and 100%" };
  }

  return { ok: true, value };
}

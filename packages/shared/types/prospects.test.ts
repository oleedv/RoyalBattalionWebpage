import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PROSPECT_CONFIG,
  formatVoteVerdict,
  validateProspectConfigPatch,
  voteVerdictExamples,
} from "./prospects";

describe("voteVerdictExamples", () => {
  test("defaults produce 10-2 pass, 9-1 fail-count, 12-4 fail-share", () => {
    const ex = voteVerdictExamples(10, 0.8);
    expect(ex.pass).toEqual({ yes: 10, no: 2 });
    expect(ex.failCount).toEqual({ yes: 9, no: 1 });
    expect(ex.failShare).toEqual({ yes: 12, no: 4 });
  });

  test("omits fail-by-count when min yes is 1", () => {
    const ex = voteVerdictExamples(1, 0.5);
    expect(ex.failCount).toBeNull();
    expect(ex.pass.yes).toBe(1);
    expect(ex.failShare.yes).toBe(1);
    expect(ex.failShare.no).toBeGreaterThan(ex.pass.no);
  });
});

describe("formatVoteVerdict", () => {
  test("default copy matches the spec sentence", () => {
    expect(formatVoteVerdict(10, 0.8)).toBe(
      "A 10–2 vote passes. A 9–1 vote fails (need 10 yes). A 12–4 vote fails (75% < 80%).",
    );
  });
});

describe("validateProspectConfigPatch", () => {
  test("accepts a full valid patch", () => {
    const result = validateProspectConfigPatch({
      voteStartHours: 6,
      voteAcceptHours: 16,
      periodDays: 28,
      cooldownDays: 28,
      minYesVotes: 10,
      minYesRate: 0.8,
    });
    expect(result.ok).toBe(true);
  });

  test("rejects start hours above accept hours", () => {
    const result = validateProspectConfigPatch({
      ...DEFAULT_PROSPECT_CONFIG,
      voteStartHours: 20,
      voteAcceptHours: 16,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot be above/i);
  });

  test("rejects yes-share outside 0.01–1", () => {
    const high = validateProspectConfigPatch({
      ...DEFAULT_PROSPECT_CONFIG,
      minYesRate: 1.2,
    });
    expect(high.ok).toBe(false);
    const zero = validateProspectConfigPatch({
      ...DEFAULT_PROSPECT_CONFIG,
      minYesRate: 0,
    });
    expect(zero.ok).toBe(false);
  });
});

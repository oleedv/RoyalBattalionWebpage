import { describe, test, expect } from "bun:test";
import {
  DISCORD_MESSAGE_LIMIT,
  buildProgressCopy,
  buildVoteReminderCopy,
  buildWinnerCopy,
} from "./giveaway-copy";

const base = {
  prize: "Helldivers 2",
  monthLabel: "May 2026",
  drawAt: "2026-05-31T23:59:59.000Z",
  entries: 42,
  totalTickets: 1280,
  votesCast: 18,
  votesPerVoter: 2,
  voteWeight: 5,
  top: [
    { userId: "111", tickets: 86, hours: 40, seed: 12, votes: 2 },
    { userId: "222", tickets: 71, hours: 50, seed: 8, votes: 1 },
  ],
};

describe("giveaway discord copy", () => {
  test("progress copy mentions prize, counts, and leaders with mentions", () => {
    const text = buildProgressCopy(base);
    expect(text).toContain("May 2026");
    expect(text).toContain("Helldivers 2");
    expect(text).toContain("42");
    expect(text).toContain("1,280");
    expect(text).toContain("<@111>");
    expect(text).toContain("86");
    expect(text.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
  });

  test("vote reminder copy includes vote rules and leaders", () => {
    const text = buildVoteReminderCopy(base);
    expect(text).toContain("vote");
    expect(text).toMatch(/2/);
    expect(text).toContain("+5");
    expect(text).toContain("<@222>");
    expect(text.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
  });

  test("winner copy requires a winner and lists top 5", () => {
    const text = buildWinnerCopy({
      ...base,
      winnerUserId: "111",
      winnerTickets: 86,
    });
    expect(text).toContain("Winner");
    expect(text).toContain("<@111>");
    expect(text).toContain("86");
    expect(text).toContain("Top");
    expect(text.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
  });

  test("winner copy returns empty string without a winner", () => {
    expect(buildWinnerCopy(base)).toBe("");
  });

  test("truncates oversized leaderboards to the discord limit", () => {
    const top = Array.from({ length: 200 }, (_, i) => ({
      userId: String(100000000000000000n + BigInt(i)),
      tickets: 9999,
      hours: 100,
      seed: 50,
      votes: 2,
    }));
    const text = buildProgressCopy({ ...base, top }, 200);
    expect(text.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
    expect(text).toContain("truncated");
  });
});

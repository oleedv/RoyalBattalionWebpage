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
    { userId: "111", displayName: "Onion", tickets: 86, hours: 40, seed: 12, votes: 2 },
    { userId: "222", displayName: "Bonnie", tickets: 71, hours: 50, seed: 8, votes: 1 },
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

  test("leader lines include display name then mention", () => {
    const text = buildProgressCopy(base);
    expect(text).toContain("1. Onion <@111> — 86 (40h + 12h seed + 2 votes)");
    expect(text).toContain("2. Bonnie <@222> — 71 (50h + 8h seed + 1 votes)");
  });

  test("leader lines omit display name when it is missing or just the id", () => {
    const text = buildProgressCopy({
      ...base,
      top: [
        { userId: "498477645412171777", tickets: 99, hours: 65, seed: 17.1, votes: 0 },
        { userId: "111", displayName: "111", tickets: 1, hours: 1, seed: 0, votes: 0 },
      ],
    });
    expect(text).toContain("1. <@498477645412171777> — 99 (65h + 17.1h seed + 0 votes)");
    expect(text).toContain("2. <@111> — 1 (1h + 0h seed + 0 votes)");
    expect(text).not.toContain("498477645412171777 <@");
  });

  test("respects a custom top-N limit", () => {
    const top = [
      { userId: "1", displayName: "A", tickets: 10, hours: 10, seed: 0, votes: 0 },
      { userId: "2", displayName: "B", tickets: 9, hours: 9, seed: 0, votes: 0 },
      { userId: "3", displayName: "C", tickets: 8, hours: 8, seed: 0, votes: 0 },
    ];
    const text = buildProgressCopy({ ...base, top }, 2);
    expect(text).toContain("<@1>");
    expect(text).toContain("<@2>");
    expect(text).not.toContain("<@3>");
  });

  test("vote reminder copy includes vote rules and leaders", () => {
    const text = buildVoteReminderCopy(base);
    expect(text).toContain("vote");
    expect(text).toMatch(/2/);
    expect(text).toContain("+5");
    expect(text).toContain("<@222>");
    expect(text.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
  });

  test("winner copy requires a winner and lists the chosen top N", () => {
    const text = buildWinnerCopy({
      ...base,
      winnerUserId: "111",
      winnerTickets: 86,
    }, 10);
    expect(text).toContain("Winner");
    expect(text).toContain("Onion <@111>");
    expect(text).toContain("86");
    expect(text).toContain("Top 10");
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

import { describe, test, expect } from "bun:test";
import { computeTickets, windowStartIso } from "./giveaway-math";

describe("computeTickets", () => {
  test("uses manual hours when entry is a manual entry", () => {
    expect(
      computeTickets(
        { manualHours: 50, manualSeed: 10 },
        null,
        0,
        { hours: 1, seed: 2, vote: 1 },
      ),
    ).toBe(70);
  });

  test("uses live SquadJS hours when entry is linked", () => {
    expect(
      computeTickets(
        { manualHours: null, manualSeed: null },
        { playtimeHours: 200, seedHours: 15 },
        3,
        { hours: 1, seed: 2, vote: 1 },
      ),
    ).toBe(233);
  });

  test("floors fractional totals", () => {
    expect(
      computeTickets(
        { manualHours: null, manualSeed: null },
        { playtimeHours: 5.7, seedHours: 1.4 },
        0,
        { hours: 1, seed: 2, vote: 1 },
      ),
    ).toBe(8);
  });

  test("returns 0 when entry has no hours and no votes", () => {
    expect(
      computeTickets(
        { manualHours: null, manualSeed: null },
        { playtimeHours: 0, seedHours: 0 },
        0,
        { hours: 1, seed: 2, vote: 1 },
      ),
    ).toBe(0);
  });
});

describe("windowStartIso", () => {
  test("returns YYYY-MM-DD for a date 30 days before the given instant", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    expect(windowStartIso(30, now)).toBe("2026-05-16");
  });
});

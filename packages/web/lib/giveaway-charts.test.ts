import { describe, test, expect } from "bun:test";
import {
  cumulativeByDay,
  ticketHistogram,
  topMakeup,
  historyBars,
} from "./giveaway-charts";

describe("cumulativeByDay", () => {
  test("builds a running total grouped by UTC day", () => {
    const points = cumulativeByDay([
      "2026-05-02T10:00:00.000Z",
      "2026-05-02T18:00:00.000Z",
      "2026-05-04T01:00:00.000Z",
    ]);
    expect(points).toEqual([
      { date: "2026-05-02", count: 2 },
      { date: "2026-05-04", count: 3 },
    ]);
  });

  test("returns empty for no timestamps", () => {
    expect(cumulativeByDay([])).toEqual([]);
  });
});

describe("ticketHistogram", () => {
  test("uses bucket size 1 when the max is small", () => {
    const bins = ticketHistogram([0, 1, 1, 3]);
    expect(bins.find((b) => b.bucket === "1")?.count).toBe(2);
    expect(bins.find((b) => b.bucket === "3")?.count).toBe(1);
  });

  test("groups into wider buckets when the max is large", () => {
    const bins = ticketHistogram([1, 50, 99]);
    expect(bins.length).toBeGreaterThan(0);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe("topMakeup", () => {
  test("splits ticket contributions by played, seed, and votes", () => {
    const rows = topMakeup(
      [{ userId: "1", hours: 10, seed: 5, votes: 2 }],
      { hours: 1, seed: 2, vote: 5 },
    );
    expect(rows[0]).toEqual({
      userId: "1",
      played: 10,
      seed: 10,
      votes: 10,
    });
  });
});

describe("historyBars", () => {
  test("maps past giveaways to chart rows", () => {
    expect(
      historyBars([
        { monthLabel: "May 2026", entryCount: 42, winnerTickets: 86 },
        { monthLabel: "Apr 2026", entryCount: 30, winnerTickets: null },
      ]),
    ).toEqual([
      { month: "May 2026", entries: 42, winnerTickets: 86 },
      { month: "Apr 2026", entries: 30, winnerTickets: 0 },
    ]);
  });
});

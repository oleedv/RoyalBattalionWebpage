import { test, expect } from "bun:test";
import { formatMatchDuration, matchElapsedSeconds } from "./format-match-duration";

test("null or invalid is unknown", () => {
  expect(formatMatchDuration(null)).toBe("unknown");
  expect(formatMatchDuration(undefined)).toBe("unknown");
  expect(formatMatchDuration(-4)).toBe("unknown");
  expect(formatMatchDuration(Number.NaN)).toBe("unknown");
});

test("under a minute is seconds only", () => {
  expect(formatMatchDuration(0)).toBe("0s");
  expect(formatMatchDuration(9)).toBe("9s");
});

test("minutes and seconds", () => {
  expect(formatMatchDuration(75)).toBe("1m 15s");
  expect(formatMatchDuration(2832)).toBe("47m 12s");
});

test("hours drop seconds", () => {
  expect(formatMatchDuration(3600)).toBe("1h 00m");
  expect(formatMatchDuration(3725)).toBe("1h 02m");
});

test("matchElapsedSeconds prefers live clock from start time", () => {
  expect(matchElapsedSeconds("2026-08-18T12:00:00.000Z", Date.parse("2026-08-18T12:47:12.000Z"), 9)).toBe(2832);
});

test("matchElapsedSeconds falls back when start is missing", () => {
  expect(matchElapsedSeconds(null, Date.now(), 90)).toBe(90);
  expect(matchElapsedSeconds("nope", Date.now(), null)).toBe(null);
});

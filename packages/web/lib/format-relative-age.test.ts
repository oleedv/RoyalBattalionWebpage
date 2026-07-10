import { test, expect } from "bun:test";
import { formatRelativeAge } from "./format-relative-age";

const base = Date.parse("2026-07-10T12:00:00.000Z");

test("under a minute => just now", () => {
  expect(formatRelativeAge("2026-07-10T11:59:30.000Z", base)).toBe("just now");
});

test("minutes", () => {
  expect(formatRelativeAge("2026-07-10T11:57:00.000Z", base)).toBe("3m ago");
});

test("hours and minutes", () => {
  expect(formatRelativeAge("2026-07-10T10:23:00.000Z", base)).toBe("1h 37m ago");
});

test("exact hour omits minutes", () => {
  expect(formatRelativeAge("2026-07-10T10:00:00.000Z", base)).toBe("2h ago");
});

test("invalid input => empty string", () => {
  expect(formatRelativeAge("not-a-date", base)).toBe("");
});

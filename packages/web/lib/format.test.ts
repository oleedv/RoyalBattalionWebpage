import { test, expect } from "bun:test";
import { formatDate, formatDateCompact, formatDateTime, formatTime, formatNumber } from "./format";

const noonUtc = "2026-08-14T12:00:00.000Z";

test("formatDate is day-first European (14 Aug 2026)", () => {
  const result = formatDate(noonUtc);
  expect(result.startsWith("14")).toBe(true);
  expect(result).toContain("Aug");
  expect(result).toContain("2026");
  expect(result).not.toMatch(/^08/);
});

test("formatDateCompact keeps day before month", () => {
  const result = formatDateCompact(noonUtc);
  expect(result.startsWith("14")).toBe(true);
  expect(result).toContain("Aug");
});

test("formatDateTime uses 24-hour clock", () => {
  const result = formatDateTime(noonUtc);
  expect(result).not.toMatch(/AM|PM/i);
  expect(result.startsWith("14")).toBe(true);
});

test("formatTime uses 24-hour clock", () => {
  const result = formatTime(noonUtc);
  expect(result).not.toMatch(/AM|PM/i);
  expect(formatTime(noonUtc, { seconds: true })).toMatch(/\d{2}:\d{2}:\d{2}/);
});

test("formatNumber uses grouping", () => {
  expect(formatNumber(12345)).toBe("12,345");
});

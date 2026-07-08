// NOTE: recharts' ResponsiveContainer measures DOM dimensions and renders
// nothing at 0×0 in happy-dom. Bar-level DOM assertions are unreliable, so
// this file covers: (a) component mounts without throwing given a number[],
// and (b) the pure data-transform helpers exported from each chart module.
import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { HourlyChart, toHourlyData } from "@/app/(protected)/seeding/components/HourlyChart";
import { WeekdayChart, toWeekdayData } from "@/app/(protected)/seeding/components/WeekdayChart";

const HOURLY = Array.from({ length: 24 }, (_, i) => i * 2);
const WEEKLY = [10, 20, 30, 40, 50, 60, 70];

// ── toHourlyData ─────────────────────────────────────────────────────────────

test("toHourlyData maps 24 counts to { hour, value } pairs", () => {
  const result = toHourlyData(HOURLY);
  expect(result.length).toBe(24);
  expect(result[0]).toEqual({ hour: 0, value: 0 });
  expect(result[12]).toEqual({ hour: 12, value: 24 });
  expect(result[23]).toEqual({ hour: 23, value: 46 });
});

// ── toWeekdayData ─────────────────────────────────────────────────────────────

test("toWeekdayData maps 7 counts to named day pairs starting with Mon", () => {
  const result = toWeekdayData(WEEKLY);
  expect(result.length).toBe(7);
  expect(result[0]).toEqual({ day: "Mon", value: 10 });
  expect(result[6]).toEqual({ day: "Sun", value: 70 });
});

// ── mount smoke tests ─────────────────────────────────────────────────────────

test("HourlyChart mounts without throwing given 24 values", () => {
  expect(() => render(<HourlyChart data={HOURLY} />)).not.toThrow();
});

test("WeekdayChart mounts without throwing given 7 values", () => {
  expect(() => render(<WeekdayChart data={WEEKLY} />)).not.toThrow();
});

import { test, expect } from "bun:test";
import { sparklinePath } from "@/components/sparkline";

test("builds a polyline path across the full width", () => {
  const d = sparklinePath([0, 5, 10], 100, 30);
  expect(d.startsWith("M0,")).toBe(true);
  expect(d).toContain("L50,");
  expect(d).toContain("L100,");
});

test("flat series renders a midline", () => {
  const d = sparklinePath([4, 4, 4], 100, 30);
  expect(d).toBe("M0,15 L50,15 L100,15");
});

test("empty series yields empty path", () => {
  expect(sparklinePath([], 100, 30)).toBe("");
});

test("single value renders a flat line", () => {
  expect(sparklinePath([7], 100, 30)).toBe("M0,15 L100,15");
});

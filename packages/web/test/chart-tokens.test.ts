import { test, expect, afterEach } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { getChartTokens, useChartTokens } from "@/lib/chart-tokens";

const root = () => document.documentElement;

afterEach(() => {
  root().style.removeProperty("--color-accent");
  root().style.removeProperty("--color-border");
  root().classList.remove("dark", "light");
});

test("getChartTokens reads CSS custom properties from the document root", () => {
  root().style.setProperty("--color-accent", "#123456");
  root().style.setProperty("--color-border", "#654321");
  const t = getChartTokens();
  expect(t.accent).toBe("#123456");
  expect(t.series[0]).toBe("#123456");
  expect(t.grid).toBe("#654321");
  expect(t.tooltip.border).toBe("#654321");
});

test("getChartTokens falls back to dark theme values when properties are unset", () => {
  const t = getChartTokens();
  expect(t.accent).toBe("#c8a84e");
  expect(t.axis).toBe("#555558");
  expect(t.tooltip.bg).toBe("#16161b");
  expect(t.danger).toBe("#dc2626");
});

test("useChartTokens re-reads tokens when the html theme class changes", async () => {
  root().style.setProperty("--color-accent", "#111111");
  const { result, unmount } = renderHook(() => useChartTokens());
  expect(result.current.accent).toBe("#111111");

  root().style.setProperty("--color-accent", "#222222");
  await act(async () => {
    root().classList.add("light");
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(result.current.accent).toBe("#222222");
  unmount();
});

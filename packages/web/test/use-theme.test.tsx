import { test, expect, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "@/lib/use-theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "dark";
});

test("defaults to dark", () => {
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe("dark");
  expect(result.current.resolvedTheme).toBe("dark");
});

test("setTheme('light') swaps the html class and persists", () => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setTheme("light"));
  expect(document.documentElement.classList.contains("light")).toBe(true);
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(localStorage.getItem("rb-theme")).toBe("light");
});

test("setTheme('system') resolves via matchMedia", () => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setTheme("system"));
  expect(localStorage.getItem("rb-theme")).toBe("system");
  expect(["dark", "light"]).toContain(result.current.resolvedTheme);
});

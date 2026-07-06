import { test, expect } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { HeroTelemetry } from "@/components/public/hero-telemetry";

const ok = <T,>(data: T) => Promise.resolve({ success: true as const, data });

const fetchers = {
  servers: () =>
    ok([
      { status: "online", players: 84, maxPlayers: 100, map: "Narva", ip: "", port: 0, playerList: [] },
      { status: "offline", players: 0, maxPlayers: 100, map: "-", ip: "", port: 0, playerList: [] },
    ] as never),
  admins: () => ok({ count: 4 }),
  matches: () =>
    ok({ items: [{ id: 1, map: "Sumari", layer: "Sumari RAAS v1", result: "WIN", date: "2026-07-06", server: "Main" }], total: 1, page: 1, limit: 1, hasNext: false } as never),
};

test("renders four tiles with live values and result badge", async () => {
  render(<HeroTelemetry fetchers={fetchers} />);
  expect(screen.getByText("Main Server")).toBeDefined();
  expect(screen.getByText("Battle Server")).toBeDefined();
  expect(screen.getByText("Admins on Duty")).toBeDefined();
  expect(screen.getByText("Last Match")).toBeDefined();
  await waitFor(() => {
    expect(screen.getByText("84/100")).toBeDefined();
    expect(screen.getByText("Narva")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("WIN")).toBeDefined();
  });
});

test("renders -- fallbacks when fetchers fail", async () => {
  const failing = {
    servers: () => Promise.resolve({ success: false as const, error: "x" }),
    admins: () => Promise.resolve({ success: false as const, error: "x" }),
    matches: () => Promise.resolve({ success: false as const, error: "x" }),
  };
  render(<HeroTelemetry fetchers={failing as never} />);
  await waitFor(() => {
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(3);
  });
});

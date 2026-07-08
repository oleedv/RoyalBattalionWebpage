import { test, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SeedingLiveStatus } from "@/app/(protected)/seeding/components/SeedingLiveStatus";
import type { SeedingLiveStatus as LiveStatusData } from "shared";

function freshTs(): string {
  return new Date(Date.now() - 5_000).toISOString(); // 5s ago — well within 120s
}

function staleTs(): string {
  return new Date(Date.now() - 200_000).toISOString(); // 200s ago — stale
}

const baseConnected: LiveStatusData = {
  serverResolvedOk: true,
  socketConnected: true,
  currentPopulation: 42,
  currentLayer: "Sumari_AAS_v1",
  activeSessionId: 7,
  updatedAt: null, // overridden per test
};

function makeApi(data: LiveStatusData) {
  return {
    getSeedingLiveStatus: mock(() =>
      Promise.resolve({ success: true as const, data }),
    ),
  };
}

function makeErrorApi() {
  return {
    getSeedingLiveStatus: mock(() =>
      Promise.resolve({ success: false as const, error: "Network error" }),
    ),
  };
}

test("connected+fresh renders population count and active session StatusBadge", async () => {
  const api = makeApi({ ...baseConnected, updatedAt: freshTs() });
  render(<SeedingLiveStatus apiToken="tok" api={api} />);
  expect(await screen.findByText("42")).toBeDefined();
  expect(screen.getByText(/Active #7/)).toBeDefined();
});

test("stale updatedAt renders the no live data state", async () => {
  const api = makeApi({ ...baseConnected, updatedAt: staleTs() });
  render(<SeedingLiveStatus apiToken="tok" api={api} />);
  expect(await screen.findByText(/no live data/i)).toBeDefined();
});

test("serverResolvedOk=false renders server not configured message", async () => {
  const api = makeApi({ ...baseConnected, serverResolvedOk: false, updatedAt: freshTs() });
  render(<SeedingLiveStatus apiToken="tok" api={api} />);
  expect(await screen.findByText(/not configured/i)).toBeDefined();
});

test("error response renders live status unavailable message", async () => {
  const api = makeErrorApi();
  render(<SeedingLiveStatus apiToken="tok" api={api} />);
  expect(await screen.findByText(/live status unavailable/i)).toBeDefined();
});

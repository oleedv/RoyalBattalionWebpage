import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type {
  SeedTrackerLeaderboardEntry,
  SeedTrackerPlayerDetail,
  SeedTrackerStats,
} from "shared";
import {
  SeedingLeaderboard,
  type SeedingLeaderboardApi,
} from "@/app/(protected)/seeding/components/SeedingLeaderboard";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const entry1: SeedTrackerLeaderboardEntry = {
  steamId: "76561198000000001",
  name: "PlayerAlpha",
  seedDays: 20,
  totalDuration: 7200,
  avgQuality: 0.85,
  streak: 5,
  lastSeedDate: "2026-07-01",
  isActive: false,
};

const entry2: SeedTrackerLeaderboardEntry = {
  steamId: "76561198000000002",
  name: "PlayerBeta",
  seedDays: 15,
  totalDuration: 5400,
  avgQuality: 0.7,
  streak: 2,
  lastSeedDate: "2026-07-02",
  isActive: true,
};

const playerDetailAlpha: SeedTrackerPlayerDetail = {
  steamId: "76561198000000001",
  name: "PlayerAlpha",
  seedDays30: 8,
  seedDays90: 20,
  seedDaysAll: 30,
  totalDuration30: 3600,
  avgQuality: 0.85,
  streak: 5,
  timeOfDayDistribution: Array(24).fill(0) as number[],
  frequencyByWeekday: Array(7).fill(0) as number[],
  recentSessions: [],
  whitelistStatus: { hasWhitelist: false, role: null, expiresAt: null },
};

const stats: SeedTrackerStats = {
  totalSeeders: 50,
  totalSeedHours: 200,
  avgQuality: 0.75,
  activeSeeders7d: 12,
  currentlySeedingCount: 3,
};

function makeApi(overrides: Partial<SeedingLeaderboardApi> = {}): SeedingLeaderboardApi {
  return {
    getSeedTrackerLeaderboard: mock(async () => ({
      success: true as const,
      data: [entry1, entry2],
    })),
    getSeedTrackerStats: mock(async () => ({
      success: true as const,
      data: stats,
    })),
    getSeedTrackerPlayer: mock(async () => ({
      success: true as const,
      data: playerDetailAlpha,
    })),
    searchSeedTracker: mock(async () => ({
      success: true as const,
      data: [entry1],
    })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Leaderboard tab renders rows from getSeedTrackerLeaderboard
// ---------------------------------------------------------------------------

test("(1) leaderboard tab renders rows from getSeedTrackerLeaderboard", async () => {
  render(<SeedingLeaderboard apiToken="t" api={makeApi()} />);
  expect(await screen.findByText("PlayerAlpha")).toBeDefined();
  expect(screen.getByText("PlayerBeta")).toBeDefined();
});

// ---------------------------------------------------------------------------
// 2. Clicking a row calls getSeedTrackerPlayer and shows detail view
// ---------------------------------------------------------------------------

test("(2) clicking a row calls getSeedTrackerPlayer and shows detail view", async () => {
  const api = makeApi();
  render(<SeedingLeaderboard apiToken="t" api={api} />);
  await screen.findByText("PlayerAlpha");

  // Click on the player name cell (plain span, not a button/link)
  fireEvent.click(screen.getByText("PlayerAlpha"));

  // Back button appears (rendered as soon as selectedSteamId is set)
  expect(await screen.findByRole("button", { name: /back/i })).toBeDefined();

  // getSeedTrackerPlayer was called with the correct steamId
  expect(api.getSeedTrackerPlayer).toHaveBeenCalledTimes(1);
  const callArgs = (api.getSeedTrackerPlayer as ReturnType<typeof mock>).mock
    .calls[0] as unknown[];
  expect(callArgs[1]).toBe("76561198000000001");
});

// ---------------------------------------------------------------------------
// 3. Back button returns to the list
// ---------------------------------------------------------------------------

test("(3) back button returns to the list", async () => {
  render(<SeedingLeaderboard apiToken="t" api={makeApi()} />);
  await screen.findByText("PlayerAlpha");

  fireEvent.click(screen.getByText("PlayerAlpha"));
  await screen.findByRole("button", { name: /back/i });

  fireEvent.click(screen.getByRole("button", { name: /back/i }));

  // List is visible again with leaderboard rows
  expect(await screen.findByText("PlayerBeta")).toBeDefined();
  // Back button is gone
  expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
});

// ---------------------------------------------------------------------------
// 4. Search tab + typing calls searchSeedTracker (after debounce)
// ---------------------------------------------------------------------------

test("(4) search tab + typing calls searchSeedTracker and renders results", async () => {
  const api = makeApi();
  render(<SeedingLeaderboard apiToken="t" api={api} />);
  await screen.findByText("PlayerAlpha");

  // Switch to Search tab
  fireEvent.click(screen.getByRole("tab", { name: /search/i }));

  // Type in the search input
  const searchInput = await screen.findByPlaceholderText(/search/i);
  fireEvent.change(searchInput, { target: { value: "Alpha" } });

  // Wait for debounce to fire and results to render
  await waitFor(() => expect(api.searchSeedTracker).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("PlayerAlpha")).toBeDefined();
});

// ---------------------------------------------------------------------------
// 5. Empty leaderboard renders EmptyState
// ---------------------------------------------------------------------------

test("(5) empty leaderboard renders EmptyState", async () => {
  const api = makeApi({
    getSeedTrackerLeaderboard: mock(async () => ({
      success: true as const,
      data: [],
    })),
  });
  render(<SeedingLeaderboard apiToken="t" api={api} />);
  expect(
    await screen.findByText("No seeding data found for this period."),
  ).toBeDefined();
});

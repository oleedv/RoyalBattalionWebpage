// packages/web/test/discord-bot-overview-tab.test.tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import OverviewTab, { type OverviewApi } from "@/app/(protected)/discord-bot/components/OverviewTab";
import type { DiscordBotOverview } from "shared";

const now = new Date().toISOString();

const fixture: DiscordBotOverview = {
  botStatus: {
    status: "online",
    uptimeSeconds: 3600,
    guildCount: 1,
    memberCount: 120,
    latencyMs: 42,
    dbConnected: true,
    squadjsConnected: true,
    seedingSchedulerActive: true,
    prospectSchedulerActive: true,
    lastHeartbeat: now,
    startedAt: now,
  },
  tickets: {
    openByTier: { normal: 3, community_officer: 7, admin_officer: 0 },
    recentlyClosed: [],
  },
  prospects: {
    open: 5,
    accepted: 12,
    denied: 2,
    recentActivity: [],
  },
  seeding: {
    activeSession: null,
    recentSessions: [],
    config: { enabled: true, seedThreshold: 20 },
  },
};

function makeApi(data: DiscordBotOverview = fixture): OverviewApi {
  return {
    getDiscordBotOverview: () => Promise.resolve({ success: true as const, data }),
  };
}

// (1) bot status banner shows a StatusBadge with "Online" when status is online
test("(1) renders bot status as StatusBadge showing Online", async () => {
  render(<OverviewTab apiToken="tok" api={makeApi()} />);
  // findByText waits for async data load; StatusBadge renders children as text
  expect(await screen.findByText("Online")).toBeDefined();
});

// (2) open-tickets and prospect stat cards render with known counts
test("(2) renders open-tickets and prospect stat cards with known counts", async () => {
  render(<OverviewTab apiToken="tok" api={makeApi()} />);
  // normal=3 and community_officer=7 are unique numbers in the fixture
  expect(await screen.findByText("3")).toBeDefined(); // normal tickets
  expect(screen.getByText("7")).toBeDefined(); // community officer
  // open=5 and accepted=12 for prospects
  expect(screen.getByText("5")).toBeDefined();
  expect(screen.getByText("12")).toBeDefined();
});

// (3) seeding compact card: enabled badge + threshold info + /seeding link
test("(3) renders seeding card with enabled badge and /seeding link", async () => {
  render(<OverviewTab apiToken="tok" api={makeApi()} />);
  await screen.findByText("Online");
  // enabled StatusBadge
  expect(screen.getByText("Enabled")).toBeDefined();
  // threshold text
  expect(screen.getByText(/20 players/i)).toBeDefined();
  // link to seeding page
  const link = screen.getByRole("link", { name: /manage seeding/i });
  expect(link.getAttribute("href")).toBe("/seeding");
});

// (4) empty recentlyClosed and recentActivity -> EmptyState hint messages
test("(4) empty recently-closed and recent-applications show EmptyState", async () => {
  render(<OverviewTab apiToken="tok" api={makeApi()} />);
  await screen.findByText("Online");
  expect(screen.getByText("No recently closed tickets")).toBeDefined();
  expect(screen.getByText("No recent applications")).toBeDefined();
});

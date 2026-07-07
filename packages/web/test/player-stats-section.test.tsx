import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { PermissionProvider } from "@/lib/permission-context";
import PlayerStatsSection, {
  fmtHours,
  prettyWeapon,
  shortDate,
} from "@/app/(protected)/dashboard/player-stats-section";
import type { PlayerStats, PlayerStatsWindow } from "shared";

const win = (kdr: number): PlayerStatsWindow => ({
  kills: 100,
  deaths: 40,
  kdr,
  teamkills: 2,
  revivesGiven: 30,
  revivesReceived: 25,
  playtimeHours: 42,
  seedHours: 5,
  sessions: 12,
  avgSessionMinutes: 95,
  slHours: 8,
  slRounds: 6,
  squadsCreated: 4,
  vehiclesDestroyed: 3,
  fobHabHits: 40,
  seedDays: 3,
});

const fullStats: PlayerStats = {
  linked: true,
  hasData: true,
  steamId: "76561198000000001",
  playerName: "Olie",
  windows: { d7: win(1.1), d30: win(2.5), d90: win(3.1), all: win(4.2) },
  records: {
    favoriteWeapon: { name: "BP_M4_Carbine_C", kills: 250 },
    favoriteMap: { map: "Narva", rounds: 40 },
    bestRound: { map: "Yehorivka", date: "2026-06-01", kills: 18 },
  },
  daily: [
    { date: "2026-07-01", kills: 5, deaths: 2, playtimeHours: 1.5 },
    { date: "2026-07-02", kills: 8, deaths: 3, playtimeHours: 2 },
    { date: "2026-07-03", kills: 2, deaths: 1, playtimeHours: 0.5 },
  ],
};

const ChartsStub = ({ data }: { data: { date: string }[] }) => (
  <div data-testid="charts">{data.length}</div>
);

function renderSection(stats: PlayerStats) {
  const api = {
    getPlayerStats: mock(() =>
      Promise.resolve({ success: true as const, data: stats }),
    ),
  };
  return render(
    <PermissionProvider permissions={[]} apiToken="tok" user={null}>
      <PlayerStatsSection api={api} Charts={ChartsStub} />
    </PermissionProvider>,
  );
}

test("pure helpers format values", () => {
  expect(prettyWeapon("BP_M4_Carbine_C")).toBe("M4 Carbine");
  expect(shortDate("2026-07-01")).toBe("01 Jul");
  expect(fmtHours(42.4)).toBe("42h");
});

test("not-linked renders the Steam nudge with an anchor CTA", async () => {
  renderSection({ ...fullStats, linked: false, hasData: false });
  const cta = await screen.findByRole("link", { name: "Link Steam ID" });
  expect(cta.getAttribute("href")).toBe("#steam-link");
  expect(screen.getByText(/Link your Steam ID above/)).toBeDefined();
});

test("linked but no data renders the activity nudge with a server CTA", async () => {
  renderSection({ ...fullStats, hasData: false });
  const cta = await screen.findByRole("link", { name: "How to Connect" });
  expect(cta.getAttribute("href")).toBe("/server");
  expect(screen.getByText(/No recorded activity/)).toBeDefined();
});

test("renders grouped tiles for the default 30D window and the charts slot", async () => {
  renderSection(fullStats);
  expect(await screen.findByText("2.50")).toBeDefined(); // d30 KDR
  expect(screen.getByText("Combat")).toBeDefined();
  expect(screen.getByText("Activity")).toBeDefined();
  expect(screen.getByText("Leadership & Objectives")).toBeDefined();
  expect(screen.getByTestId("charts").textContent).toBe("3");
  expect(screen.getByText("M4 Carbine")).toBeDefined(); // record, prettified
});

test("window toggle switches the displayed window", async () => {
  renderSection(fullStats);
  await screen.findByText("2.50");
  fireEvent.click(screen.getByRole("button", { name: "7D" }));
  expect(screen.getByText("1.10")).toBeDefined();
  expect(screen.queryByText("2.50")).toBeNull();
});

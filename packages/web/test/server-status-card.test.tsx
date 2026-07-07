import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import ServerStatusCard from "@/app/(protected)/dashboard/server-status-card";
import type { ServerStatus } from "@/lib/api-client";

function makeServer(overrides: Partial<ServerStatus> = {}): ServerStatus {
  return {
    id: "1",
    name: "Royal Battalion Main",
    ip: "37.153.157.204",
    port: 27050,
    players: 87,
    maxPlayers: 100,
    map: "Narva AAS v2",
    status: "online",
    playerList: [],
    publicQueue: 3,
    reserveQueue: 1,
    metricHistory: [
      { time: 1, tickRate: null, playerCount: 80, publicQueue: 0, reserveQueue: 0 },
      { time: 2, tickRate: null, playerCount: 87, publicQueue: 3, reserveQueue: 1 },
    ],
    ...overrides,
  };
}

test("renders name, players, map, online badge and connect link", () => {
  const { container } = render(<ServerStatusCard server={makeServer()} />);
  expect(screen.getByText("Royal Battalion Main")).toBeDefined();
  // "87" also appears in the sparkline legend — target the header count span.
  const countSpan = container.querySelector(".font-mono.text-3xl");
  expect(countSpan?.textContent).toBe("87");
  expect(screen.getByText("/ 100")).toBeDefined();
  expect(screen.getByText("Narva AAS v2")).toBeDefined();
  expect(screen.getByText("Online")).toBeDefined();
  const connect = screen.getByText("Connect");
  expect(connect.getAttribute("href")).toBe(
    "steam://connect/37.153.157.204:27050",
  );
});

test("shows the combined queue pill only when a queue exists", () => {
  render(<ServerStatusCard server={makeServer()} />);
  expect(screen.getByText("+4 queue")).toBeDefined();
  render(
    <ServerStatusCard
      server={makeServer({ publicQueue: 0, reserveQueue: 0, name: "RB Battle" })}
    />,
  );
  expect(screen.queryByText("+0 queue")).toBeNull();
});

test("renders the capacity meter and the players/queue sparkline legend", () => {
  const { container } = render(<ServerStatusCard server={makeServer()} />);
  const meter = container.querySelector("[role=meter]") as HTMLElement;
  expect(meter.getAttribute("aria-valuenow")).toBe("87");
  expect(screen.getByText(/Players:/)).toBeDefined();
  expect(screen.getByText(/Queue:/)).toBeDefined();
});

test("offline server shows the offline badge and no sparkline block", () => {
  const { container } = render(
    <ServerStatusCard
      server={makeServer({ status: "offline", players: 0, metricHistory: [] })}
    />,
  );
  expect(screen.getByText("Offline")).toBeDefined();
  expect(container.querySelector("svg")).toBeNull();
});

import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServerCard } from "@/app/(public)/server/server-card";

const status = {
  status: "online",
  players: 84,
  maxPlayers: 100,
  map: "Narva AAS v1",
  ip: "1.2.3.4",
  port: 27015,
  playerList: [{ name: "Brick", duration: 3900 }],
} as never;

test("renders live status without any join flow", () => {
  render(
    <ServerCard
      config={{ label: "Main Server", displayName: "Royal Battalion" }}
      status={status}
    />,
  );
  expect(screen.getByText("Online")).toBeDefined();
  expect(screen.getByText("84")).toBeDefined();
  expect(screen.getByText("Narva AAS v1")).toBeDefined();
  expect(screen.queryByText(/Join Server/i)).toBeNull();
  expect(screen.queryByText(/Creating lobby/i)).toBeNull();
});

test("player list toggle reveals players", () => {
  render(
    <ServerCard
      config={{ label: "Main Server", displayName: "Royal Battalion" }}
      status={status}
    />,
  );
  const toggleButton = screen.getByText(/Show Players \(1\)/);
  fireEvent.click(toggleButton);
  expect(screen.getByText("Brick")).toBeDefined();
  expect(screen.getByText("1h 5m")).toBeDefined();
});

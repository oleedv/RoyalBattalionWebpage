import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MatchCard } from "@/app/(public)/matches/match-card";

const match = {
  id: 1,
  map: "Narva",
  layer: "Narva RAAS v1",
  date: "2026-07-01T18:00:00Z",
  server: "Main",
  result: "WIN",
  vodUrl: null,
  matchDetail: null,
} as never;

test("renders summary with StatusBadge result", () => {
  render(<MatchCard match={match} />);
  expect(screen.getByText("Narva")).toBeDefined();
  expect(screen.getByText("WIN")).toBeDefined();
});

test("no raw team hex classes remain", () => {
  const { container } = render(<MatchCard match={match} />);
  expect(container.innerHTML).not.toContain("#4a90d9");
  expect(container.innerHTML).not.toContain("#d94a4a");
});

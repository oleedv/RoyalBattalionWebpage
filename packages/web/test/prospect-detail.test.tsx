// packages/web/test/prospect-detail.test.tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { Prospect } from "shared";
import { ProspectDetailPanel } from "@/app/(protected)/tickets/prospect-detail";

const prospect: Prospect = {
  id: 5, uuid: "p-5", channelId: "c", userId: "9", status: "open", alias: "Alfa",
  nationality: "NO", dateOfBirth: "2000-01-01", squadHours: 120, preferredRoles: "SL, Medic",
  prevClan: "", whyRb: "I like the community", activeHours: "evenings", competitive: "yes",
  steamId: "76561198000000000", mentorId: null, pausedAt: null, extraDays: 0,
  createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
  votes: [{ id: 1, prospectId: 5, voterId: "1", voterTag: "Cap#1", vote: "yes", reason: "solid", createdAt: "2026-01-01T00:00:00.000Z" }],
  events: [], messages: [],
};

test("triggers fetch on mount and renders application info once detail arrives", () => {
  const calls: number[] = [];
  const { rerender } = render(
    <ProspectDetailPanel prospect={prospect} detail={undefined} ensureDetail={(id) => calls.push(id)} displayName={(id) => `name:${id}`} />,
  );
  expect(calls).toEqual([5]);
  expect(screen.queryByText("I like the community")).toBeNull();

  rerender(
    <ProspectDetailPanel prospect={prospect} detail={prospect} ensureDetail={() => {}} displayName={(id) => `name:${id}`} />,
  );
  expect(screen.getByText("I like the community")).toBeDefined();
  expect(screen.getByText("76561198000000000")).toBeDefined();
  expect(screen.getByText("Cap#1")).toBeDefined(); // vote
  expect(screen.getByRole("button", { name: /download/i })).toBeDefined();
});

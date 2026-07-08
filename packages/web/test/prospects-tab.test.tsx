// packages/web/test/prospects-tab.test.tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Prospect } from "shared";
import ProspectsTab, { type ProspectsApi } from "@/app/(protected)/tickets/prospects-tab";

const p1: Prospect = {
  id: 1, uuid: "p1", channelId: "c", userId: "10", status: "open", alias: "Bravo",
  nationality: "SE", dateOfBirth: "1999", squadHours: 50, preferredRoles: "Medic", prevClan: "",
  whyRb: "reasons", activeHours: "day", competitive: "no", steamId: "765", mentorId: null,
  pausedAt: null, extraDays: 0, createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
};

function makeApi(): ProspectsApi {
  return {
    getProspects: async () => ({ success: true, data: [p1] }),
    getProspect: async (_t, _id) => ({ success: true, data: { ...p1, whyRb: "full application text" } }),
    resolveDiscordNames: async () => ({ success: true, data: {} }),
  };
}

test("lists prospects and expands to fetch detail", async () => {
  render(<ProspectsTab token="tok" api={makeApi()} />);
  expect(await screen.findByText("Bravo")).toBeDefined();
  fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]);
  expect(await screen.findByText("full application text")).toBeDefined();
});

test("status filter narrows the list", async () => {
  render(<ProspectsTab token="tok" api={makeApi()} />);
  await screen.findByText("Bravo");
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[0], { target: { value: "accepted" } });
  await waitFor(() => expect(screen.queryByText("Bravo")).toBeNull());
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Prospect } from "shared";

const applicant: Prospect = {
  id: 1,
  uuid: "uuid-1",
  channelId: "chan-1",
  userId: "applicant-1",
  status: "open",
  alias: "Applicant",
  nationality: "NO",
  dateOfBirth: "2000-01-01",
  squadHours: 100,
  preferredRoles: "SL",
  prevClan: "",
  whyRb: "Because",
  activeHours: "evenings",
  competitive: "yes",
  steamId: "76561198000000000",
  mentorId: "mentor-1",
  pausedAt: null,
  extraDays: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  closedAt: null,
  closedBy: null,
};

const getProspects = mock(async () => {
  if (getProspects.mock.calls.length > 20) {
    return { success: false as const, error: "Too many requests" };
  }
  return { success: true as const, data: [applicant] };
});
const getProspect = mock(async () => ({ success: true as const, data: applicant }));
const resolveDiscordNames = mock(async () => ({
  success: true as const,
  data: { "mentor-1": "Alice" },
}));

mock.module("@/lib/api-client", () => ({
  getProspects,
  getProspect,
  resolveDiscordNames,
}));

const { ApplicationsList } = await import("./ApplicationsList");

afterEach(() => {
  cleanup();
  getProspects.mockClear();
  getProspect.mockClear();
  resolveDiscordNames.mockClear();
});

test("does not refetch the applications list after resolving some Discord names", async () => {
  render(<ApplicationsList apiToken="test-token" />);

  await waitFor(() => {
    expect(document.body.textContent).toContain("Applicant");
  });

  await new Promise((r) => setTimeout(r, 150));

  expect(getProspects.mock.calls.length).toBeLessThan(5);
  expect(document.body.textContent).not.toContain("Too many requests");
});

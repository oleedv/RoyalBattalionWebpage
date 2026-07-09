// packages/web/test/discord-bot-prospects-tab.test.tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Prospect, MentorGroup } from "shared";
import ProspectsTab, { type ProspectsApi } from "@/app/(protected)/discord-bot/components/ProspectsTab";

const p1: Prospect = {
  id: 1, uuid: "p1", channelId: "c", userId: "10", status: "open", alias: "Bravo",
  nationality: "SE", dateOfBirth: "1999-05-05", squadHours: 50, preferredRoles: "Medic", prevClan: "",
  whyRb: "list summary", activeHours: "evenings", competitive: "no", steamId: "76500000000000000",
  mentorId: "20", pausedAt: null, extraDays: 0, createdAt: "2026-01-01T00:00:00.000Z",
  closedAt: null, closedBy: null,
};

const p1Detail: Prospect = {
  ...p1,
  whyRb: "full application text",
  votes: [
    { id: 1, prospectId: 1, voterId: "40", voterTag: "Voter#1", vote: "yes", reason: null, createdAt: "2026-01-02T00:00:00.000Z" },
  ],
  events: [
    { id: 1, prospectId: 1, eventType: "created", actorId: "30", detail: null, createdAt: "2026-01-01T00:00:00.000Z" },
  ],
  messages: [],
};

const groupA: MentorGroup = {
  mentorId: "20",
  prospects: [
    { id: 1, uuid: "p1", userId: "10", alias: "Bravo", nationality: "SE", squadHours: 50, preferredRoles: "Medic", steamId: "765", mentorId: "20", pausedAt: null, extraDays: 0, createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};
const groupB: MentorGroup = {
  mentorId: "21",
  prospects: [
    { id: 2, uuid: "p2", userId: "11", alias: "Charlie", nationality: "NO", squadHours: 80, preferredRoles: "Rifleman", steamId: "766", mentorId: "21", pausedAt: null, extraDays: 0, createdAt: "2026-01-03T00:00:00.000Z" },
  ],
};

// Resolves every discord snowflake used in the fixtures to a human name.
const NAMES: Record<string, string> = {
  "10": "Applicant", "11": "CharlieUser", "20": "MentorOne", "21": "MentorTwo", "30": "AdminBob", "40": "Voter#1",
};

function makeApi(overrides: Partial<ProspectsApi> = {}): ProspectsApi {
  return {
    getProspects: mock(async () => ({ success: true as const, data: [p1] })),
    getProspect: mock(async (_t: string, _id: number) => ({ success: true as const, data: p1Detail })),
    resolveDiscordNames: mock(async () => ({ success: true as const, data: NAMES })),
    pauseProspect: mock(async () => ({ success: true as const, data: { updated: true as const } })),
    unpauseProspect: mock(async () => ({ success: true as const, data: { updated: true as const } })),
    extendProspect: mock(async () => ({ success: true as const, data: { updated: true as const } })),
    getMentorGroups: mock(async () => ({ success: true as const, data: [groupA, groupB] })),
    reassignMentor: mock(async () => ({ success: true as const, data: { queued: true as const } })),
    ...overrides,
  };
}

// (1) List view renders prospects from getProspects.
test("(1) list view renders prospects", async () => {
  render(<ProspectsTab apiToken="tok" canManage={true} api={makeApi()} />);
  expect(await screen.findByText("Bravo")).toBeDefined();
});

// (2) Expanding a row lazily fetches the full detail via getProspect.
test("(2) expanding a row fetches and shows detail", async () => {
  const api = makeApi();
  render(<ProspectsTab apiToken="tok" canManage={true} api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /Bravo/ }));
  expect(await screen.findByText("full application text")).toBeDefined();
  expect(api.getProspect).toHaveBeenCalledWith("tok", 1);
});

// (3) Status filter (Select) narrows the list to the chosen status.
test("(3) status filter narrows the list", async () => {
  render(<ProspectsTab apiToken="tok" canManage={true} api={makeApi()} />);
  await screen.findByText("Bravo");
  fireEvent.click(screen.getByRole("combobox"));
  const opt = await screen.findByRole("option", { name: "Accepted" });
  fireEvent.pointerDown(opt, { pointerType: "mouse", buttons: 1 });
  fireEvent.click(opt);
  await waitFor(() => expect(screen.queryByText("Bravo")).toBeNull());
});

// (4) Switching to Mentor View calls getMentorGroups and renders groups.
test("(4) mentor view loads mentor groups", async () => {
  const api = makeApi();
  render(<ProspectsTab apiToken="tok" canManage={true} api={api} />);
  await screen.findByText("Bravo");
  fireEvent.click(screen.getByRole("tab", { name: "Mentor View" }));
  expect(await screen.findByText("MentorOne")).toBeDefined();
  expect(api.getMentorGroups).toHaveBeenCalled();
});

// (5a) canManage=true: Pause calls pauseProspect.
test("(5a) pause calls pauseProspect", async () => {
  const api = makeApi();
  render(<ProspectsTab apiToken="tok" canManage={true} api={api} />);
  await screen.findByText("Bravo");
  fireEvent.click(screen.getByRole("tab", { name: "Mentor View" }));
  await screen.findByText("MentorOne");
  fireEvent.click(screen.getAllByRole("button", { name: /^pause$/i })[0]);
  await waitFor(() => expect(api.pauseProspect).toHaveBeenCalledWith("tok", 1));
});

// (5b) canManage=true: Extend calls extendProspect with the entered days.
test("(5b) extend calls extendProspect with entered days", async () => {
  const api = makeApi();
  render(<ProspectsTab apiToken="tok" canManage={true} api={api} />);
  await screen.findByText("Bravo");
  fireEvent.click(screen.getByRole("tab", { name: "Mentor View" }));
  await screen.findByText("MentorOne");
  fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "5" } });
  fireEvent.click(screen.getAllByRole("button", { name: /^extend$/i })[0]);
  await waitFor(() => expect(api.extendProspect).toHaveBeenCalledWith("tok", 1, 5));
});

// (5c) canManage=true: Reassign calls reassignMentor with the chosen mentor.
test("(5c) reassign calls reassignMentor with the chosen mentor", async () => {
  const api = makeApi();
  render(<ProspectsTab apiToken="tok" canManage={true} api={api} />);
  await screen.findByText("Bravo");
  fireEvent.click(screen.getByRole("tab", { name: "Mentor View" }));
  await screen.findByText("MentorOne");
  fireEvent.click(screen.getAllByRole("button", { name: /^reassign$/i })[0]);
  fireEvent.click(screen.getByRole("combobox"));
  const opt = await screen.findByRole("option", { name: "MentorTwo" });
  fireEvent.pointerDown(opt, { pointerType: "mouse", buttons: 1 });
  fireEvent.click(opt);
  fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
  await waitFor(() => expect(api.reassignMentor).toHaveBeenCalledWith("tok", 1, "21"));
});

// (5d) canManage=false: the mutation controls are absent.
test("(5d) without canManage the mutation controls are absent", async () => {
  render(<ProspectsTab apiToken="tok" canManage={false} api={makeApi()} />);
  await screen.findByText("Bravo");
  fireEvent.click(screen.getByRole("tab", { name: "Mentor View" }));
  await screen.findByText("MentorOne");
  expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^reassign$/i })).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

// (6) Discord IDs resolve to names via resolveDiscordNames.
test("(6) discord ids resolve to names", async () => {
  render(<ProspectsTab apiToken="tok" canManage={true} api={makeApi()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Bravo/ }));
  // Timeline event actorId "30" is resolved to "AdminBob" (not the raw snowflake).
  expect(await screen.findByText(/AdminBob/)).toBeDefined();
  expect(screen.queryByText("30")).toBeNull();
});

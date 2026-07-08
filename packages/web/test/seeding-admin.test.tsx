import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  SeedingAdmin,
  type SeedingAdminApi,
} from "@/app/(protected)/seeding/components/SeedingAdmin";
import type {
  SeedingConfig,
  SeedingSession,
  SeedingRapport,
  SquadServerOption,
} from "shared";

const baseConfig: SeedingConfig = {
  id: 1,
  enabled: false,
  channelId: "123456",
  roleIds: ["role-a"],
  seedThreshold: 50,
  resetThreshold: 60,
  dailyTime: "14:00",
  timezone: "Europe/Oslo",
  announcerServerId: null,
  trackerServerId: null,
  trackerEnabled: true,
  requiredSeedDays: 5,
  rollingWindowDays: 30,
  whitelistDurationDays: 14,
  maxExtensionDays: 7,
  progressionChannelId: null,
  leaderboardChannelId: null,
  appreciationChannelId: null,
  minProgressionDays: 3,
};

const servers: SquadServerOption[] = [
  { id: 1, name: "Main Server" },
  { id: 2, name: "Battle Server" },
];

const sessions: SeedingSession[] = [
  {
    id: 10,
    startedAt: "2026-02-01T10:00:00.000Z",
    completedAt: null,
    durationMinutes: null,
    startPlayers: 2,
    peakPlayers: 40,
    endPlayers: null,
    mapName: "Narva",
    layerName: "Narva_AAS_v1",
    status: "active",
    callMessageId: null,
    completionMessageId: null,
  },
  {
    id: 11,
    startedAt: "2026-01-31T10:00:00.000Z",
    completedAt: "2026-01-31T12:00:00.000Z",
    durationMinutes: 120,
    startPlayers: 5,
    peakPlayers: 50,
    endPlayers: 45,
    mapName: "Yehorivka",
    layerName: "Yehorivka_RAAS_v1",
    status: "completed",
    callMessageId: null,
    completionMessageId: null,
  },
];

const rapport: SeedingRapport = {
  date: "2026-02-01",
  totalSeeders: 3,
  totalJoins: 5,
  avgSeedMinutes: 45,
  totalSeedMinutes: 135,
  seeders: [
    {
      playerName: "Alice",
      steamId: "1",
      joinTime: "2026-02-01T10:00:00.000Z",
      leaveTime: "2026-02-01T11:00:00.000Z",
      seedDurationMinutes: 60,
      sessionDurationMinutes: 90,
    },
  ],
};

function makeApi(over: Partial<SeedingAdminApi> = {}): SeedingAdminApi {
  return {
    getSeedingConfig: mock(async () => ({ success: true as const, data: baseConfig })),
    updateSeedingConfig: mock(async (_t: string, _d: Partial<SeedingConfig>) => ({
      success: true as const,
      data: { updated: true as const },
    })),
    getSeedingSessions: mock(async () => ({ success: true as const, data: sessions })),
    sendSeedingNow: mock(async () => ({
      success: true as const,
      data: { queued: true as const },
    })),
    getSeedingRapport: mock(async () => ({ success: true as const, data: rapport })),
    sendSeedingRapport: mock(async (_t: string, _d: string) => ({
      success: true as const,
      data: { queued: true as const },
    })),
    getSeedingServers: mock(async () => ({ success: true as const, data: servers })),
    ...over,
  } as SeedingAdminApi;
}

function makeNotify() {
  return { success: mock((_m: string) => {}), error: mock((_m: string) => {}) };
}

test("(1) renders the config form populated from getSeedingConfig", async () => {
  render(<SeedingAdmin apiToken="tok" api={makeApi()} notify={makeNotify()} />);
  const channel = await screen.findByLabelText("Channel ID");
  expect((channel as HTMLInputElement).value).toBe("123456");
  expect((screen.getByLabelText("Seed Threshold") as HTMLInputElement).value).toBe("50");
  expect(screen.getByRole("switch", { name: "Enabled" }).getAttribute("aria-checked")).toBe(
    "false",
  );
});

test("(2) toggling Enabled + Save PATCHes with enabled flipped and toasts Saved", async () => {
  const api = makeApi();
  const notify = makeNotify();
  render(<SeedingAdmin apiToken="tok" api={api} notify={notify} />);
  await screen.findByLabelText("Channel ID");

  const sw = screen.getByRole("switch", { name: "Enabled" });
  sw.focus();
  fireEvent.keyDown(sw, { key: " " });
  fireEvent.keyUp(sw, { key: " " });

  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() =>
    expect((api.updateSeedingConfig as ReturnType<typeof mock>).mock.calls.length).toBe(1),
  );
  const sent = (api.updateSeedingConfig as ReturnType<typeof mock>).mock
    .calls[0][1] as SeedingConfig;
  expect(sent.enabled).toBe(true);
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Saved"));
  expect(notify.error).not.toHaveBeenCalled();
});

test("(3a) selecting an Announcer Server saves a NUMBER id", async () => {
  const api = makeApi();
  render(<SeedingAdmin apiToken="tok" api={api} notify={makeNotify()} />);
  await screen.findByLabelText("Channel ID");

  fireEvent.click(screen.getByRole("combobox", { name: "Announcer Server" }));
  const item = await screen.findByText("Main Server");
  fireEvent.pointerDown(item, { pointerType: "mouse", buttons: 1 });
  fireEvent.click(item);

  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect((api.updateSeedingConfig as ReturnType<typeof mock>).mock.calls.length).toBe(1),
  );
  const sent = (api.updateSeedingConfig as ReturnType<typeof mock>).mock
    .calls[0][1] as SeedingConfig;
  expect(sent.announcerServerId).toBe(1);
  expect(typeof sent.announcerServerId).toBe("number");
});

test("(3b) choosing the none option saves null", async () => {
  const api = makeApi({
    getSeedingConfig: mock(async () => ({
      success: true as const,
      data: { ...baseConfig, announcerServerId: 2 },
    })),
  });
  render(<SeedingAdmin apiToken="tok" api={api} notify={makeNotify()} />);
  await screen.findByLabelText("Channel ID");

  fireEvent.click(screen.getByRole("combobox", { name: "Announcer Server" }));
  const none = await screen.findByText("— none —");
  fireEvent.pointerDown(none, { pointerType: "mouse", buttons: 1 });
  fireEvent.click(none);

  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect((api.updateSeedingConfig as ReturnType<typeof mock>).mock.calls.length).toBe(1),
  );
  const sent = (api.updateSeedingConfig as ReturnType<typeof mock>).mock
    .calls[0][1] as SeedingConfig;
  expect(sent.announcerServerId).toBe(null);
});

test("(4) roleIds: add appends a chip, duplicate is ignored, remove drops it", async () => {
  render(<SeedingAdmin apiToken="tok" api={makeApi()} notify={makeNotify()} />);
  await screen.findByLabelText("Channel ID");

  const roleInput = screen.getByLabelText("Seeder Role IDs");
  fireEvent.change(roleInput, { target: { value: "role-b" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getByText("role-b")).toBeDefined();

  // duplicate guard: adding the existing role-a must not create a second chip
  fireEvent.change(roleInput, { target: { value: "role-a" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getAllByText("role-a").length).toBe(1);

  // remove role-b
  fireEvent.click(screen.getByRole("button", { name: "Remove role role-b" }));
  await waitFor(() => expect(screen.queryByText("role-b")).toBeNull());
});

test("(5a) Send-now opens the dialog; confirming calls sendSeedingNow and toasts Queued", async () => {
  const api = makeApi();
  const notify = makeNotify();
  render(<SeedingAdmin apiToken="tok" api={api} notify={notify} />);
  await screen.findByLabelText("Channel ID");

  fireEvent.click(screen.getByRole("button", { name: "Send Seeding Call Now" }));
  const confirm = await screen.findByRole("button", { name: "Send call" });
  fireEvent.click(confirm);

  await waitFor(() => expect(api.sendSeedingNow).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Queued"));
});

test("(5b) Send-now cancel does not call sendSeedingNow", async () => {
  const api = makeApi();
  render(<SeedingAdmin apiToken="tok" api={api} notify={makeNotify()} />);
  await screen.findByLabelText("Channel ID");

  fireEvent.click(screen.getByRole("button", { name: "Send Seeding Call Now" }));
  const cancel = await screen.findByRole("button", { name: "Cancel" });
  fireEvent.click(cancel);

  expect(api.sendSeedingNow).not.toHaveBeenCalled();
});

test("(6) session history renders rows with the active row highlighted", async () => {
  render(<SeedingAdmin apiToken="tok" api={makeApi()} notify={makeNotify()} />);
  await screen.findByLabelText("Channel ID");

  const activeCell = await screen.findByText("Narva");
  const activeRow = activeCell.closest("tr");
  expect(activeRow?.className).toContain("bg-success/5");

  const completedRow = screen.getByText("Yehorivka").closest("tr");
  expect(completedRow?.className ?? "").not.toContain("bg-success/5");

  // SessionBadge -> StatusBadge keeps the raw status text
  expect(screen.getByText("active")).toBeDefined();
});

test("(7) rapport: Load fetches, Send opens a dialog, confirm sends for the loaded date", async () => {
  const api = makeApi();
  render(<SeedingAdmin apiToken="tok" api={api} notify={makeNotify()} />);
  await screen.findByLabelText("Channel ID");

  fireEvent.click(screen.getByRole("button", { name: "Load Rapport" }));
  await waitFor(() => expect(api.getSeedingRapport).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Alice")).toBeDefined();

  fireEvent.click(await screen.findByRole("button", { name: "Send to Discord" }));
  const confirm = await screen.findByRole("button", { name: "Send rapport" });
  fireEvent.click(confirm);

  await waitFor(() => expect(api.sendSeedingRapport).toHaveBeenCalledTimes(1));
  const call = (api.sendSeedingRapport as ReturnType<typeof mock>).mock.calls[0];
  expect(call[1]).toBe(rapport.date);
});

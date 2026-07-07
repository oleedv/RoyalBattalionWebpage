import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EntriesTab from "@/app/(protected)/whitelist/entries-tab";
import type { AdminGroup, Clan, WhitelistEntry } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [{ id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" }];

function entry(over: Partial<WhitelistEntry>): WhitelistEntry {
  return {
    id: "e1", steamId: "76561198000000001", server: "main", name: "Olie",
    clan: "RB", clanId: "c1", clanName: "Royal Battalion", role: null,
    groupId: "g1", groupName: "Whitelist", userId: null, addedBy: "x",
    reason: null, expiresAt: null, createdAt: "2026-01-01T00:00:00Z",
  ...over,
  };
}
const active = entry({});
const expired = entry({ id: "e2", steamId: "2", name: "Gone", expiresAt: "2020-01-01T00:00:00Z" });

function makeApi(over: Record<string, unknown> = {}) {
  return {
    getWhitelist: mock(() => Promise.resolve({ success: true as const, data: [active, expired] })),
    addWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: entry({ id: "e3", steamId: "3" }) })),
    getWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: { ...active, comments: [], addedByName: "Ole" } })),
    bulkUpdateWhitelist: mock(() => Promise.resolve({ success: true as const, data: { updated: 1 } })),
    bulkDeleteWhitelist: mock(() => Promise.resolve({ success: true as const, data: { deleted: 1 } })),
    updateWhitelistEntry: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteWhitelistEntry: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    addWhitelistComment: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteWhitelistComment: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    getPlaytime: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    getAuditLogs: mock(() => Promise.resolve({ success: true as const, data: { items: [], total: 0, page: 1, limit: 50, hasNext: false } })),
    bulkAddWhitelist: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    ...over,
  };
}

function renderTab(over: Record<string, unknown> = {}) {
  const props = {
    entries: [active, expired],
    setEntries: mock(() => {}),
    groups,
    clans,
    token: "tok",
    canManage: true,
    activeServer: "main",
    api: makeApi(),
    notify: { error: mock(() => {}) },
    ...over,
  };
  render(<EntriesTab {...(props as any)} />);
  return props;
}

test("hides expired entries by default and reveals them via the toggle", () => {
  renderTab();
  expect(screen.getByText("Olie")).toBeDefined();
  expect(screen.queryByText("Gone")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show Expired" }));
  expect(screen.getByText("Gone")).toBeDefined();
  expect(screen.getByText("Gone").closest("tr")!.className).toContain("opacity-50");
  expect(screen.getByText("Expired")).toBeDefined();
});

test("search narrows rows", () => {
  renderTab({ entries: [active, entry({ id: "e4", steamId: "9", name: "Other", clan: null, clanName: null })] });
  fireEvent.change(screen.getByPlaceholderText("Search by Steam ID, name, clan, group..."), {
    target: { value: "Other" },
  });
  expect(screen.queryByText("Olie")).toBeNull();
  expect(screen.getByText("Other")).toBeDefined();
});

test("add form posts the entry with resolved clan tag and server", async () => {
  const props = renderTab();
  fireEvent.change(screen.getByPlaceholderText("Steam64 ID"), { target: { value: "76561198000000009" } });
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Fresh" } });
  fireEvent.change(screen.getByDisplayValue("No Clan"), { target: { value: "c1" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));
  await waitFor(() => expect(props.setEntries).toHaveBeenCalled());
  const api = props.api as ReturnType<typeof makeApi>;
  const call = api.addWhitelistEntry.mock.calls[0] as unknown[];
  expect(call[1]).toBe("76561198000000009");
  expect(call[2]).toEqual({
    name: "Fresh",
    clanId: "c1",
    clan: "RB",
    groupId: undefined,
    expiresAt: undefined,
    server: "main",
  });
});

test("row click opens the profile dialog with the fetched entry", async () => {
  const props = renderTab();
  fireEvent.click(screen.getByText("Olie"));
  const api = props.api as ReturnType<typeof makeApi>;
  await waitFor(() => expect(api.getWhitelistEntry).toHaveBeenCalledWith("tok", "e1"));
  expect(await screen.findByText("Comments (0)")).toBeDefined();
});

test("bulk change-group flows through the dialog and refetches", async () => {
  const props = renderTab();
  const rowCheckboxes = screen.getAllByRole("checkbox", { name: "Select row" });
  fireEvent.click(rowCheckboxes[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Change Group" }));
  expect(screen.getByText(/This will affect 1 selected entry\./)).toBeDefined();
  // Two "No group" selects exist (add form + dialog); the dialog's portal renders last.
  fireEvent.change(screen.getAllByDisplayValue("No group").at(-1)!, { target: { value: "g1" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  const api = props.api as ReturnType<typeof makeApi>;
  await waitFor(() =>
    expect(api.bulkUpdateWhitelist).toHaveBeenCalledWith("tok", ["e1"], { groupId: "g1" }),
  );
  await waitFor(() => expect(api.getWhitelist).toHaveBeenCalled());
});

import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EntryProfileDialog from "@/app/(protected)/whitelist/entry-profile-dialog";
import type { AdminGroup, Clan, WhitelistEntryWithComments } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
  { id: "g2", name: "SuperAdmin", permissions: "ban", sortOrder: 0, createdAt: "" },
];
const clans: Clan[] = [{ id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" }];

const entry: WhitelistEntryWithComments = {
  id: "e1", steamId: "76561198000000001", server: "main", name: "Olie",
  clan: "RB", clanId: "c1", clanName: "Royal Battalion", role: null,
  groupId: "g1", groupName: "Whitelist", userId: null, addedBy: "raw-id",
  addedByName: "Royal Secretary Bot", reason: null, expiresAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  comments: [
    { id: "cm1", whitelistEntryId: "e1", authorId: "a", authorName: "Ole", text: "vip", createdAt: new Date().toISOString() },
  ],
};

function makeApi(over: Record<string, unknown> = {}) {
  return {
    updateWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: { ...entry, name: "Renamed" } })),
    deleteWhitelistEntry: mock(() => Promise.resolve({ success: true as const })),
    getWhitelistEntry: mock(() => Promise.resolve({ success: true as const, data: { ...entry, name: "Renamed" } })),
    addWhitelistComment: mock(() => Promise.resolve({ success: true as const, data: { id: "cm2", whitelistEntryId: "e1", authorId: "a", authorName: "Ole", text: "hello", createdAt: new Date().toISOString() } })),
    deleteWhitelistComment: mock(() => Promise.resolve({ success: true as const })),
    getPlaytime: mock(() => Promise.resolve({ success: true as const, data: { steamId: entry.steamId, playtime30: 12, playtime90: 40, seed30: 2, seed90: 6 } })),
    getAuditLogs: mock((_: string, _p: Record<string, unknown>) => Promise.resolve({ success: true as const, data: { items: [], total: 0, page: 1, limit: 50, hasNext: false } })),
    ...over,
  };
}

function baseProps(over: Record<string, unknown> = {}) {
  return {
    entry,
    onClose: mock(() => {}),
    groups,
    clans,
    token: "tok",
    canManage: true,
    onUpdated: mock(() => {}),
    onDeleted: mock(() => {}),
    api: makeApi(),
    notify: { error: mock(() => {}) },
    ...over,
  };
}

test("renders identity fields, resolved addedByName, playtime and comments", async () => {
  render(<EntryProfileDialog {...(baseProps() as any)} />);
  expect(screen.getByText("Olie")).toBeDefined();
  expect(screen.getByText("76561198000000001")).toBeDefined();
  expect(screen.getByText("Royal Secretary Bot")).toBeDefined(); // never the raw snowflake
  expect(screen.queryByText("raw-id")).toBeNull();
  expect(screen.getByText("Permanent")).toBeDefined();
  expect(await screen.findByText("12h / 40h")).toBeDefined();
  expect(screen.getByText("2h / 6h")).toBeDefined();
  expect(screen.getByText("Comments (1)")).toBeDefined();
  expect(screen.getByText("vip")).toBeDefined();
});

test("edit mode saves the full payload and reports the updated row up", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(props.onUpdated).toHaveBeenCalled());
  const api = props.api as ReturnType<typeof makeApi>;
  const sent = api.updateWhitelistEntry.mock.calls[0] as unknown[];
  expect(sent[1]).toBe("e1");
  expect((sent[2] as { name?: string }).name).toBe("Renamed");
  expect((sent[2] as { clan?: string }).clan).toBe("RB"); // clan tag resolved from clanId
});

test("delete requires the confirm step, then reports up and closes", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect((props.api as ReturnType<typeof makeApi>).deleteWhitelistEntry).not.toHaveBeenCalled();
  expect(screen.getByText("Delete this entry?")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith("e1"));
  expect(props.onClose).toHaveBeenCalled();
});

test("adding a comment prepends it; failure toasts", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as any)} />);
  fireEvent.change(screen.getByPlaceholderText("Add a comment..."), { target: { value: "hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByText("hello")).toBeDefined();
  expect(screen.getByText("Comments (2)")).toBeDefined();

  const failing = baseProps({
    api: makeApi({
      addWhitelistComment: mock(() => Promise.resolve({ success: false as const, error: "nope" })),
    }),
  });
  render(<EntryProfileDialog {...(failing as any)} />);
  fireEvent.change(screen.getAllByPlaceholderText("Add a comment...").at(-1)!, { target: { value: "x" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add" }).at(-1)!);
  await waitFor(() =>
    expect(failing.notify.error).toHaveBeenCalledWith("nope", "Failed to add comment"),
  );
});

test("activity section lazy-loads on open", async () => {
  const props = baseProps();
  render(<EntryProfileDialog {...(props as any)} />);
  const api = props.api as ReturnType<typeof makeApi>;
  expect(api.getAuditLogs).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Activity/ }));
  await waitFor(() => expect(api.getAuditLogs).toHaveBeenCalled());
  const params = api.getAuditLogs.mock.calls[0][1] as Record<string, unknown>;
  expect(params.resource).toBe("WhitelistEntry");
  expect(params.resourceId).toBe("e1");
  expect(await screen.findByText("No activity recorded.")).toBeDefined();
});

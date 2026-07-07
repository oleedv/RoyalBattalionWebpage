import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import GroupsTab from "@/app/(protected)/whitelist/groups-tab";
import ClansTab from "@/app/(protected)/whitelist/clans-tab";
import type { AdminGroup, Clan } from "shared";

const group: AdminGroup = { id: "g1", name: "Whitelist", permissions: "reserve,balance", sortOrder: 2, createdAt: "" };
const clan: Clan = { id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" };
const noopNotify = () => ({ error: mock(() => {}) });

test("GroupsTab creates a group with joined permissions", async () => {
  const api = {
    createAdminGroup: mock(() =>
      Promise.resolve({ success: true as const, data: { ...group, id: "g2", name: "Seeder" } }),
    ),
    updateAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
  };
  const setGroups = mock(() => {});
  render(
    <GroupsTab groups={[group]} setGroups={setGroups} token="tok" canManage api={api} notify={noopNotify()} />,
  );
  fireEvent.change(screen.getByPlaceholderText("Group name (e.g. Whitelist)"), {
    target: { value: "Seeder" },
  });
  fireEvent.click(screen.getByRole("button", { name: "reserve" }));
  fireEvent.click(screen.getByRole("button", { name: "kick" }));
  fireEvent.click(screen.getByRole("button", { name: /Create Group/ }));
  await waitFor(() => expect(setGroups).toHaveBeenCalled());
  const sent = (api.createAdminGroup.mock as any).calls[0][1] as { name: string; permissions: string; sortOrder: number };
  expect(sent.name).toBe("Seeder");
  expect(sent.permissions.split(",").sort()).toEqual(["kick", "reserve"]);
});

test("GroupsTab delete requires the inline confirm and toasts failure", async () => {
  const notify = noopNotify();
  const api = {
    createAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    updateAdminGroup: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteAdminGroup: mock(() =>
      Promise.resolve({ success: false as const, error: "Group in use" }),
    ),
  };
  render(
    <GroupsTab groups={[group]} setGroups={mock(() => {})} token="tok" canManage api={api} notify={notify} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(api.deleteAdminGroup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith("Group in use", "Failed to delete group"),
  );
});

test("ClansTab creates and renders tag chips", async () => {
  const api = {
    createClan: mock(() =>
      Promise.resolve({ success: true as const, data: { ...clan, id: "c2", name: "Second", tag: "2ND" } }),
    ),
    updateClan: mock(() => Promise.resolve({ success: false as const, error: "x" })),
    deleteClan: mock(() => Promise.resolve({ success: false as const, error: "x" })),
  };
  const setClans = mock(() => {});
  render(
    <ClansTab clans={[clan]} setClans={setClans} token="tok" canManage api={api} notify={noopNotify()} />,
  );
  expect(screen.getByText("[RB]")).toBeDefined();
  fireEvent.change(screen.getByPlaceholderText("Clan name (e.g. Royal Battalion)"), {
    target: { value: "Second" },
  });
  fireEvent.change(screen.getByPlaceholderText("Tag (e.g. RB)"), { target: { value: "2ND" } });
  fireEvent.click(screen.getByRole("button", { name: /Create Clan/ }));
  await waitFor(() => expect(setClans).toHaveBeenCalled());
  expect(api.createClan).toHaveBeenCalledWith("tok", { name: "Second", tag: "2ND" });
});

import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RolesView, type RolesApi } from "@/app/(protected)/roles/roles-view";
import type { DiscordRole, Permission } from "shared";

const admin: DiscordRole = {
  id: "r1",
  discordRoleId: "999",
  name: "Admin",
  permissions: ["view:members"],
  grantsWhitelist: false,
  isMemberRole: false,
};

function makeApi(over: Partial<RolesApi> = {}): RolesApi {
  return {
    getRoles: mock(async () => ({ success: true as const, data: [admin] })),
    createRole: mock(async () => ({
      success: true as const,
      data: { id: "r2", discordRoleId: "111", name: "Mod", permissions: [], grantsWhitelist: false, isMemberRole: false },
    })),
    updateRolePermissions: mock(async () => ({ success: true as const, data: { ...admin, permissions: ["view:members", "manage:members"] as Permission[] } })),
    updateRoleWhitelistGrant: mock(async () => ({ success: true as const, data: admin })),
    updateRoleMemberRole: mock(async () => ({ success: true as const, data: admin })),
    deleteRole: mock(async () => ({ success: true as const })),
    ...over,
  };
}

test("renders roles from the api", async () => {
  render(<RolesView token="t" permissions={["manage:roles"]} api={makeApi()} />);
  expect(await screen.findByText("Admin")).toBeDefined();
});

test("developer-only permission still shows the register form (superpower)", async () => {
  render(<RolesView token="t" permissions={["developer"]} api={makeApi()} />);
  await screen.findByText("Admin");
  expect(screen.getByPlaceholderText("Discord Role ID")).toBeDefined();
});

test("no manage perm and not developer: read-only, no register form", async () => {
  render(<RolesView token="t" permissions={["view:members"]} api={makeApi()} />);
  await screen.findByText("Admin");
  expect(screen.queryByPlaceholderText("Discord Role ID")).toBeNull();
});

test("registering a role calls createRole with entered values", async () => {
  const api = makeApi();
  render(<RolesView token="t" permissions={["manage:roles"]} api={api} />);
  await screen.findByText("Admin");
  fireEvent.change(screen.getByPlaceholderText("Discord Role ID"), { target: { value: "111" } });
  fireEvent.change(screen.getByPlaceholderText("Display Name"), { target: { value: "Mod" } });
  fireEvent.click(screen.getByRole("button", { name: "Register Role" }));
  await waitFor(() =>
    expect(api.createRole).toHaveBeenCalledWith("t", { discordRoleId: "111", name: "Mod" }),
  );
  expect(await screen.findByText("Mod")).toBeDefined();
});

test("expanding a role then toggling a perm and saving calls updateRolePermissions", async () => {
  const api = makeApi();
  render(<RolesView token="t" permissions={["manage:roles"]} api={api} />);
  await screen.findByText("Admin");
  fireEvent.click(screen.getByText("Admin")); // expand
  fireEvent.click(await screen.findByText("Manage Members")); // toggle a perm on
  fireEvent.click(screen.getByRole("button", { name: "Save Permissions" }));
  await waitFor(() => expect(api.updateRolePermissions).toHaveBeenCalledTimes(1));
  const call = (api.updateRolePermissions as ReturnType<typeof mock>).mock.calls[0];
  expect(call[0]).toBe("t");
  expect(call[1]).toBe("r1");
  expect(call[2]).toContain("view:members");
  expect(call[2]).toContain("manage:members");
});

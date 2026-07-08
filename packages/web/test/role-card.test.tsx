import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleCard } from "@/app/(protected)/roles/role-card";
import type { DiscordRole, Permission } from "shared";

const role: DiscordRole = {
  id: "r1",
  discordRoleId: "999888777",
  name: "Admin",
  permissions: ["view:members"],
  grantsWhitelist: false,
  isMemberRole: false,
};

function baseProps(over: Record<string, unknown> = {}) {
  return {
    role,
    effectivePerms: ["view:members"] as Permission[],
    changed: false,
    isExpanded: false,
    canManage: true,
    saving: false,
    saveError: null,
    togglingWl: false,
    togglingMember: false,
    deleteOpen: false,
    onToggleExpand: mock(() => {}),
    onTogglePerm: mock((_p: Permission) => {}),
    onSelectGroup: mock(() => {}),
    onSave: mock(() => {}),
    onDiscard: mock(() => {}),
    onToggleWl: mock(() => {}),
    onToggleMember: mock(() => {}),
    onDeleteOpenChange: mock((_o: boolean) => {}),
    onConfirmDelete: mock(() => {}),
    ...over,
  };
}

test("header shows name, discord id, permission count; collapsed hides the matrix", () => {
  render(<RoleCard {...(baseProps() as any)} />);
  expect(screen.getByText("Admin")).toBeDefined();
  expect(screen.getByText("999888777")).toBeDefined();
  expect(screen.getByText("1 permission")).toBeDefined();
  // matrix hidden while collapsed
  expect(screen.queryByText("View Whitelist")).toBeNull();
});

test("clicking header calls onToggleExpand", () => {
  const props = baseProps();
  render(<RoleCard {...(props as any)} />);
  fireEvent.click(screen.getByText("Admin"));
  expect(props.onToggleExpand).toHaveBeenCalled();
});

test("unsaved badge shows when changed", () => {
  render(<RoleCard {...(baseProps({ changed: true }) as any)} />);
  expect(screen.getByText("unsaved")).toBeDefined();
});

test("expanded shows the matrix and the two switches", () => {
  render(<RoleCard {...(baseProps({ isExpanded: true }) as any)} />);
  expect(screen.getByText("View Whitelist")).toBeDefined();
  expect(screen.getByRole("switch", { name: "Grants whitelist" })).toBeDefined();
  expect(screen.getByRole("switch", { name: "Member role" })).toBeDefined();
});

test("toggling the whitelist switch (keyboard) calls onToggleWl", () => {
  const props = baseProps({ isExpanded: true });
  render(<RoleCard {...(props as any)} />);
  // Base UI Switch renders span[role=switch]; happy-dom synthetic clicks don't reach
  // its pointer handlers, so toggle via the keyboard path (Space).
  const sw = screen.getByRole("switch", { name: "Grants whitelist" });
  sw.focus();
  fireEvent.keyDown(sw, { key: " " });
  fireEvent.keyUp(sw, { key: " " });
  expect(props.onToggleWl).toHaveBeenCalled();
});

test("Save/Discard shown when changed; Save calls onSave", () => {
  const props = baseProps({ isExpanded: true, changed: true });
  render(<RoleCard {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Save Permissions" }));
  expect(props.onSave).toHaveBeenCalled();
});

test("Unregister trigger calls onDeleteOpenChange(true) without expanding", () => {
  const props = baseProps();
  render(<RoleCard {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Unregister" }));
  expect(props.onDeleteOpenChange).toHaveBeenCalledWith(true);
  expect(props.onToggleExpand).not.toHaveBeenCalled();
});

test("delete dialog open shows warning; confirm calls onConfirmDelete", () => {
  const props = baseProps({ deleteOpen: true });
  render(<RoleCard {...(props as any)} />);
  expect(
    screen.getByText("This removes the role registration and its permission assignments."),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Unregister Role" }));
  expect(props.onConfirmDelete).toHaveBeenCalled();
});

test("read-only (canManage=false): no Unregister trigger, no switches", () => {
  render(<RoleCard {...(baseProps({ canManage: false, isExpanded: true }) as any)} />);
  expect(screen.queryByRole("button", { name: "Unregister" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Grants whitelist" })).toBeNull();
});

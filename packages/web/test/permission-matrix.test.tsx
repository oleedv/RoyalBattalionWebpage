import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PermissionMatrix } from "@/app/(protected)/roles/permission-matrix";
import { getAllGroupPerms, PERMISSION_GROUPS } from "@/app/(protected)/roles/lib";
import type { Permission } from "shared";

const whitelist = PERMISSION_GROUPS.find((g) => g.id === "whitelist")!;

function setup(over: Partial<Parameters<typeof PermissionMatrix>[0]> = {}) {
  const onToggle = mock((_p: Permission) => {});
  const onSelectGroup = mock((_g: unknown, _s: boolean) => {});
  render(
    <PermissionMatrix
      effectivePerms={over.effectivePerms ?? []}
      canManage={over.canManage ?? true}
      onToggle={onToggle}
      onSelectGroup={onSelectGroup}
    />,
  );
  return { onToggle, onSelectGroup };
}

test("renders group labels and permission entry labels", () => {
  setup();
  expect(screen.getByText("Whitelist")).toBeDefined();
  expect(screen.getByText("Tickets")).toBeDefined();
  expect(screen.getByText("View Whitelist")).toBeDefined();
  expect(screen.getByText("RCON Console")).toBeDefined();
  // subgroup entry
  expect(screen.getByText("Whitelist Tier")).toBeDefined();
});

test("clicking a permission checkbox calls onToggle with its perm", () => {
  const { onToggle } = setup();
  // Click the checkbox by its aria-label (the proven happy-dom pattern from data-table-v2).
  fireEvent.click(screen.getByRole("checkbox", { name: "Manage Whitelist" }));
  expect(onToggle).toHaveBeenCalledWith("manage:whitelist");
});

test("group All button (not all selected) calls onSelectGroup with select=true", () => {
  const { onSelectGroup } = setup();
  const group = screen.getByText("Whitelist").closest('[data-group="whitelist"]')!;
  fireEvent.click(within(group as HTMLElement).getByText("All"));
  expect(onSelectGroup).toHaveBeenCalledTimes(1);
  expect((onSelectGroup.mock.calls[0][0] as { id: string }).id).toBe("whitelist");
  expect(onSelectGroup.mock.calls[0][1]).toBe(true);
});

test("group None button (all selected) calls onSelectGroup with select=false", () => {
  const { onSelectGroup } = setup({ effectivePerms: getAllGroupPerms(whitelist) as Permission[] });
  const group = screen.getByText("Whitelist").closest('[data-group="whitelist"]')!;
  fireEvent.click(within(group as HTMLElement).getByText("None"));
  expect(onSelectGroup.mock.calls[0][1]).toBe(false);
});

test("read-only (canManage=false): clicking a checkbox does not toggle and no All/None button", () => {
  const { onToggle } = setup({ canManage: false });
  fireEvent.click(screen.getByRole("checkbox", { name: "Manage Whitelist" }));
  expect(onToggle).not.toHaveBeenCalled();
  const group = screen.getByText("Whitelist").closest('[data-group="whitelist"]')!;
  expect(within(group as HTMLElement).queryByText("All")).toBeNull();
});

test("clicking a permission's description toggles it (whole-card click)", () => {
  const { onToggle } = setup({ canManage: true });
  fireEvent.click(screen.getByText("Add, edit, and remove whitelist entries"));
  expect(onToggle).toHaveBeenCalledWith("manage:whitelist");
});

test("clicking the checkbox toggles exactly once (no double-fire)", () => {
  const { onToggle } = setup({ canManage: true });
  fireEvent.click(screen.getByRole("checkbox", { name: "Manage Whitelist" }));
  expect(onToggle).toHaveBeenCalledTimes(1);
});

import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { MembersFilterPanel } from "@/app/(protected)/members/filter-panel";
import type { MemberFilters } from "@/app/(protected)/members/lib";
import type { DiscordRole } from "shared";

const EMPTY: MemberFilters = {
  search: "",
  roleIds: [],
  country: "",
  loggedIn: "all",
  playtime30: ["", ""],
  playtime90: ["", ""],
  seed30: ["", ""],
  seed90: ["", ""],
  joinFrom: "",
  joinTo: "",
  memberFrom: "",
  memberTo: "",
};

const ROLES: DiscordRole[] = [
  {
    id: "r1",
    discordRoleId: "dr1",
    name: "Member",
    permissions: [],
    grantsWhitelist: false,
    isMemberRole: true,
  },
  {
    id: "r2",
    discordRoleId: "dr2",
    name: "Admin",
    permissions: [],
    grantsWhitelist: false,
    isMemberRole: false,
  },
];

test("toggling a role chip calls setFilters with that role added to roleIds", () => {
  const setFilters = mock((_patch: Partial<MemberFilters>) => {});
  render(
    <MembersFilterPanel
      filters={EMPTY}
      setFilters={setFilters}
      allRoles={ROLES}
      onClearAll={mock(() => {})}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Member" }));
  expect(setFilters).toHaveBeenCalledWith({ roleIds: ["r1"] });
});

test("toggling an active role chip removes it from roleIds", () => {
  const setFilters = mock((_patch: Partial<MemberFilters>) => {});
  render(
    <MembersFilterPanel
      filters={{ ...EMPTY, roleIds: ["r1"] }}
      setFilters={setFilters}
      allRoles={ROLES}
      onClearAll={mock(() => {})}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Member" }));
  expect(setFilters).toHaveBeenCalledWith({ roleIds: [] });
});

test("changing the Logged-In select calls setFilters with loggedIn", () => {
  const setFilters = mock((_patch: Partial<MemberFilters>) => {});
  render(
    <MembersFilterPanel
      filters={EMPTY}
      setFilters={setFilters}
      allRoles={ROLES}
      onClearAll={mock(() => {})}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Logged In" }), { target: { value: "yes" } });
  expect(setFilters).toHaveBeenCalledWith({ loggedIn: "yes" });
});

test("clicking Clear All calls onClearAll", () => {
  const onClearAll = mock(() => {});
  render(
    <MembersFilterPanel
      filters={EMPTY}
      setFilters={mock((_patch: Partial<MemberFilters>) => {})}
      allRoles={ROLES}
      onClearAll={onClearAll}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear All" }));
  expect(onClearAll).toHaveBeenCalled();
});

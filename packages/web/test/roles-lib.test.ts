import { test, expect } from "bun:test";
import {
  PERMISSION_GROUPS,
  getAllGroupPerms,
  getGroupActiveCount,
  togglePerm,
  setGroupPerms,
  hasPendingChanges,
} from "@/app/(protected)/roles/lib";
import { PERMISSIONS, type Permission } from "shared";

const whitelist = PERMISSION_GROUPS.find((g) => g.id === "whitelist")!;
const tickets = PERMISSION_GROUPS.find((g) => g.id === "tickets")!;

test("every assignable permission is covered by exactly one group entry", () => {
  const grouped = PERMISSION_GROUPS.flatMap((g) => [
    ...g.entries.map((e) => e.perm),
    ...(g.subGroups?.flatMap((sg) => sg.entries.map((e) => e.perm)) ?? []),
  ]);
  const assignable = PERMISSIONS.filter((p) => p !== "developer");
  for (const p of assignable) expect(grouped).toContain(p);
  // no duplicates
  expect(new Set(grouped).size).toBe(grouped.length);
});

test("getAllGroupPerms includes entries and subgroup entries", () => {
  const all = getAllGroupPerms(tickets);
  expect(all).toContain("view:tickets");
  expect(all).toContain("manage:tickets");
  expect(all).toContain("view:tickets:whitelist"); // subgroup
  expect(all.length).toBe(7);
});

test("getGroupActiveCount counts active vs total across entries + subgroups", () => {
  const perms: Permission[] = ["view:tickets", "view:tickets:normal"];
  expect(getGroupActiveCount(tickets, perms)).toEqual({ active: 2, total: 7 });
});

test("togglePerm adds when absent, removes when present, without mutating input", () => {
  const cur: Permission[] = ["view:members"];
  const added = togglePerm(cur, "manage:members");
  expect(added).toEqual(["view:members", "manage:members"]);
  expect(cur).toEqual(["view:members"]); // not mutated
  expect(togglePerm(added, "view:members")).toEqual(["manage:members"]);
});

test("setGroupPerms select=true unions all group perms (deduped)", () => {
  const cur: Permission[] = ["view:whitelist"];
  const result = setGroupPerms(cur, whitelist, true);
  for (const p of getAllGroupPerms(whitelist)) expect(result).toContain(p);
  expect(new Set(result).size).toBe(result.length);
});

test("setGroupPerms select=false removes exactly the group perms, keeps others", () => {
  const cur: Permission[] = [...getAllGroupPerms(whitelist), "view:members"];
  const result = setGroupPerms(cur, whitelist, false);
  expect(result).toEqual(["view:members"]);
});

test("hasPendingChanges: undefined pending is false", () => {
  expect(hasPendingChanges(undefined, ["view:members"])).toBe(false);
});

test("hasPendingChanges: different length is true", () => {
  expect(hasPendingChanges(["view:members"], [])).toBe(true);
});

test("hasPendingChanges: same set (any order) is false", () => {
  expect(hasPendingChanges(["a", "b"] as unknown as Permission[], ["b", "a"] as unknown as Permission[])).toBe(false);
});

test("hasPendingChanges: same length different members is true", () => {
  expect(hasPendingChanges(["view:members"], ["manage:members"])).toBe(true);
});

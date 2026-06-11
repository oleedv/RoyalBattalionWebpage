import { test, expect } from "bun:test";
import { NAV_GROUPS, filterNavGroups } from "@/components/shell/nav-config";

test("nav groups cover the three sections", () => {
  expect(NAV_GROUPS.map((g) => g.label)).toEqual([
    "Operations",
    "Community",
    "System",
  ]);
});

test("a single matching permission reveals its item via any-match", () => {
  const groups = filterNavGroups(["view:whitelist"]);
  const hrefs = groups.flatMap((g) => g.items).map((i) => i.href);
  expect(hrefs).toContain("/whitelist");
  expect(hrefs).not.toContain("/roles");
});

test("members permission also reveals discord-users (shared perms)", () => {
  const groups = filterNavGroups(["view:members"]);
  const hrefs = groups.flatMap((g) => g.items).map((i) => i.href);
  expect(hrefs).toContain("/members");
  expect(hrefs).toContain("/discord-users");
});

test("developer sees every item", () => {
  const groups = filterNavGroups(["developer"]);
  const count = groups.flatMap((g) => g.items).length;
  expect(count).toBe(NAV_GROUPS.flatMap((g) => g.items).length);
});

test("no permissions hides all gated groups", () => {
  expect(filterNavGroups([])).toEqual([]);
});

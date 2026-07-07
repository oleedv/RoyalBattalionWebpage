import { test, expect } from "bun:test";
import { NAV_GROUPS, filterNavGroups } from "@/components/shell/nav-config";

const allItems = () => NAV_GROUPS.flatMap((g) => g.items);

test("nav groups cover the three sections", () => {
  expect(NAV_GROUPS.map((g) => g.label)).toEqual([
    "Operations",
    "Community",
    "System",
  ]);
});

test("spec reconciliation: seeding, match manager, api docs in; lobby out", () => {
  const byHref = Object.fromEntries(allItems().map((i) => [i.href, i]));
  expect(byHref["/seeding"].label).toBe("Seeding");
  expect(byHref["/seeding-tracker"]).toBeUndefined();
  expect(byHref["/match-manager"].label).toBe("Match Manager");
  expect(byHref["/api-docs"].requiredPermissions).toEqual(["developer"]);
  expect(byHref["/lobby-monitor"]).toBeUndefined();
});

test("standalone manage:rcon-console reaches Live Server", () => {
  const groups = filterNavGroups(["manage:rcon-console"]);
  const hrefs = groups.flatMap((g) => g.items).map((i) => i.href);
  expect(hrefs).toContain("/live-server");
});

test("seeding visible to view:seeding-tracker and to manage:discord-bot", () => {
  for (const perm of ["view:seeding-tracker", "manage:discord-bot"]) {
    const hrefs = filterNavGroups([perm])
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(hrefs).toContain("/seeding");
  }
});

test("a single matching permission reveals its item via any-match", () => {
  const groups = filterNavGroups(["view:whitelist"]);
  const hrefs = groups.flatMap((g) => g.items).map((i) => i.href);
  expect(hrefs).toContain("/whitelist");
  expect(hrefs).not.toContain("/roles");
});

test("developer sees every item", () => {
  const groups = filterNavGroups(["developer"]);
  expect(groups.flatMap((g) => g.items).length).toBe(allItems().length);
});

test("no permissions hides all gated groups", () => {
  expect(filterNavGroups([])).toEqual([]);
});

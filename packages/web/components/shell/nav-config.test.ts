import { describe, expect, test } from "bun:test";
import { filterNavGroups, NAV_GROUPS } from "./nav-config";

describe("Prospects nav", () => {
  test("lists a Prospects item with the three new permissions", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/prospects");
    expect(item).toBeTruthy();
    expect(item?.requiredPermissions).toEqual([
      "view:prospects",
      "view:prospect-settings",
      "manage:prospects",
    ]);
  });

  test("view:tickets does not reveal Prospects", () => {
    const groups = filterNavGroups(["view:tickets"]);
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/prospects");
    expect(hrefs).toContain("/tickets");
  });

  test("view:prospect-settings reveals Prospects", () => {
    const groups = filterNavGroups(["view:prospect-settings"]);
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/prospects");
  });
});

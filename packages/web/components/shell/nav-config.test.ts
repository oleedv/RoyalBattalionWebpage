import { describe, expect, test } from "bun:test";
import { filterNavGroups, NAV_GROUPS } from "./nav-config";

describe("Whitelist nav", () => {
  test("lists Whitelist with view and manage permissions", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/whitelist");
    expect(item).toBeTruthy();
    expect(item?.requiredPermissions).toEqual(["view:whitelist", "manage:whitelist"]);
  });

  test("view:whitelist reveals Whitelist", () => {
    const groups = filterNavGroups(["view:whitelist"]);
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/whitelist");
  });

  test("manage:whitelist reveals Whitelist", () => {
    const groups = filterNavGroups(["manage:whitelist"]);
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/whitelist");
  });

  test("unrelated permissions do not reveal Whitelist", () => {
    const groups = filterNavGroups(["view:tickets"]);
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/whitelist");
  });
});

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

describe("API tokens nav", () => {
  test("manage:api-tokens reveals API Tokens but not via view:api-docs", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/api-tokens");
    expect(item?.requiredPermissions).toEqual(["manage:api-tokens"]);
    expect(filterNavGroups(["view:api-docs"]).flatMap((g) => g.items.map((i) => i.href))).not.toContain(
      "/api-tokens",
    );
    expect(filterNavGroups(["view:api-docs"]).flatMap((g) => g.items.map((i) => i.href))).toContain(
      "/api-docs",
    );
    expect(filterNavGroups(["manage:api-tokens"]).flatMap((g) => g.items.map((i) => i.href))).toContain(
      "/api-tokens",
    );
  });
});

describe("Giveaway nav", () => {
  test("manage:giveaway-tickets reveals Giveaway", () => {
    const groups = filterNavGroups(["manage:giveaway-tickets"]);
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/giveaway");
  });

  test("lists Giveaway with view, manage, and ticket-adjust permissions", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/giveaway");
    expect(item?.requiredPermissions).toEqual([
      "view:giveaway",
      "manage:giveaway",
      "manage:giveaway-tickets",
    ]);
  });
});

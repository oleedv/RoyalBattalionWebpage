import { describe, expect, test } from "bun:test";
import { EXTRA_GRANTABLE, mergePermissions, sanitizeExtraPermissions } from "./extra-permissions";
import type { Permission } from "shared";

describe("mergePermissions", () => {
  test("unions role perms with extras and dedupes", () => {
    const merged = mergePermissions(
      ["view:members", "view:api-docs"] as Permission[],
      ["view:api-docs", "manage:roles"] as Permission[],
    );
    expect(merged.sort()).toEqual(["manage:roles", "view:api-docs", "view:members"]);
  });
});

describe("sanitizeExtraPermissions", () => {
  test("keeps only allowlisted extras", () => {
    expect(EXTRA_GRANTABLE).toEqual(["view:api-docs"]);
    expect(sanitizeExtraPermissions(["view:api-docs", "developer", "manage:whitelist"])).toEqual([
      "view:api-docs",
    ]);
  });
});

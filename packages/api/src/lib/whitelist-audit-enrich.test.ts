import { describe, expect, test } from "bun:test";
import { fillMissingWhitelistTarget } from "./whitelist-audit-enrich";

describe("fillMissingWhitelistTarget", () => {
  test("fills missing name and steamId from the live entry", () => {
    const detail = { source: "sl-reward", changes: { expiresAt: { extendedByDays: 7 } } };
    expect(fillMissingWhitelistTarget(detail, { name: "Lind", steamId: "76561198819769429" })).toEqual({
      name: "Lind",
      steamId: "76561198819769429",
      source: "sl-reward",
      changes: { expiresAt: { extendedByDays: 7 } },
    });
  });

  test("does not overwrite a stored name or steamId", () => {
    const filled = fillMissingWhitelistTarget(
      { name: "OldName", steamId: "111" },
      { name: "NewName", steamId: "222" },
    );
    expect(filled?.name).toBe("OldName");
    expect(filled?.steamId).toBe("111");
  });

  test("returns the original detail when no live entry exists", () => {
    const detail = { source: "sl-reward" };
    expect(fillMissingWhitelistTarget(detail, undefined)).toBe(detail);
  });

  test("fills from a live entry when stored detail is null", () => {
    expect(fillMissingWhitelistTarget(null, { name: "Lind", steamId: "76561198819769429" })).toEqual({
      name: "Lind",
      steamId: "76561198819769429",
    });
  });
});

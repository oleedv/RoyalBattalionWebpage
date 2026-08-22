import { describe, expect, test } from "bun:test";
import {
  formatExtendedByDays,
  formatWhitelistActionSummary,
  whitelistSubject,
} from "./whitelist-audit-detail";

describe("whitelistSubject", () => {
  test("formats name and steamId together", () => {
    expect(whitelistSubject({ name: "Lind", steamId: "76561198819769429" }))
      .toBe("Lind (76561198819769429)");
  });

  test("falls back to name only", () => {
    expect(whitelistSubject({ name: "Lind" })).toBe("Lind");
  });

  test("falls back to steamId only", () => {
    expect(whitelistSubject({ steamId: "76561198819769429" })).toBe("76561198819769429");
  });

  test("returns empty when neither is present", () => {
    expect(whitelistSubject({ source: "sl-reward" })).toBe("");
  });
});

describe("formatExtendedByDays", () => {
  test("formats a 7-day extension", () => {
    expect(formatExtendedByDays({ extendedByDays: 7 })).toBe("+7 days");
  });

  test("uses singular for one day", () => {
    expect(formatExtendedByDays({ extendedByDays: 1 })).toBe("+1 day");
  });

  test("returns null for unrelated objects", () => {
    expect(formatExtendedByDays({ from: "a", to: "b" })).toBeNull();
  });
});

describe("formatWhitelistActionSummary", () => {
  test("SL reward extend shows updated entry on the player", () => {
    expect(formatWhitelistActionSummary("whitelist.update", {
      source: "sl-reward",
      name: "Lind",
      steamId: "76561198819769429",
      changes: { expiresAt: { extendedByDays: 7 } },
    })).toBe("Updated entry on Lind (76561198819769429) · Expires +7 days");
  });

  test("update without identity still describes the change", () => {
    expect(formatWhitelistActionSummary("whitelist.update", {
      source: "sl-reward",
      changes: { expiresAt: { extendedByDays: 7 } },
    })).toBe("Updated entry · Expires +7 days");
  });

  test("plain update names the player", () => {
    expect(formatWhitelistActionSummary("whitelist.update", {
      name: "Lind",
      steamId: "76561198819769429",
    })).toBe("Updated entry on Lind (76561198819769429)");
  });

  test("from-to change parts follow the player", () => {
    expect(formatWhitelistActionSummary("whitelist.update", {
      name: "Lind",
      steamId: "76561198819769429",
    }, ["Role: Seeder → Member"])).toBe("Updated entry on Lind (76561198819769429) · Role: Seeder → Member");
  });

  test("add includes name and steamId", () => {
    expect(formatWhitelistActionSummary("whitelist.add", {
      name: "Lind",
      steamId: "76561198819769429",
      server: "main",
    })).toBe("Added Lind (76561198819769429) on main");
  });

  test("delete includes name and steamId", () => {
    expect(formatWhitelistActionSummary("whitelist.delete", {
      name: "Lind",
      steamId: "76561198819769429",
      server: "main",
    })).toBe("Removed Lind (76561198819769429) from main");
  });

  test("comment add prefixes the player", () => {
    expect(formatWhitelistActionSummary("whitelist.comment.add", {
      name: "Lind",
      steamId: "76561198819769429",
      textPreview: "hello",
    })).toBe('Lind (76561198819769429) · Commented: "hello"');
  });

  test("comment delete prefixes the player", () => {
    expect(formatWhitelistActionSummary("whitelist.comment.delete", {
      name: "Lind",
      steamId: "76561198819769429",
    })).toBe("Lind (76561198819769429) · Deleted comment");
  });
});

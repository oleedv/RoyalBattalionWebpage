import { test, expect } from "bun:test";
import {
  formatExpiry,
  wlReadableValue,
  wlReadableChanges,
  getActionVerb,
  getActionLabel,
  getActionTone,
  getDetailSummary,
  parseImportLines,
  classifyImportRows,
  importCounts,
  formatImportResult,
  generateCfgContent,
} from "@/app/(protected)/whitelist/lib";
import type { AdminGroup, Clan, WhitelistEntry, AuditLogEntry } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 2, createdAt: "" },
  { id: "g2", name: "SuperAdmin", permissions: "ban,kick", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [
  { id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" },
];

function entry(over: Partial<WhitelistEntry>): WhitelistEntry {
  return {
    id: "e1", steamId: "76561198000000001", server: "main", name: "Olie",
    clan: "RB", clanId: "c1", clanName: "Royal Battalion", role: null,
    groupId: "g1", groupName: "Whitelist", userId: null, addedBy: "x",
    reason: null, expiresAt: null, createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

test("formatExpiry: null, expired, days and hours", () => {
  expect(formatExpiry(null)).toBeNull();
  expect(formatExpiry(new Date(Date.now() - 1000).toISOString())).toEqual({
    label: "Expired",
    expired: true,
  });
  const twoDays = formatExpiry(new Date(Date.now() + 2 * 86400000 + 3600000).toISOString());
  expect(twoDays).toEqual({ label: "2d left", expired: false });
  const fiveHours = formatExpiry(new Date(Date.now() + 5 * 3600000 + 60000).toISOString());
  expect(fiveHours).toEqual({ label: "5h left", expired: false });
});

test("wlReadableValue resolves ids, dates and empties", () => {
  expect(wlReadableValue("groupId", "g2", groups, clans)).toBe("SuperAdmin");
  expect(wlReadableValue("clanId", "c1", groups, clans)).toBe("Royal Battalion");
  expect(wlReadableValue("groupId", "missing", groups, clans)).toBe("missing");
  expect(wlReadableValue("name", null, groups, clans)).toBe("—");
  expect(wlReadableValue("steamIds", ["1", "2"], groups, clans)).toBe("1, 2");
});

test("wlReadableChanges maps from/to and drops clanId when clan is present", () => {
  const changes = {
    clan: { from: null, to: "RB" },
    clanId: { from: null, to: "c1" },
    groupId: { from: "g1", to: "g2" },
    junk: "not-a-change",
  };
  const out = wlReadableChanges(changes, groups, clans);
  expect(out.map((c) => c.key)).toEqual(["clan", "groupId"]);
  const grp = out.find((c) => c.key === "groupId")!;
  expect(grp.label).toBe("Group");
  expect(grp.from).toBe("Whitelist");
  expect(grp.to).toBe("SuperAdmin");
});

test("action verb, label and tone", () => {
  expect(getActionVerb("whitelist.add")).toBe("added this entry");
  expect(getActionVerb("unknown.thing")).toBe("unknown.thing");
  expect(getActionLabel("whitelist.comment.add")).toBe("add");
  expect(getActionTone("whitelist.delete")).toBe("danger");
  expect(getActionTone("whitelist.bulk_add")).toBe("success");
  expect(getActionTone("whitelist.update")).toBe("warning");
  expect(getActionTone("whitelist.something")).toBe("accent");
});

test("getDetailSummary covers add, update overflow and comment trim", () => {
  const add: AuditLogEntry = {
    id: "1", userId: "u", userName: "Ole", action: "whitelist.add",
    resource: "WhitelistEntry", resourceId: "e1",
    detail: { name: "Olie", server: "main" }, createdAt: "",
  };
  expect(getDetailSummary(add, groups, clans)).toBe("Added Olie on main");

  const update: AuditLogEntry = {
    ...add,
    action: "whitelist.update",
    detail: {
      changes: {
        name: { from: "A", to: "B" },
        reason: { from: null, to: "vip" },
        groupId: { from: "g1", to: "g2" },
      },
    },
  };
  const summary = getDetailSummary(update, groups, clans);
  expect(summary).toContain("Name: A → B");
  expect(summary).toContain("+1 more");

  const longText = "x".repeat(80);
  const comment: AuditLogEntry = {
    ...add,
    action: "whitelist.comment.add",
    detail: { textPreview: longText },
  };
  expect(getDetailSummary(comment, groups, clans)).toBe(
    `Commented: "${"x".repeat(60)}…"`,
  );
});

test("parseImportLines handles both formats, sections and errors", () => {
  const text = [
    "Group=Whitelist:reserve",
    "// RB",
    "Admin=76561198000000001:Whitelist // Olie",
    "// No Clan",
    "Admin=76561198000000002:SuperAdmin",
    "garbage line",
  ].join("\n");
  const rows = parseImportLines(text, clans, groups);
  expect(rows.length).toBe(3);
  expect(rows[0]).toEqual({
    clanId: "c1", steamId: "76561198000000001", role: "Whitelist",
    groupId: "g1", name: "Olie", error: false,
  });
  expect(rows[1]).toEqual({
    clanId: "", steamId: "76561198000000002", role: "SuperAdmin",
    groupId: "g2", name: "", error: false,
  });
  expect(rows[2].error).toBe(true);
});

test("classifyImportRows and importCounts", () => {
  const rows = [
    { steamId: "76561198000000001", name: "", clanId: "", role: "", groupId: "", error: false }, // existing
    { steamId: "9", name: "", clanId: "", role: "", groupId: "", error: false }, // new
    { steamId: "9", name: "", clanId: "", role: "", groupId: "", error: false }, // batch dupe
    { steamId: "", name: "", clanId: "", role: "", groupId: "", error: true }, // error
  ];
  const map = classifyImportRows(rows, [entry({})]);
  expect(map.get(0)).toBe("existing");
  expect(map.get(1)).toBeUndefined();
  expect(map.get(2)).toBe("batch");
  expect(importCounts(rows, map)).toEqual({
    newCount: 1, existingCount: 1, batchCount: 1, errorCount: 1,
  });
});

test("formatImportResult summarizes skips", () => {
  const msg = formatImportResult(
    2,
    [
      { steamId: "1", reason: "duplicate_in_batch" },
      { steamId: "2", reason: "duplicate_existing", existingName: "Bob", existingExpiresAt: "2020-01-02T00:00:00Z" },
    ],
    new Date("2026-01-01").getTime(),
  );
  expect(msg).toContain("Imported 2 entries");
  expect(msg).toContain("1 (duplicate in batch)");
  expect(msg).toContain('2 (already whitelisted as "Bob", expired 2020-01-02)');
});

test("generateCfgContent groups by clan, sorts groups, drops expired", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const cfg = generateCfgContent(
    [
      entry({}),
      entry({ id: "e2", steamId: "2", name: null, clan: null, clanName: null, groupName: null, role: "Admin" }),
      entry({ id: "e3", steamId: "3", expiresAt: "2020-01-01T00:00:00Z" }),
    ],
    groups,
    "main",
    now,
  );
  const lines = cfg.split("\n");
  expect(lines[1]).toBe("// Royal Battalion Whitelist");
  expect(lines[3]).toBe("// Server: main");
  // groups sorted by sortOrder: SuperAdmin (1) before Whitelist (2)
  expect(cfg.indexOf("Group=SuperAdmin:ban,kick")).toBeLessThan(cfg.indexOf("Group=Whitelist:reserve"));
  // clan sections: RB before No Clan
  expect(cfg.indexOf("// RB")).toBeLessThan(cfg.indexOf("// No Clan"));
  expect(cfg).toContain("Admin=76561198000000001:Whitelist // Olie");
  expect(cfg).toContain("Admin=2:Admin // 2"); // role fallback + steamId as name
  expect(cfg).not.toContain("Admin=3:"); // expired dropped
});

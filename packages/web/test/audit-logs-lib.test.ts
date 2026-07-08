// packages/web/test/audit-logs-lib.test.ts
import { test, expect } from "bun:test";
import { formatAction, actionTone, formatDetailSummary, toAuditDetail } from "@/app/(protected)/audit-logs/lib";

test("formatAction humanises dotted/underscored actions", () => {
  expect(formatAction("rcon.switchteam")).toBe("Rcon Switchteam");
  expect(formatAction("whitelist.add")).toBe("Whitelist Add");
});

test("actionTone maps prefixes to semantic tones (no raw palette)", () => {
  expect(actionTone("whitelist.add")).toBe("success");
  expect(actionTone("member.disable")).toBe("success");
  expect(actionTone("role.update")).toBe("accent");
  expect(actionTone("admin_group.create")).toBe("warning");
  expect(actionTone("server_config.update")).toBe("danger");
  expect(actionTone("rcon.kick")).toBe("danger");
  expect(actionTone("mystery.thing")).toBe("neutral");
});

test("formatDetailSummary renders known action summaries", () => {
  expect(formatDetailSummary("rcon.warn", { playerName: "Bob", message: "stop" })).toBe('Warned Bob -- "stop"');
  expect(formatDetailSummary("whitelist.add", { name: "Al", server: "main" })).toBe("Added Al on main");
  expect(formatDetailSummary("unknown", { x: 1 })).toBeNull();
});

test("toAuditDetail flattens detail into fields + raw", () => {
  const r = toAuditDetail({ name: "Al", nested: { a: 1 } });
  expect(r.fields).toContainEqual({ label: "name", value: "Al" });
  expect(r.fields).toContainEqual({ label: "nested", value: '{"a":1}' });
  expect(r.raw).toEqual({ name: "Al", nested: { a: 1 } });
  expect(toAuditDetail(null)).toEqual({ fields: [], raw: null });
});

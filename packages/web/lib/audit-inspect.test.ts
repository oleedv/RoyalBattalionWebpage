import { describe, expect, test } from "bun:test";
import type { AuditLogEntry } from "shared";
import {
  extractChanges,
  formatActionLabel,
  formatAuditSummary,
  formatResourceLabel,
  inspectAuditLog,
} from "./audit-inspect";

function entry(partial: Partial<AuditLogEntry> & Pick<AuditLogEntry, "action">): AuditLogEntry {
  return {
    id: "log-1",
    userId: "actor-1",
    userName: "StaffMember",
    resource: "user",
    resourceId: "res-1",
    detail: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    ...partial,
  };
}

describe("formatAuditSummary", () => {
  test("empty rcon.endmatch still describes the action", () => {
    expect(formatAuditSummary("rcon.endmatch", {})).toBe("Ended the current match");
    expect(formatAuditSummary("rcon.endmatch", { layer: "Al Basrah RAAS v1" }))
      .toBe("Ended match on Al Basrah RAAS v1");
  });

  test("warn includes player and message", () => {
    expect(formatAuditSummary("rcon.warn", {
      playerName: "Lind",
      message: "stop teamkilling",
    })).toBe('Warned Lind · "stop teamkilling"');
  });

  test("switchteam names the player", () => {
    expect(formatAuditSummary("rcon.switchteam", { playerName: "Lind" }))
      .toBe("Moved Lind to the other team");
  });

  test("member comment with no target still says what happened", () => {
    expect(formatAuditSummary("member.comment.add", { commentId: "c1" }))
      .toBe("Added a member comment");
  });

  test("giveaway draw without prize still says draw", () => {
    expect(formatAuditSummary("giveaway.draw", null)).toBe("Drew the giveaway");
  });

  test("unknown actions are humanized", () => {
    expect(formatAuditSummary("foo.bar_baz", null)).toBe("Foo Bar Baz");
  });
});

describe("inspectAuditLog", () => {
  test("empty detail still exposes actor, action, resource, and a summary", () => {
    const view = inspectAuditLog(entry({
      action: "rcon.endmatch",
      resource: "LiveServer",
      resourceId: "main",
      detail: {},
    }));
    expect(view.summary).toBe("Ended the current match");
    expect(view.actorName).toBe("StaffMember");
    expect(view.actorId).toBe("actor-1");
    expect(view.resourceLabel).toBe("Live server");
    expect(view.resourceId).toBe("main");
    expect(view.people[0]).toEqual({ label: "Actor", name: "StaffMember", id: "actor-1" });
    expect(view.fields).toEqual([]);
  });

  test("extracts actor and target people for click-to-filter", () => {
    const view = inspectAuditLog(entry({
      action: "member.disable",
      detail: { targetName: "Lind", reason: "inactive", steamId: "76561198000000000" },
    }));
    expect(view.people.map((p) => p.name)).toEqual(["StaffMember", "Lind"]);
    expect(view.fields.find((f) => f.key === "steamId")?.copyable).toBe(true);
    expect(view.fields.find((f) => f.key === "targetName")?.filterValue).toBe("Lind");
  });

  test("lists involved players from name arrays", () => {
    const view = inspectAuditLog(entry({
      action: "rcon.switchsquad",
      resource: "LiveServer",
      detail: { count: 3, playerNames: ["A", "B", "C"] },
    }));
    expect(view.people.map((p) => p.name)).toEqual(["StaffMember", "A", "B", "C"]);
    expect(view.summary).toContain("Moved 3 players");
  });

  test("from/to changes become readable rows", () => {
    const view = inspectAuditLog(entry({
      action: "whitelist.update",
      resource: "WhitelistEntry",
      detail: {
        name: "Lind",
        steamId: "76561198819769429",
        changes: { role: { from: "Seeder", to: "Member" } },
      },
    }));
    expect(view.changes).toEqual([
      { key: "role", label: "Role", from: "Seeder", to: "Member" },
    ]);
    expect(view.summary).toContain("Lind");
  });
});

describe("extractChanges", () => {
  test("plain patch bodies become set-to rows", () => {
    expect(extractChanges({ country: "Norway", steamId: "123" })).toEqual([
      { key: "country", label: "Country", to: "Norway" },
      { key: "steamId", label: "Steam ID", to: "123" },
    ]);
  });
});

describe("labels", () => {
  test("humanizes action and resource", () => {
    expect(formatActionLabel("member.bulk_disable")).toBe("Member Bulk Disable");
    expect(formatResourceLabel("WhitelistEntry")).toBe("Whitelist entry");
    expect(formatResourceLabel("ticket_timeout")).toBe("Ticket timeout");
  });
});

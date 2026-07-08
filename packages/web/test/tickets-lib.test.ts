import { test, expect } from "bun:test";
import type { Ticket, LegacyTicket, Prospect, Permission } from "shared";
import {
  exportTicketText,
  exportLegacyTicketText,
  exportProspectText,
  parseAttachments,
  isImageUrl,
  getVisibleTiers,
  TIER_COLORS,
} from "@/app/(protected)/tickets/lib";

const ticket: Ticket = {
  id: 7, uuid: "u-7", channelId: "c", userId: "111",
  status: "closed", tier: "normal",
  createdAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-02T00:00:00.000Z", closedBy: "222",
  events: [{ id: 1, ticketId: 7, eventType: "created", actorId: "111", detail: null, createdAt: "2026-01-01T00:00:00.000Z" }],
  messages: [{ id: 1, ticketId: 7, authorId: "111", authorTag: "User#1", content: "hi", attachments: null, isStaff: false, createdAt: "2026-01-01T00:00:00.000Z" }],
};

test("exportTicketText includes header, timeline and messages", () => {
  const out = exportTicketText(ticket);
  expect(out).toContain("Ticket #7 [closed] - normal");
  expect(out).toContain("UUID: u-7");
  expect(out).toContain("--- Timeline ---");
  expect(out).toContain("--- Messages ---");
  expect(out).toContain("User#1");
});

test("exportLegacyTicketText and exportProspectText render their headers", () => {
  const legacy: LegacyTicket = {
    id: 3, uuid: "l-3", threadNumber: 12, userId: "9", username: "bob",
    nickname: null, previousThreads: null, startedAt: "2026-01-01T00:00:00.000Z", closedAt: null, messages: [],
  };
  expect(exportLegacyTicketText(legacy)).toContain("Legacy Ticket #3 [closed]");
  const prospect = {
    id: 5, uuid: "p-5", channelId: "c", userId: "9", status: "open", alias: "Alfa",
    nationality: "NO", dateOfBirth: "2000", squadHours: 10, preferredRoles: "SL", prevClan: "",
    whyRb: "because", activeHours: "eve", competitive: "yes", steamId: "765", mentorId: null,
    pausedAt: null, extraDays: 0, createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
  } as Prospect;
  expect(exportProspectText(prospect)).toContain("Prospect: Alfa [open]");
  expect(exportProspectText(prospect)).toContain("Why Royal Battalion?");
});

test("parseAttachments handles arrays, JSON, comma-strings and null", () => {
  expect(parseAttachments(null)).toEqual([]);
  expect(parseAttachments(["a", "b"])).toEqual(["a", "b"]);
  expect(parseAttachments('["x","y"]')).toEqual(["x", "y"]);
  expect(parseAttachments("p, q ,r")).toEqual(["p", "q", "r"]);
});

test("isImageUrl matches image extensions and discord cdn", () => {
  expect(isImageUrl("https://x/y.png")).toBe(true);
  expect(isImageUrl("https://cdn.discordapp.com/whatever")).toBe(true);
  expect(isImageUrl("https://x/y.txt")).toBe(false);
});

test("getVisibleTiers grants all tiers to broad perms, else granular", () => {
  expect(getVisibleTiers(["developer"] as Permission[])).toHaveLength(5);
  expect(getVisibleTiers(["view:tickets"] as Permission[])).toHaveLength(5);
  expect(getVisibleTiers(["view:tickets:normal"] as Permission[])).toEqual(["normal"]);
  expect(getVisibleTiers([] as Permission[])).toEqual([]);
});

test("TIER_COLORS uses only design tokens (no raw palette)", () => {
  const joined = Object.values(TIER_COLORS).join(" ");
  expect(joined).not.toMatch(/blue-\d|emerald-\d/);
});

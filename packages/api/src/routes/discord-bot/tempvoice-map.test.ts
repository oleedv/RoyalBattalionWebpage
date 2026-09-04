import { expect, test } from "bun:test";
import { mapChannel, mapEvent, parseIdList, statsFromChannels } from "./tempvoice-map";

test("parseIdList accepts JSON string, array, and junk", () => {
  expect(parseIdList('["1","2"]')).toEqual(["1", "2"]);
  expect(parseIdList(["3", 4])).toEqual(["3", "4"]);
  expect(parseIdList("nope")).toEqual([]);
  expect(parseIdList(null)).toEqual([]);
});

test("mapChannel flattens a secretary DB row", () => {
  const ch = mapChannel({
    id: 7,
    channel_id: "111",
    owner_id: "222",
    guild_id: "333",
    panel_message_id: null,
    channel_name: "Raid VC",
    user_limit: 8,
    bitrate: 96000,
    region: "rotterdam",
    is_locked: 1,
    is_invisible: 0,
    is_chat_closed: 1,
    is_dnd: 0,
    member_count: 2,
    member_ids: '["222","444"]',
    trusted_ids: ["555"],
    blocked_ids: null,
    created_at: "2026-09-04T10:00:00.000Z",
    last_activity: "2026-09-04T10:05:00.000Z",
    snapshot_at: "2026-09-04T10:05:00.000Z",
  });
  expect(ch.name).toBe("Raid VC");
  expect(ch.isLocked).toBe(true);
  expect(ch.isChatClosed).toBe(true);
  expect(ch.memberIds).toEqual(["222", "444"]);
  expect(ch.trustedIds).toEqual(["555"]);
  expect(ch.blockedIds).toEqual([]);
});

test("mapEvent falls back to other for unknown types", () => {
  const ev = mapEvent({
    id: 1,
    event_type: "mystery",
    channel_id: "111",
    channel_name: "Raid VC",
    actor_id: "222",
    owner_id: "222",
    details: '{"title":"Mystery"}',
    created_at: "2026-09-04T10:00:00.000Z",
  });
  expect(ev.eventType).toBe("other");
  expect(ev.details).toEqual({ title: "Mystery" });
});

test("statsFromChannels aggregates occupancy and flags", () => {
  const a = mapChannel({
    id: 1, channel_id: "1", owner_id: "a", guild_id: "g",
    is_locked: 1, is_invisible: 0, is_dnd: 1, member_count: 3,
    created_at: "2026-09-04T08:00:00.000Z", last_activity: "2026-09-04T08:00:00.000Z",
  });
  const b = mapChannel({
    id: 2, channel_id: "2", owner_id: "b", guild_id: "g",
    is_locked: 0, is_invisible: 1, is_dnd: 0, member_count: 1,
    created_at: "2026-09-04T09:00:00.000Z", last_activity: "2026-09-04T09:00:00.000Z",
  });
  const stats = statsFromChannels([a, b], 4, 2, [0, 1]);
  expect(stats.activeChannels).toBe(2);
  expect(stats.peopleInVoice).toBe(4);
  expect(stats.lockedChannels).toBe(1);
  expect(stats.invisibleChannels).toBe(1);
  expect(stats.dndChannels).toBe(1);
  expect(stats.uniqueOwners).toBe(2);
  expect(stats.createdToday).toBe(4);
  expect(stats.hourlyCreated).toHaveLength(24);
  expect(stats.hourlyCreated[1]).toBe(1);
});

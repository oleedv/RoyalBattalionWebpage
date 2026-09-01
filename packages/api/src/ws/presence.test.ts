import { expect, test } from "bun:test";
import type { Permission } from "shared";
import type { WSData } from "./types";
import { setHidePresence, visiblePresenceUsers } from "./presence";

function data(overrides: Partial<WSData> = {}): WSData {
  return {
    wsType: "presence",
    userId: "u1",
    userName: "dev",
    displayName: "Dev",
    avatarUrl: null,
    permissions: ["developer"],
    canManage: true,
    canView: true,
    serverKey: "",
    currentPage: "/dashboard",
    hidePresence: false,
    ...overrides,
  };
}

test("setHidePresence hides a developer", () => {
  const d = data();
  expect(setHidePresence(d, true)).toBe(true);
  expect(d.hidePresence).toBe(true);
});

test("setHidePresence ignores hide requests from non-developers", () => {
  const d = data({ permissions: ["view:members"] as Permission[] });
  expect(setHidePresence(d, true)).toBe(false);
  expect(d.hidePresence).toBe(false);
});

test("visiblePresenceUsers omits hidden developers", () => {
  const hidden = { data: data({ userId: "hidden", hidePresence: true }) };
  const visible = { data: data({ userId: "shown", userName: "shown", hidePresence: false }) };
  const users = visiblePresenceUsers([hidden, visible]);
  expect(users.map((u) => u.userId)).toEqual(["shown"]);
});

import { test, expect } from "bun:test";
import { filterDiscordUsers } from "@/app/(protected)/discord-users/lib";
import type { UserWithRolesAndComments } from "shared";

function makeUser(over: Partial<UserWithRolesAndComments>): UserWithRolesAndComments {
  return {
    id: "u1",
    discordId: "111111111111111111",
    discordName: "Alice#0001",
    displayName: "Alice",
    steamId: null,
    eosId: null,
    avatarUrl: null,
    country: null,
    membershipDate: null,
    dateOfBirth: null,
    birthdayOptOut: false,
    birthdayShowAge: false,
    hasLoggedIn: true,
    disabled: false,
    disabledAt: null,
    disabledReason: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    roles: [],
    comments: [],
    playtime30: 0,
    playtime90: 0,
    seed30: 0,
    seed90: 0,
    ...over,
  };
}

const MEMBER_ROLE = { id: "role-member", discordRoleId: "discord-role-member", name: "Member" };
const GUEST_ROLE = { id: "role-guest", discordRoleId: "discord-role-guest", name: "Guest" };

const memberUser = makeUser({
  id: "u1",
  discordId: "111111111111111111",
  discordName: "Alice#0001",
  displayName: "Alice",
  steamId: "76561198000000001",
  eosId: "eos-alice",
  roles: [MEMBER_ROLE],
});

const nonMemberUser = makeUser({
  id: "u2",
  discordId: "222222222222222222",
  discordName: "Bob#0002",
  displayName: null,
  steamId: "76561198000000002",
  eosId: "eos-bob",
  roles: [GUEST_ROLE],
});

const prospectUser = makeUser({
  id: "u3",
  discordId: "333333333333333333",
  discordName: "Charlie#0003",
  displayName: "Charlie",
  steamId: null,
  eosId: null,
  roles: [],
});

const allUsers = [memberUser, nonMemberUser, prospectUser];
const memberRoleIds = new Set([MEMBER_ROLE.id]);
const emptyRoleIds = new Set<string>();

// --- non-member filter ---

test("excludes users with a member role when memberRoleIds is non-empty", () => {
  const result = filterDiscordUsers(allUsers, memberRoleIds, "");
  expect(result.map((u) => u.id)).toEqual(["u2", "u3"]);
});

test("passes all users when memberRoleIds is empty", () => {
  const result = filterDiscordUsers(allUsers, emptyRoleIds, "");
  expect(result.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
});

// --- search ---

test("search matches discordName case-insensitively", () => {
  const result = filterDiscordUsers(allUsers, emptyRoleIds, "alice");
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

test("search matches displayName case-insensitively", () => {
  const result = filterDiscordUsers(allUsers, emptyRoleIds, "charlie");
  expect(result.map((u) => u.id)).toEqual(["u3"]);
});

test("search matches steamId with raw (case-sensitive) string", () => {
  const result = filterDiscordUsers(allUsers, emptyRoleIds, "76561198000000002");
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

test("search matches eosId with raw string", () => {
  const result = filterDiscordUsers(allUsers, emptyRoleIds, "eos-alice");
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

test("search matches discordId with raw string", () => {
  const result = filterDiscordUsers(allUsers, emptyRoleIds, "333333333333333333");
  expect(result.map((u) => u.id)).toEqual(["u3"]);
});

test("non-member filter and search compose: member excluded, remaining searched", () => {
  // memberUser (u1) is excluded by memberRoleIds; nonMemberUser (u2) matches steamId search
  const result = filterDiscordUsers(allUsers, memberRoleIds, "76561198000000002");
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

test("empty search returns all users passing the role filter", () => {
  const result = filterDiscordUsers(allUsers, memberRoleIds, "");
  expect(result.map((u) => u.id)).toEqual(["u2", "u3"]);
});

test("displayName null does not crash search", () => {
  // nonMemberUser has displayName=null; search for 'bob' matches discordName 'Bob#0002'
  const result = filterDiscordUsers([nonMemberUser], emptyRoleIds, "bob");
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

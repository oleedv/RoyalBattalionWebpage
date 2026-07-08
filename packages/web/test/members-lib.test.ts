import { test, expect } from "bun:test";
import { filterMembers, sortMembers, activeFilterCount, type MemberFilters } from "@/app/(protected)/members/lib";
import type { UserWithRolesAndComments } from "shared";

const EMPTY: MemberFilters = {
  search: "",
  roleIds: [],
  country: "",
  loggedIn: "all",
  playtime30: ["", ""],
  playtime90: ["", ""],
  seed30: ["", ""],
  seed90: ["", ""],
  joinFrom: "",
  joinTo: "",
  memberFrom: "",
  memberTo: "",
};

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
const ADMIN_ROLE = { id: "role-admin", discordRoleId: "discord-role-admin", name: "Admin" };

const alice = makeUser({
  id: "u1",
  discordId: "111111111111111111",
  discordName: "Alice#0001",
  displayName: "Alice",
  steamId: "76561198000000001",
  eosId: "eos-alice",
  country: "Norway",
  hasLoggedIn: true,
  playtime30: 100,
  playtime90: 300,
  seed30: 20,
  seed90: 60,
  createdAt: "2025-01-01T00:00:00Z",
  membershipDate: "2025-02-01T00:00:00Z",
  roles: [MEMBER_ROLE],
});

const bob = makeUser({
  id: "u2",
  discordId: "222222222222222222",
  discordName: "Bob#0002",
  displayName: null,
  steamId: "76561198000000002",
  eosId: "eos-bob",
  country: "Sweden",
  hasLoggedIn: false,
  playtime30: 50,
  playtime90: 150,
  seed30: 5,
  seed90: 15,
  createdAt: "2025-03-01T00:00:00Z",
  membershipDate: "2025-04-01T00:00:00Z",
  roles: [MEMBER_ROLE, ADMIN_ROLE],
});

const carol = makeUser({
  id: "u3",
  discordId: "333333333333333333",
  discordName: "Carol#0003",
  displayName: "Carol",
  steamId: null,
  eosId: null,
  country: null,
  hasLoggedIn: true,
  playtime30: 0,
  playtime90: 0,
  seed30: 0,
  seed90: 0,
  createdAt: "2025-06-01T00:00:00Z",
  membershipDate: null,
  roles: [ADMIN_ROLE],
});

const users = [alice, bob, carol];
const memberRoleIds = new Set([MEMBER_ROLE.id]);
const emptyRoleIds = new Set<string>();

// --- members-only filter ---

test("members-only filter keeps only member-role users", () => {
  const result = filterMembers(users, memberRoleIds, EMPTY);
  expect(result.map((u) => u.id)).toEqual(["u1", "u2"]);
});

test("members-only filter passes all users when memberRoleIds is empty", () => {
  const result = filterMembers(users, emptyRoleIds, EMPTY);
  expect(result.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
});

// --- search ---

test("search matches discordName", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, search: "alice" });
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

test("search matches displayName", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, search: "Carol" });
  expect(result.map((u) => u.id)).toEqual(["u3"]);
});

test("search matches steamId", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, search: "76561198000000002" });
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

test("search matches eosId", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, search: "eos-alice" });
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

test("search matches discordId", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, search: "333333333333333333" });
  expect(result.map((u) => u.id)).toEqual(["u3"]);
});

// --- role filter ---

test("roleIds filter keeps only users with all specified roles", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, roleIds: [MEMBER_ROLE.id, ADMIN_ROLE.id] });
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

// --- country filter ---

test("country filter matches partial case-insensitive", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, country: "nor" });
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

// --- loggedIn filter ---

test("loggedIn:yes keeps only users who have logged in", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, loggedIn: "yes" });
  expect(result.map((u) => u.id)).toEqual(["u1", "u3"]);
});

test("loggedIn:no keeps only users who have not logged in", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, loggedIn: "no" });
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

// --- playtime30 range ---

test("playtime30 min bounds correctly", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, playtime30: ["60", ""] });
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

test("playtime30 max bounds correctly", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, playtime30: ["", "50"] });
  expect(result.map((u) => u.id)).toEqual(["u2", "u3"]);
});

test("playtime30 range filters both bounds", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, playtime30: ["10", "60"] });
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

// --- date range filters ---

test("joinFrom filters users joined on or after date", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, joinFrom: "2025-03-01" });
  expect(result.map((u) => u.id)).toEqual(["u2", "u3"]);
});

test("joinTo filters users joined on or before date (inclusive)", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, joinTo: "2025-01-01" });
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

test("memberFrom filters users with membershipDate on or after date", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, memberFrom: "2025-04-01" });
  expect(result.map((u) => u.id)).toEqual(["u2"]);
});

test("memberTo filters users with membershipDate on or before date (inclusive)", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, memberTo: "2025-02-01" });
  expect(result.map((u) => u.id)).toEqual(["u1"]);
});

test("memberFrom excludes users with no membershipDate", () => {
  const result = filterMembers(users, emptyRoleIds, { ...EMPTY, memberFrom: "2025-01-01" });
  // carol has no membershipDate, should be excluded
  expect(result.map((u) => u.id)).toEqual(["u1", "u2"]);
});

// --- sortMembers ---

test("sortMembers name asc orders by displayName || discordName", () => {
  const result = sortMembers([alice, bob, carol], { key: "name", dir: "asc" });
  // alice displayName="Alice", bob displayName=null => discordName="Bob#0002", carol displayName="Carol"
  expect(result.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
});

test("sortMembers name desc reverses order", () => {
  const result = sortMembers([alice, bob, carol], { key: "name", dir: "desc" });
  expect(result.map((u) => u.id)).toEqual(["u3", "u2", "u1"]);
});

test("sortMembers steamId asc puts nulls last", () => {
  const result = sortMembers([alice, bob, carol], { key: "steamId", dir: "asc" });
  // carol has no steamId -> last
  expect(result[2].id).toBe("u3");
  expect(result[0].id).toBe("u1");
  expect(result[1].id).toBe("u2");
});

test("sortMembers joined asc orders by createdAt", () => {
  const result = sortMembers([carol, bob, alice], { key: "joined", dir: "asc" });
  expect(result.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
});

test("sortMembers country asc puts nulls last", () => {
  const result = sortMembers([alice, bob, carol], { key: "country", dir: "asc" });
  // alice=Norway, bob=Sweden, carol=null -> last
  expect(result[2].id).toBe("u3");
});

test("sortMembers loggedIn asc puts false before true", () => {
  const result = sortMembers([alice, bob, carol], { key: "loggedIn", dir: "asc" });
  // bob hasLoggedIn=false -> first
  expect(result[0].id).toBe("u2");
});

// --- activeFilterCount ---

test("activeFilterCount is 0 for EMPTY", () => {
  expect(activeFilterCount(EMPTY)).toBe(0);
});

test("activeFilterCount counts roleIds as 1", () => {
  expect(activeFilterCount({ ...EMPTY, roleIds: ["role-member"] })).toBe(1);
});

test("activeFilterCount counts country as 1", () => {
  expect(activeFilterCount({ ...EMPTY, country: "Norway" })).toBe(1);
});

test("activeFilterCount counts loggedIn:yes as 1", () => {
  expect(activeFilterCount({ ...EMPTY, loggedIn: "yes" })).toBe(1);
});

test("activeFilterCount counts playtime30 min-only as 1", () => {
  expect(activeFilterCount({ ...EMPTY, playtime30: ["10", ""] })).toBe(1);
});

test("activeFilterCount counts playtime30 max-only as 1 (not 2)", () => {
  expect(activeFilterCount({ ...EMPTY, playtime30: ["", "100"] })).toBe(1);
});

test("activeFilterCount counts each active group once", () => {
  const f: MemberFilters = {
    ...EMPTY,
    roleIds: ["role-member"],
    country: "Norway",
    loggedIn: "no",
    playtime30: ["10", "200"],
    playtime90: ["", "500"],
    seed30: ["5", ""],
    seed90: ["", ""],
    joinFrom: "2025-01-01",
    joinTo: "",
    memberFrom: "",
    memberTo: "2026-01-01",
  };
  // roleIds(1) + country(1) + loggedIn(1) + playtime30(1) + playtime90(1) + seed30(1) + joinFrom(1) + memberTo(1) = 8
  expect(activeFilterCount(f)).toBe(8);
});

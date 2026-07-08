import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { UserWithRolesAndComments, DiscordRole } from "shared";
import { DiscordUsersView, type DiscordUsersApi } from "@/app/(protected)/discord-users/discord-users-view";

const memberRole: DiscordRole = {
  id: "r-member",
  discordRoleId: "dr-member",
  name: "Member",
  permissions: [],
  grantsWhitelist: false,
  isMemberRole: true,
};

const nonMemberRole: DiscordRole = {
  id: "r-guest",
  discordRoleId: "dr-guest",
  name: "Guest",
  permissions: [],
  grantsWhitelist: false,
  isMemberRole: false,
};

const userAlice: UserWithRolesAndComments = {
  id: "u1",
  discordId: "111111111",
  discordName: "alice#0001",
  displayName: "Alice",
  steamId: "76561198000000001",
  eosId: null,
  avatarUrl: null,
  country: "Norway",
  membershipDate: null,
  dateOfBirth: null,
  birthdayOptOut: false,
  birthdayShowAge: false,
  hasLoggedIn: true,
  disabled: false,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2023-01-01T00:00:00.000Z",
  updatedAt: "2023-01-01T00:00:00.000Z",
  roles: [nonMemberRole],
  comments: [],
  playtime30: 10,
  playtime90: 40,
  seed30: 1,
  seed90: 5,
};

// Bob is a member (has member role) — should be excluded from the list
const userBob: UserWithRolesAndComments = {
  id: "u2",
  discordId: "222222222",
  discordName: "bob#0002",
  displayName: "Bob",
  steamId: null,
  eosId: null,
  avatarUrl: null,
  country: "Sweden",
  membershipDate: null,
  dateOfBirth: null,
  birthdayOptOut: false,
  birthdayShowAge: false,
  hasLoggedIn: false,
  disabled: false,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2023-02-01T00:00:00.000Z",
  updatedAt: "2023-02-01T00:00:00.000Z",
  roles: [memberRole],
  comments: [],
  playtime30: 5,
  playtime90: 20,
  seed30: 0,
  seed90: 2,
};

const userCarl: UserWithRolesAndComments = {
  id: "u3",
  discordId: "333333333",
  discordName: "carl#0003",
  displayName: "Carl",
  steamId: null,
  eosId: null,
  avatarUrl: null,
  country: null,
  membershipDate: null,
  dateOfBirth: null,
  birthdayOptOut: false,
  birthdayShowAge: false,
  hasLoggedIn: false,
  disabled: false,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2023-03-01T00:00:00.000Z",
  updatedAt: "2023-03-01T00:00:00.000Z",
  roles: [nonMemberRole],
  comments: [],
  playtime30: 0,
  playtime90: 0,
  seed30: 0,
  seed90: 0,
};

function makeApi(overrides: Partial<DiscordUsersApi> = {}): DiscordUsersApi {
  return {
    getAllUsers: mock(async () => ({
      success: true as const,
      data: [userAlice, userBob, userCarl],
    })),
    getRoles: mock(async () => ({
      success: true as const,
      data: [memberRole, nonMemberRole],
    })),
    addMemberComment: mock(async () => ({ success: true as const, data: { id: "c1", userId: "u1", authorId: "a", authorName: "Admin", text: "x", createdAt: new Date().toISOString() } })),
    deleteMemberComment: mock(async () => ({ success: true as const })),
    ...overrides,
  };
}

test("renders non-member users and excludes member-role users", async () => {
  render(<DiscordUsersView token="t" permissions={[]} api={makeApi()} />);
  expect(await screen.findByText("Alice")).toBeDefined();
  expect(screen.getByText("Carl")).toBeDefined();
  // Bob has the member role and should be excluded
  expect(screen.queryByText("Bob")).toBeNull();
});

test("typing in search narrows the list", async () => {
  render(<DiscordUsersView token="t" permissions={[]} api={makeApi()} />);
  await screen.findByText("Alice");

  const searchInput = screen.getByPlaceholderText(/search/i);
  fireEvent.change(searchInput, { target: { value: "alice" } });

  await waitFor(() => expect(screen.queryByText("Carl")).toBeNull());
  expect(screen.getByText("Alice")).toBeDefined();
});

test("clicking a row opens the detail dialog", async () => {
  render(<DiscordUsersView token="t" permissions={[]} api={makeApi()} />);
  await screen.findByText("Alice");

  fireEvent.click(screen.getAllByText("Alice")[0]);

  // Detail-only field confirms dialog is open
  expect(await screen.findByText("Activity (30/90d)")).toBeDefined();
});

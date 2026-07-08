import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { UserWithRolesAndComments, DiscordRole } from "shared";
import { MembersView, type MembersApi } from "@/app/(protected)/members/page";

const roleA: DiscordRole = {
  id: "r1",
  discordRoleId: "dr1",
  name: "Member",
  permissions: [],
  grantsWhitelist: false,
  isMemberRole: true,
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
  roles: [roleA],
  comments: [],
  playtime30: 10,
  playtime90: 40,
  seed30: 1,
  seed90: 5,
};

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
  roles: [roleA],
  comments: [],
  playtime30: 5,
  playtime90: 20,
  seed30: 0,
  seed90: 2,
};

function makeApi(overrides: Partial<MembersApi> = {}): MembersApi {
  return {
    getAllUsers: mock(async () => ({ success: true as const, data: [userAlice, userBob] })),
    getRoles: mock(async () => ({ success: true as const, data: [roleA] })),
    syncUserRoles: mock(async () => ({ success: true as const, data: { updated: 0, created: 0 } })),
    bulkUpdateMembers: mock(async () => ({ success: true as const, data: { updated: 1 } })),
    bulkDeleteMembers: mock(async () => ({ success: true as const, data: { deleted: 1 } })),
    bulkCommentMembers: mock(async () => ({ success: true as const, data: { commented: 1 } })),
    bulkDisableMembers: mock(async () => ({ success: true as const, data: { disabled: 1 } })),
    bulkEnableMembers: mock(async () => ({ success: true as const, data: { enabled: 1 } })),
    ...overrides,
  };
}

test("renders members from a fake api", async () => {
  render(<MembersView token="t" permissions={[]} api={makeApi()} />);
  expect(await screen.findByText("Alice")).toBeDefined();
  expect(screen.getByText("Bob")).toBeDefined();
});

test("typing in search narrows the list", async () => {
  render(<MembersView token="t" permissions={[]} api={makeApi()} />);
  await screen.findByText("Alice");

  const searchInput = screen.getByPlaceholderText(/search/i);
  fireEvent.change(searchInput, { target: { value: "alice" } });

  expect(screen.getByText("Alice")).toBeDefined();
  expect(screen.queryByText("Bob")).toBeNull();
});

test("clicking a row opens the member detail dialog", async () => {
  render(<MembersView token="t" permissions={[]} api={makeApi()} />);
  await screen.findByText("Alice");

  // Click on Alice's name cell (a non-interactive element in the table row)
  fireEvent.click(screen.getAllByText("Alice")[0]);

  // Detail dialog shows unique fields not in the table
  expect(await screen.findByText("Activity (30/90d)")).toBeDefined();
  expect(screen.getByText("10h / 40h")).toBeDefined();
});

test("with canManage + developer, selecting rows shows the bulk bar and clicking Disable opens the whitelist-removal warning", async () => {
  render(
    <MembersView token="t" permissions={["manage:members", "developer"]} api={makeApi()} />,
  );
  await screen.findByText("Alice");

  // Select Alice's row via the per-row checkbox
  const rowCheckboxes = screen.getAllByRole("checkbox", { name: "Select row" });
  fireEvent.click(rowCheckboxes[0]);

  // Bulk bar appears with the Disable button (developer-only)
  const disableBtn = await screen.findByRole("button", { name: "Disable" });
  fireEvent.click(disableBtn);

  // Dialog shows the verbatim whitelist-removal warning
  expect(
    await screen.findByText(
      "This also removes their in-game whitelist (restored if re-enabled).",
    ),
  ).toBeDefined();

  // Confirm button is disabled until a reason is typed
  const confirmBtn = screen.getByRole("button", { name: "Confirm" });
  expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(screen.getByPlaceholderText("Reason for disabling..."), {
    target: { value: "Test reason" },
  });
  expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
});

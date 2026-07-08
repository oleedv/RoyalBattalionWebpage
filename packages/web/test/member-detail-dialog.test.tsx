import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MemberDetailDialog from "@/app/(protected)/members/member-detail-dialog";
import type { UserWithRolesAndComments } from "shared";

const baseUser: UserWithRolesAndComments = {
  id: "u1",
  discordId: "123456789",
  discordName: "OleEd#1234",
  displayName: "OleEd",
  steamId: "76561198000000001",
  eosId: "0002000000000000",
  avatarUrl: null,
  country: "Norway",
  membershipDate: "2024-01-01T00:00:00.000Z",
  dateOfBirth: "1990-05-15T00:00:00.000Z",
  birthdayOptOut: false,
  birthdayShowAge: false,
  hasLoggedIn: true,
  disabled: false,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2023-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  roles: [{ id: "r1", discordRoleId: "dr1", name: "Member" }],
  comments: [],
  playtime30: 20,
  playtime90: 80,
  seed30: 3,
  seed90: 15,
};

const disabledUser: UserWithRolesAndComments = {
  ...baseUser,
  disabled: true,
  disabledAt: "2024-06-01T00:00:00.000Z",
  disabledReason: "Violated rules",
};

function makeApi() {
  return {
    updateUser: mock(() => Promise.resolve({ success: true as const, data: baseUser })),
    deleteUser: mock(() => Promise.resolve({ success: true as const })),
    disableUser: mock(() =>
      Promise.resolve({ success: true as const, data: { disabled: true as const } }),
    ),
    enableUser: mock(() =>
      Promise.resolve({ success: true as const, data: { enabled: true as const } }),
    ),
    addMemberComment: mock(() =>
      Promise.resolve({
        success: true as const,
        data: {
          id: "c1",
          userId: "u1",
          authorId: "a",
          authorName: "Admin",
          text: "test",
          createdAt: new Date().toISOString(),
        },
      }),
    ),
    deleteMemberComment: mock(() => Promise.resolve({ success: true as const })),
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    user: baseUser,
    onClose: mock(() => {}),
    onChanged: mock(() => {}),
    onDeleted: mock(() => {}),
    canManage: true,
    isDeveloper: false,
    token: "tok",
    api: makeApi(),
    ...overrides,
  };
}

test("(a) renders info grid and Steam CopyableId", () => {
  render(<MemberDetailDialog {...(baseProps() as any)} />);
  expect(screen.getByRole("button", { name: "Copy 76561198000000001" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Copy 0002000000000000" })).toBeDefined();
  expect(screen.getByText("Norway")).toBeDefined();
  expect(screen.getByText("20h / 80h")).toBeDefined();
});

test("(b) disabled developer sees Account Disabled panel with reason and Enable button", async () => {
  const props = baseProps({ user: disabledUser, isDeveloper: true });
  render(<MemberDetailDialog {...(props as any)} />);

  expect(screen.getByText("Account Disabled")).toBeDefined();
  expect(screen.getByText("Violated rules")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Enable Account" }));
  await waitFor(() =>
    expect((props.api as ReturnType<typeof makeApi>).enableUser).toHaveBeenCalledWith(
      "tok",
      "u1",
    ),
  );
  expect(props.onChanged as ReturnType<typeof mock>).toHaveBeenCalled();
});

test("(c) developer Disable Account opens AlertDialog; confirm disabled until reason typed", async () => {
  const props = baseProps({ isDeveloper: true });
  render(<MemberDetailDialog {...(props as any)} />);

  fireEvent.click(screen.getByRole("button", { name: "Disable Account" }));

  expect(
    screen.getByText(
      "This also removes their in-game whitelist (restored if re-enabled).",
    ),
  ).toBeDefined();

  const confirmBtn = screen.getByRole("button", { name: "Confirm Disable" });
  expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(screen.getByPlaceholderText("Reason for disabling..."), {
    target: { value: "Rule violation" },
  });
  expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);

  fireEvent.click(confirmBtn);
  await waitFor(() =>
    expect((props.api as ReturnType<typeof makeApi>).disableUser).toHaveBeenCalledWith(
      "tok",
      "u1",
      "Rule violation",
    ),
  );
  expect(props.onChanged as ReturnType<typeof mock>).toHaveBeenCalled();
});

test("(d) non-developer does not see Disable Account button", () => {
  render(<MemberDetailDialog {...(baseProps({ isDeveloper: false }) as any)} />);
  expect(screen.queryByRole("button", { name: "Disable Account" })).toBeNull();
});

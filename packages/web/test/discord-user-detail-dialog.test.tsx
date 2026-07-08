import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DiscordUserDetailDialog from "@/app/(protected)/discord-users/discord-user-detail-dialog";
import type { UserWithRolesAndComments } from "shared";

const baseUser: UserWithRolesAndComments = {
  id: "u1",
  discordId: "123456789",
  discordName: "TestUser#1234",
  displayName: "TestUser",
  steamId: "76561198000000001",
  eosId: "0002000000000000",
  avatarUrl: null,
  country: "Norway",
  membershipDate: "2024-01-01T00:00:00.000Z",
  dateOfBirth: null,
  birthdayOptOut: false,
  birthdayShowAge: false,
  hasLoggedIn: true,
  disabled: false,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2023-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  roles: [{ id: "r1", discordRoleId: "dr1", name: "Member" }],
  comments: [
    {
      id: "c1",
      userId: "u1",
      authorId: "a1",
      authorName: "Admin",
      text: "A test comment",
      createdAt: new Date().toISOString(),
    },
  ],
  playtime30: 20,
  playtime90: 80,
  seed30: 3,
  seed90: 15,
};

function makeApi() {
  return {
    addMemberComment: mock(() =>
      Promise.resolve({
        success: true as const,
        data: {
          id: "c2",
          userId: "u1",
          authorId: "a",
          authorName: "Admin",
          text: "new comment",
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
    canManage: true,
    isDeveloper: false,
    token: "tok",
    api: makeApi(),
    ...overrides,
  };
}

test("(a) renders info grid and Steam CopyableId", () => {
  render(<DiscordUserDetailDialog {...(baseProps() as any)} />);
  expect(screen.getByRole("button", { name: "Copy 76561198000000001" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Copy 0002000000000000" })).toBeDefined();
  expect(screen.getByText("Norway")).toBeDefined();
  expect(screen.getByText("20h / 80h")).toBeDefined();
});

test("(b) developer sees comment Delete and clicking it calls api.deleteMemberComment + onChanged", async () => {
  const props = baseProps({ isDeveloper: true });
  render(<DiscordUserDetailDialog {...(props as any)} />);

  const deleteBtn = screen.getByRole("button", { name: "Delete" });
  expect(deleteBtn).toBeDefined();

  fireEvent.click(deleteBtn);
  await waitFor(() =>
    expect((props.api as ReturnType<typeof makeApi>).deleteMemberComment).toHaveBeenCalledWith(
      "tok",
      "u1",
      "c1",
    ),
  );
  expect(props.onChanged as ReturnType<typeof mock>).toHaveBeenCalled();
});

test("(c) non-developer does not see comment Delete", () => {
  render(<DiscordUserDetailDialog {...(baseProps({ isDeveloper: false }) as any)} />);
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
});

test("(d) canManage shows add input; typing + Add calls api.addMemberComment + onChanged", async () => {
  const props = baseProps({ canManage: true });
  render(<DiscordUserDetailDialog {...(props as any)} />);

  const input = screen.getByPlaceholderText("Add a comment...");
  expect(input).toBeDefined();

  fireEvent.change(input, { target: { value: "new comment" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));

  await waitFor(() =>
    expect((props.api as ReturnType<typeof makeApi>).addMemberComment).toHaveBeenCalledWith(
      "tok",
      "u1",
      "new comment",
    ),
  );
  expect(props.onChanged as ReturnType<typeof mock>).toHaveBeenCalled();
});

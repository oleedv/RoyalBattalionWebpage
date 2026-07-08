import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { PermissionProvider } from "@/lib/permission-context";
import { UserProfileContent } from "@/components/user-profile/UserProfileContent";
import type { UserProfile, UserWithRolesAndComments, LiveStatus } from "shared";

const baseUser: UserWithRolesAndComments = {
  id: "user-1",
  discordId: "123456789012345678",
  discordName: "TestUser",
  displayName: "TestPlayer",
  steamId: "76561198000000001",
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
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  roles: [],
  comments: [],
  playtime30: 10,
  playtime90: 30,
  seed30: 2,
  seed90: 5,
};

const liveOnline: LiveStatus = {
  online: true,
  steamId: "76561198000000001",
  eosId: null,
  name: "Main Server",
  teamID: "1",
  squadID: "2",
  squadName: "Alpha",
  role: "Infantry",
  isLeader: false,
  sessionPlaytime: 60,
};

const profileWithUser: UserProfile = {
  user: baseUser,
  steamId: "76561198000000001",
  eosId: null,
  displayName: "TestPlayer",
  whitelistEntries: [],
  liveStatus: null,
};

const profileNoUser: UserProfile = {
  user: null,
  steamId: "76561198000000001",
  eosId: null,
  displayName: "TestPlayer",
  whitelistEntries: [],
  liveStatus: null,
};

function renderProfile(
  profile: UserProfile,
  {
    permissions = [] as string[],
    liveActions,
    onLinkToUser,
  }: {
    permissions?: string[];
    liveActions?: { onWarn?: () => void; onKick?: () => void; onSwitchTeam?: () => void };
    onLinkToUser?: () => void;
  } = {},
) {
  return render(
    <PermissionProvider permissions={permissions as any} apiToken="tok" user={null}>
      <UserProfileContent
        profile={profile}
        liveActions={liveActions}
        onLinkToUser={onLinkToUser}
      />
    </PermissionProvider>,
  );
}

test("(1) Steam ID renders via CopyableId with a copy button", () => {
  renderProfile(profileWithUser);
  // CopyableId renders a <button aria-label="Copy <value>">
  expect(screen.getByRole("button", { name: "Copy 76561198000000001" })).toBeDefined();
});

test("(2) Online now appears as StatusBadge when liveStatus.online is true", () => {
  renderProfile({ ...profileWithUser, liveStatus: liveOnline });
  expect(screen.getByText("Online now")).toBeDefined();
});

test("(3) Not linked to a Discord user badge shows when profile.user is null", () => {
  renderProfile(profileNoUser);
  expect(screen.getByText("Not linked to a Discord user")).toBeDefined();
});

test("(4) onKick fires when Kick button is clicked", () => {
  const onKick = mock(() => {});
  renderProfile(
    { ...profileWithUser, liveStatus: liveOnline },
    { liveActions: { onKick } },
  );
  fireEvent.click(screen.getByRole("button", { name: /kick/i }));
  expect(onKick).toHaveBeenCalledTimes(1);
});

test("(5) onLinkToUser fires from Link button when user is null and canManage", () => {
  const onLinkToUser = mock(() => {});
  renderProfile(profileNoUser, {
    permissions: ["manage:members"],
    onLinkToUser,
  });
  fireEvent.click(screen.getByRole("button", { name: /link this steam id/i }));
  expect(onLinkToUser).toHaveBeenCalledTimes(1);
});

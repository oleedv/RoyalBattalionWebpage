export interface User {
  id: string;
  discordId: string;
  discordName: string;
  displayName: string | null;
  steamId: string | null;
  eosId: string | null;
  avatarUrl: string | null;
  country: string | null;
  membershipDate: string | null;
  dateOfBirth: string | null;
  birthdayOptOut: boolean;
  birthdayShowAge: boolean;
  hasLoggedIn: boolean;
  disabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberComment {
  id: string;
  userId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface UserWithRoles extends User {
  roles: {
    id: string;
    discordRoleId: string;
    name: string;
  }[];
}

export interface UserWithRolesAndComments extends UserWithRoles {
  comments: MemberComment[];
  playtime30: number;
  playtime90: number;
  seed30: number;
  seed90: number;
}

export interface LinkedWhitelistEntry {
  id: string;
  steamId: string;
  server: string;
  name: string | null;
  clan: string | null;
  clanName: string | null;
  role: string | null;
  groupName: string | null;
  addedBy: string;
  addedByName: string | null;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface LiveStatus {
  online: boolean;
  steamId: string | null;
  eosId: string | null;
  name: string | null;
  teamID: string | null;
  squadID: string | null;
  squadName: string | null;
  role: string | null;
  isLeader: boolean;
  sessionPlaytime: number | null;
}

export interface UserProfile {
  user: UserWithRolesAndComments | null;
  steamId: string | null;
  eosId: string | null;
  displayName: string | null;
  whitelistEntries: LinkedWhitelistEntry[];
  liveStatus: LiveStatus | null;
  extraPermissions: string[];
}

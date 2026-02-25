export interface User {
  id: string;
  discordId: string;
  discordName: string;
  steamId: string | null;
  eosId: string | null;
  avatarUrl: string | null;
  country: string | null;
  membershipDate: string | null;
  dateOfBirth: string | null;
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
  activity30: number;
  activity90: number;
}

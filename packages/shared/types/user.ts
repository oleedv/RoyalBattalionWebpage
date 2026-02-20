export interface User {
  id: string;
  discordId: string;
  discordName: string;
  steamId: string | null;
  eosId: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithRoles extends User {
  roles: {
    id: string;
    discordRoleId: string;
    name: string;
  }[];
}

import type { UserWithRolesAndComments } from "shared";

export function filterDiscordUsers(
  users: UserWithRolesAndComments[],
  memberRoleIds: Set<string>,
  search: string,
): UserWithRolesAndComments[] {
  let result = memberRoleIds.size > 0
    ? users.filter((u) => !u.roles.some((r) => memberRoleIds.has(r.id)))
    : users;

  if (search) {
    const s = search.toLowerCase();
    result = result.filter((u) =>
      u.discordName.toLowerCase().includes(s) ||
      (u.displayName && u.displayName.toLowerCase().includes(s)) ||
      u.steamId?.includes(search) ||
      u.eosId?.includes(search) ||
      u.discordId.includes(search)
    );
  }

  return result;
}

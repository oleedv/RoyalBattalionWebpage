import type { UserWithRolesAndComments } from "shared";

export type MemberFilters = {
  search: string;
  roleIds: string[];
  country: string;
  loggedIn: "all" | "yes" | "no";
  playtime30: [string, string];
  playtime90: [string, string];
  seed30: [string, string];
  seed90: [string, string];
  joinFrom: string;
  joinTo: string;
  memberFrom: string;
  memberTo: string;
};

export type MemberSort = {
  key: "name" | "steamId" | "joined" | "country" | "loggedIn";
  dir: "asc" | "desc";
};

export function filterMembers(
  users: UserWithRolesAndComments[],
  memberRoleIds: Set<string>,
  f: MemberFilters,
): UserWithRolesAndComments[] {
  let result = users;

  // Members-only filter
  if (memberRoleIds.size > 0) {
    result = result.filter((u) => u.roles.some((r) => memberRoleIds.has(r.id)));
  }

  if (f.search) {
    const s = f.search.toLowerCase();
    result = result.filter(
      (u) =>
        u.discordName.toLowerCase().includes(s) ||
        (u.displayName && u.displayName.toLowerCase().includes(s)) ||
        u.steamId?.includes(f.search) ||
        u.eosId?.includes(f.search) ||
        u.discordId.includes(f.search),
    );
  }

  if (f.roleIds.length > 0) {
    result = result.filter((u) =>
      f.roleIds.every((roleId) => u.roles.some((r) => r.id === roleId)),
    );
  }

  if (f.country.trim()) {
    const fc = f.country.toLowerCase();
    result = result.filter((u) => u.country?.toLowerCase().includes(fc));
  }

  if (f.loggedIn === "yes") {
    result = result.filter((u) => u.hasLoggedIn);
  } else if (f.loggedIn === "no") {
    result = result.filter((u) => !u.hasLoggedIn);
  }

  const inRange = (val: number, min: string, max: string) => {
    if (min && val < Number(min)) return false;
    if (max && val > Number(max)) return false;
    return true;
  };

  if (f.playtime30[0] || f.playtime30[1]) {
    result = result.filter((u) => inRange(u.playtime30, f.playtime30[0], f.playtime30[1]));
  }
  if (f.playtime90[0] || f.playtime90[1]) {
    result = result.filter((u) => inRange(u.playtime90, f.playtime90[0], f.playtime90[1]));
  }
  if (f.seed30[0] || f.seed30[1]) {
    result = result.filter((u) => inRange(u.seed30, f.seed30[0], f.seed30[1]));
  }
  if (f.seed90[0] || f.seed90[1]) {
    result = result.filter((u) => inRange(u.seed90, f.seed90[0], f.seed90[1]));
  }

  if (f.joinFrom) {
    result = result.filter((u) => u.createdAt >= f.joinFrom);
  }
  if (f.joinTo) {
    result = result.filter((u) => u.createdAt <= f.joinTo + "T23:59:59");
  }
  if (f.memberFrom) {
    result = result.filter((u) => u.membershipDate && u.membershipDate >= f.memberFrom);
  }
  if (f.memberTo) {
    result = result.filter((u) => u.membershipDate && u.membershipDate <= f.memberTo + "T23:59:59");
  }

  return result;
}

export function sortMembers(
  users: UserWithRolesAndComments[],
  sort: MemberSort,
): UserWithRolesAndComments[] {
  const dir = sort.dir === "desc" ? -1 : 1;
  return [...users].sort((a, b) => {
    switch (sort.key) {
      case "name":
        return dir * (a.displayName || a.discordName).localeCompare(b.displayName || b.discordName);
      case "steamId": {
        if (!a.steamId && !b.steamId) return 0;
        if (!a.steamId) return 1;
        if (!b.steamId) return -1;
        return dir * a.steamId.localeCompare(b.steamId);
      }
      case "joined":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "country": {
        if (!a.country && !b.country) return 0;
        if (!a.country) return 1;
        if (!b.country) return -1;
        return dir * a.country.localeCompare(b.country);
      }
      case "loggedIn":
        return dir * (Number(a.hasLoggedIn) - Number(b.hasLoggedIn));
      default:
        return 0;
    }
  });
}

export function activeFilterCount(f: MemberFilters): number {
  let count = 0;
  if (f.roleIds.length) count++;
  if (f.country) count++;
  if (f.loggedIn !== "all") count++;
  if (f.playtime30[0] || f.playtime30[1]) count++;
  if (f.playtime90[0] || f.playtime90[1]) count++;
  if (f.seed30[0] || f.seed30[1]) count++;
  if (f.seed90[0] || f.seed90[1]) count++;
  if (f.joinFrom || f.joinTo) count++;
  if (f.memberFrom || f.memberTo) count++;
  return count;
}

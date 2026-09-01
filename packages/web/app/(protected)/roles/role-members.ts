import type { RoleMember } from "shared";

export type { RoleMember };

/** Prefer the guild nickname; fall back to the Discord username. */
export function memberSortName(member: RoleMember): string {
  const display = member.displayName?.trim();
  return display || member.discordName;
}

export function filterRoleMembers(members: RoleMember[], query: string): RoleMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => {
    const name = memberSortName(m).toLowerCase();
    return (
      name.includes(q) ||
      m.discordName.toLowerCase().includes(q) ||
      m.discordId.includes(q)
    );
  });
}

const LETTER_THRESHOLD = 24;

export type LetterGroup = {
  letter: string;
  members: RoleMember[];
};

/** Group a large roster by first letter. Short lists stay flat (null). */
export function groupRoleMembersByLetter(members: RoleMember[]): LetterGroup[] | null {
  if (members.length < LETTER_THRESHOLD) return null;

  const groups = new Map<string, RoleMember[]>();
  for (const m of members) {
    const ch = memberSortName(m).charAt(0).toUpperCase();
    const letter = ch >= "A" && ch <= "Z" ? ch : "#";
    const list = groups.get(letter);
    if (list) list.push(m);
    else groups.set(letter, [m]);
  }

  for (const list of groups.values()) {
    list.sort((a, b) =>
      memberSortName(a).localeCompare(memberSortName(b), undefined, { sensitivity: "base" }),
    );
  }

  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });

  return keys.map((letter) => ({ letter, members: groups.get(letter)! }));
}

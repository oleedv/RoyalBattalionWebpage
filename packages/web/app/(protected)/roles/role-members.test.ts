import { describe, expect, test } from "bun:test";
import type { RoleMember } from "shared";
import {
  filterRoleMembers,
  groupRoleMembersByLetter,
  memberSortName,
} from "./role-members";

function member(partial: Partial<RoleMember> & Pick<RoleMember, "id" | "discordName">): RoleMember {
  return {
    discordId: partial.discordId ?? partial.id,
    displayName: partial.displayName ?? null,
    avatarUrl: partial.avatarUrl ?? null,
    hasLoggedIn: partial.hasLoggedIn ?? true,
    disabled: partial.disabled ?? false,
    ...partial,
  };
}

describe("memberSortName", () => {
  test("prefers display name over discord name", () => {
    expect(
      memberSortName(member({ id: "1", discordName: "oleed", displayName: "Ole" })),
    ).toBe("Ole");
  });

  test("falls back to discord name when display name is empty", () => {
    expect(memberSortName(member({ id: "1", discordName: "oleed", displayName: "  " }))).toBe(
      "oleed",
    );
  });
});

describe("filterRoleMembers", () => {
  const roster = [
    member({ id: "1", discordName: "oleed", displayName: "Ole", discordId: "111" }),
    member({ id: "2", discordName: "sarge", displayName: "Royal Sarge", discordId: "222" }),
    member({ id: "3", discordName: "newbie", displayName: null, discordId: "333" }),
  ];

  test("returns all members when query is blank", () => {
    expect(filterRoleMembers(roster, "   ")).toEqual(roster);
  });

  test("matches display name, discord name, and discord id case-insensitively", () => {
    expect(filterRoleMembers(roster, "OLE").map((m) => m.id)).toEqual(["1"]);
    expect(filterRoleMembers(roster, "sarge").map((m) => m.id)).toEqual(["2"]);
    expect(filterRoleMembers(roster, "333").map((m) => m.id)).toEqual(["3"]);
  });
});

describe("groupRoleMembersByLetter", () => {
  test("returns null for short rosters so the UI can render a flat list", () => {
    const short = Array.from({ length: 8 }, (_, i) =>
      member({ id: String(i), discordName: `user${i}`, displayName: `Alpha ${i}` }),
    );
    expect(groupRoleMembersByLetter(short)).toBeNull();
  });

  test("groups a large roster by first letter with # for non-letters", () => {
    const names = [
      "Anders",
      "Alice",
      "Bert",
      "1stLt",
      "Zed",
      "zoe",
      ...Array.from({ length: 20 }, (_, i) => `Mike ${i}`),
    ];
    const roster = names.map((name, i) =>
      member({ id: String(i), discordName: `u${i}`, displayName: name }),
    );

    const groups = groupRoleMembersByLetter(roster);
    expect(groups).not.toBeNull();
    expect(groups!.map((g) => g.letter)).toEqual(["A", "B", "M", "Z", "#"]);
    expect(groups!.find((g) => g.letter === "A")!.members.map(memberSortName)).toEqual([
      "Alice",
      "Anders",
    ]);
    expect(groups!.find((g) => g.letter === "#")!.members.map(memberSortName)).toEqual(["1stLt"]);
  });
});

import { describe, expect, test } from "bun:test";
import {
  buildProfileUpdates,
  parseProspectDateOfBirth,
  parseProspectSteamId,
  pickProspectForUser,
  prospectToUserPatch,
  type ProspectProfileRow,
  type UserProfileRow,
} from "./prospect-profile";

describe("parseProspectDateOfBirth", () => {
  test("parses DD-MM-YYYY as a UTC calendar date", () => {
    const d = parseProspectDateOfBirth("15-03-1994");
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe("1994-03-15");
  });

  test("parses DD/MM/YYYY", () => {
    const d = parseProspectDateOfBirth("01/12/2000");
    expect(d!.toISOString().slice(0, 10)).toBe("2000-12-01");
  });

  test("rejects invalid and empty values", () => {
    expect(parseProspectDateOfBirth("")).toBeNull();
    expect(parseProspectDateOfBirth("1994-03-15")).toBeNull();
    expect(parseProspectDateOfBirth("32-01-1990")).toBeNull();
    expect(parseProspectDateOfBirth("not-a-date")).toBeNull();
  });
});

describe("parseProspectSteamId", () => {
  test("accepts a 17-digit Steam64 id", () => {
    expect(parseProspectSteamId("76561198000000001")).toBe("76561198000000001");
  });

  test("rejects the test placeholder and junk", () => {
    expect(parseProspectSteamId("Q")).toBeNull();
    expect(parseProspectSteamId("q")).toBeNull();
    expect(parseProspectSteamId("")).toBeNull();
    expect(parseProspectSteamId("12345")).toBeNull();
  });
});

const accepted: ProspectProfileRow = {
  user_id: "disc-1",
  status: "accepted",
  nationality: "norway",
  date_of_birth: "15-03-1994",
  steam_id: "76561198000000001",
  closed_at: "2026-08-20T12:00:00.000Z",
  created_at: "2026-07-20T12:00:00.000Z",
};

describe("pickProspectForUser", () => {
  test("prefers the latest accepted application over older denied ones", () => {
    const denied: ProspectProfileRow = {
      ...accepted,
      status: "denied",
      nationality: "Sweden",
      closed_at: "2026-08-21T12:00:00.000Z",
      created_at: "2026-08-01T12:00:00.000Z",
    };
    const olderAccepted: ProspectProfileRow = {
      ...accepted,
      closed_at: "2026-01-01T12:00:00.000Z",
    };
    expect(pickProspectForUser([denied, olderAccepted, accepted])).toEqual(accepted);
  });

  test("falls back to the most recent row when none are accepted", () => {
    const older = { ...accepted, status: "denied", closed_at: "2026-01-01T00:00:00.000Z" };
    const newer = { ...accepted, status: "open", closed_at: null, created_at: "2026-09-01T00:00:00.000Z" };
    expect(pickProspectForUser([older, newer])).toEqual(newer);
  });
});

describe("prospectToUserPatch", () => {
  const emptyUser: UserProfileRow = {
    id: "u1",
    discordId: "disc-1",
    country: null,
    dateOfBirth: null,
    membershipDate: null,
    steamId: null,
  };

  test("copies country, DOB, membership date and steam id onto a blank member", () => {
    expect(prospectToUserPatch(accepted, emptyUser)).toEqual({
      country: "Norway",
      dateOfBirth: new Date("1994-03-15T00:00:00.000Z"),
      membershipDate: new Date("2026-08-20T12:00:00.000Z"),
      steamId: "76561198000000001",
    });
  });

  test("does not overwrite fields staff already set", () => {
    const filled: UserProfileRow = {
      ...emptyUser,
      country: "Germany",
      dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
      membershipDate: new Date("2020-01-01T00:00:00.000Z"),
      steamId: "76561198000000099",
    };
    expect(prospectToUserPatch(accepted, filled)).toBeNull();
  });

  test("does not set membershipDate unless the prospect was accepted", () => {
    const open: ProspectProfileRow = { ...accepted, status: "open", closed_at: null };
    expect(prospectToUserPatch(open, emptyUser)).toEqual({
      country: "Norway",
      dateOfBirth: new Date("1994-03-15T00:00:00.000Z"),
      steamId: "76561198000000001",
    });
  });

  test("skips invalid country and placeholder steam id", () => {
    const messy: ProspectProfileRow = {
      ...accepted,
      nationality: "Narnia",
      steam_id: "Q",
    };
    expect(prospectToUserPatch(messy, emptyUser)).toEqual({
      dateOfBirth: new Date("1994-03-15T00:00:00.000Z"),
      membershipDate: new Date("2026-08-20T12:00:00.000Z"),
    });
  });
});

describe("buildProfileUpdates", () => {
  test("matches prospects to members by Discord id and skips complete rows", () => {
    const users: UserProfileRow[] = [
      {
        id: "u1",
        discordId: "disc-1",
        country: null,
        dateOfBirth: null,
        membershipDate: null,
        steamId: null,
      },
      {
        id: "u2",
        discordId: "disc-2",
        country: "Germany",
        dateOfBirth: new Date("1990-01-01"),
        membershipDate: new Date("2020-01-01"),
        steamId: "76561198000000099",
      },
      {
        id: "u3",
        discordId: "disc-3",
        country: null,
        dateOfBirth: null,
        membershipDate: null,
        steamId: null,
      },
    ];
    const updates = buildProfileUpdates(users, [accepted]);
    expect(updates).toHaveLength(1);
    expect(updates[0].userId).toBe("u1");
    expect(updates[0].patch.country).toBe("Norway");
  });
});

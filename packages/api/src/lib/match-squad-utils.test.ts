import { describe, expect, test } from "bun:test";
import {
  buildSquadLookupFromNamedRows,
  compareMatchPlayers,
  findOversizedSquads,
  lookupLastCombatSquad,
  mergeCreationLookup,
  noteLastCombatSquad,
  resolveScoreboardSquad,
  squadKey,
} from "./match-squad-utils";

describe("squadKey", () => {
  test("formats team and squad", () => {
    expect(squadKey(1, 3)).toBe("1-3");
    expect(squadKey(null, 2)).toBe("?-2");
  });
});

describe("buildSquadLookupFromNamedRows", () => {
  test("indexes first named row per team/squad", () => {
    const map = buildSquadLookupFromNamedRows([
      { teamId: 1, squadId: 1, squadName: "Alpha", teamName: "USA" },
      { teamId: 1, squadId: 1, squadName: "Alpha-renamed", teamName: "USA" },
      { teamId: 1, squadId: 2, squadName: null, teamName: null },
    ]);
    expect(map.get("1-1")?.squadName).toBe("Alpha");
    expect(map.has("1-2")).toBe(false);
  });
});

describe("mergeCreationLookup", () => {
  test("only fills missing keys", () => {
    const lookup = buildSquadLookupFromNamedRows([
      { teamId: 1, squadId: 1, squadName: "FromSB", teamName: "USA" },
    ]);
    mergeCreationLookup(lookup, [
      { teamId: 1, squadId: 1, squadName: "FromCreation", teamName: "USA" },
      { teamId: 1, squadId: 2, squadName: "Bravo", teamName: "USA" },
    ]);
    expect(lookup.get("1-1")?.squadName).toBe("FromSB");
    expect(lookup.get("1-2")?.squadName).toBe("Bravo");
  });
});

describe("resolveScoreboardSquad", () => {
  const lookup = buildSquadLookupFromNamedRows([
    { teamId: 1, squadId: 1, squadName: "Alpha", teamName: "USA" },
  ]);

  test("uses scoreboard name when present", () => {
    expect(resolveScoreboardSquad(1, 1, "Alpha", lookup, null)).toEqual({
      squadName: "Alpha",
      squadId: 1,
    });
  });

  test("fills name from lookup when squad_id present", () => {
    expect(resolveScoreboardSquad(1, 1, null, lookup, null)).toEqual({
      squadName: "Alpha",
      squadId: 1,
    });
  });

  test("uses last combat squad_id when scoreboard squad_id null", () => {
    expect(resolveScoreboardSquad(1, null, null, lookup, 1)).toEqual({
      squadName: "Alpha",
      squadId: 1,
    });
  });

  test("true unassigned stays empty name and null id", () => {
    expect(resolveScoreboardSquad(1, null, null, lookup, null)).toEqual({
      squadName: "",
      squadId: null,
    });
  });

  test("unknown squad id still groups under Squad N", () => {
    expect(resolveScoreboardSquad(1, 7, null, lookup, null)).toEqual({
      squadName: "Squad 7",
      squadId: 7,
    });
  });
});

describe("compareMatchPlayers", () => {
  test("orders by squadId, SL first, kills, name; null squad last", () => {
    const players = [
      { name: "Zed", squadId: 1, isSquadLeader: false, kills: 10 },
      { name: "Ann", squadId: 1, isSquadLeader: true, kills: 1 },
      { name: "Bob", squadId: 2, isSquadLeader: false, kills: 5 },
      { name: "Una", squadId: null, isSquadLeader: false, kills: 99 },
      { name: "Cal", squadId: 1, isSquadLeader: false, kills: 10 },
    ];
    const sorted = [...players].sort(compareMatchPlayers);
    expect(sorted.map((p) => p.name)).toEqual(["Ann", "Cal", "Zed", "Bob", "Una"]);
  });
});

describe("findOversizedSquads", () => {
  test("reports squads with more than 9 members", () => {
    const players = Array.from({ length: 10 }, (_, i) => ({
      teamId: 1,
      squadId: 1 as number | null,
      name: `P${i}`,
    }));
    players.push({ teamId: 1, squadId: 2, name: "Other" });
    const oversized = findOversizedSquads(players, 9);
    expect(oversized).toEqual([{ teamId: 1, squadId: 1, count: 10 }]);
  });
});

describe("last combat squad tracking", () => {
  test("keeps latest by time across identities", () => {
    const map = new Map<string, { squadId: number; timeMs: number }>();
    noteLastCombatSquad(map, ["steam1", "eos1"], 1, new Date("2026-01-01T10:00:00Z"));
    noteLastCombatSquad(map, ["steam1"], 2, new Date("2026-01-01T11:00:00Z"));
    expect(lookupLastCombatSquad(map, ["eos1", "steam1"])).toBe(2);
  });
});

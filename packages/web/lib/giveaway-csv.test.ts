import { test, expect } from "bun:test";
import { buildLeaderboardCsv } from "./giveaway-csv";

test("builds a csv with header and one row per entrant", () => {
  const csv = buildLeaderboardCsv([
    {
      userId: "111",
      steamId: "76561198000000000",
      hours: 40.5,
      seed: 12,
      votes: 2,
      tickets: 86,
      bonusTickets: 5,
      manual: false,
    },
    {
      userId: "222",
      steamId: null,
      hours: 10,
      seed: 0,
      votes: 0,
      tickets: 10,
      bonusTickets: 0,
      manual: true,
    },
  ]);
  const lines = csv.trim().split("\n");
  expect(lines[0]).toBe("rank,userId,steamId,hours,seed,votes,tickets,bonusTickets,manual");
  expect(lines[1]).toBe("1,111,76561198000000000,40.5,12,2,86,5,false");
  expect(lines[2]).toBe("2,222,,10,0,0,10,0,true");
});

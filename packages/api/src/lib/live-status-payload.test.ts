import { describe, expect, test } from "bun:test";
import {
  buildLiveStatusPayload,
  computeTps,
  etagFor,
  indicatorFor,
  stripSensitiveBm,
} from "./live-status-payload";
import { classifyOnlinePlayers } from "./live-status-classify";

describe("stripSensitiveBm", () => {
  test("drops ip, address, location, and licenseId", () => {
    const out = stripSensitiveBm({
      ip: "1.2.3.4",
      address: "1.2.3.4",
      location: [4.7, 52.0],
      licenseId: "1001912",
      name: "RB | Royal Battalion",
      port: 27050,
    });
    expect(out).not.toHaveProperty("ip");
    expect(out).not.toHaveProperty("address");
    expect(out).not.toHaveProperty("location");
    expect(out).not.toHaveProperty("licenseId");
    expect(out.name).toBe("RB | Royal Battalion");
    expect(out.port).toBe(27050);
  });
});

describe("indicatorFor", () => {
  test("maps connected/player count/threshold", () => {
    expect(indicatorFor(false, 10, 40)).toBe("disconnected");
    expect(indicatorFor(true, 0, 40)).toBe("empty");
    expect(indicatorFor(true, 12, 40)).toBe("seeding");
    expect(indicatorFor(true, 40, 40)).toBe("live");
  });
});

describe("computeTps", () => {
  test("averages tickRate samples in the last 10 minutes", () => {
    const now = 1_000_000_000;
    const history = [
      { time: now - 11 * 60_000, tickRate: 10 },
      { time: now - 2 * 60_000, tickRate: 50 },
      { time: now - 1 * 60_000, tickRate: 46 },
    ];
    expect(computeTps(history, now)).toEqual({ avg: 48, min: 46, max: 50, window: "10m" });
  });

  test("returns null when no samples", () => {
    expect(computeTps([], 1)).toBeNull();
  });
});

describe("classifyOnlinePlayers", () => {
  test("counts rb, prospect, wl, admin and team sizes", () => {
    const entries = new Map([
      ["1", [{ role: "Member" }]],
      ["2", [{ role: "Prospect" }]],
      ["3", [{ role: "Admin" }]],
      ["4", [{ role: "Seeder" }]],
    ]);
    const players = [
      { name: "A", steamID: "1", teamID: "1" },
      { name: "B", steamID: "2", teamID: "2" },
      { name: "C", steamID: "3", teamID: "1" },
      { name: "D", steamID: "4", teamID: "2" },
      { name: "E", steamID: "5", teamID: "1" },
    ];
    const c = classifyOnlinePlayers(players, entries);
    expect(c.rbCount).toBe(1);
    expect(c.prospectCount).toBe(1);
    expect(c.adminCount).toBe(1);
    expect(c.wlCount).toBe(1);
    expect(c.teamOneSize).toBe(3);
    expect(c.teamTwoSize).toBe(2);
    expect(c.teamOneRBs).toBe(1);
  });
});

describe("buildLiveStatusPayload", () => {
  const bm = {
    id: "27560507",
    name: "RB | Royal Battalion",
    ip: "10.0.0.1",
    port: 27050,
    players: 29,
    maxPlayers: 98,
    rank: 135,
    status: "online" as const,
    country: "NL",
    updatedAt: "2026-09-08T14:12:09.799Z",
    details: {
      map: "Sumari_Seed_v1",
      gameMode: "Seed",
      version: "v10.5.4.671793.2940",
      licensedServer: true,
      licenseId: "secret",
      password: false,
      squad_playerReserveCount: 2,
      squad_playTime: 20668,
      squad_publicQueueLimit: 40,
      squad_publicQueue: 0,
      squad_reservedQueue: 0,
      squad_teamOne: "TLF_S_CombinedArms_Seed",
      squad_teamTwo: "MEI_S_CombinedArms_Seed",
    },
  };

  test("omits PII and roster by default", () => {
    const payload = buildLiveStatusPayload({
      bm,
      live: null,
      classification: classifyOnlinePlayers([], new Map()),
      includePlayers: false,
      seedThreshold: 40,
      now: new Date("2026-09-08T14:00:00.000Z"),
    });
    expect(payload).not.toBeNull();
    expect(JSON.stringify(payload)).not.toContain("10.0.0.1");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(payload!.players).toBeNull();
    expect(payload!.map).toBe("Sumari_Seed_v1");
    expect(payload!.publicQueue).toBe(0);
    expect(payload!.live.connected).toBe(false);
    expect(payload!.live.indicator).toBe("disconnected");
  });

  test("includes roster when requested", () => {
    const payload = buildLiveStatusPayload({
      bm,
      live: {
        connected: true,
        players: [{ name: "Ole", steamID: "1", teamID: "1", role: "Rifleman" }],
        serverInfo: {
          serverName: "RB",
          currentLayer: "Sumari Seed v1",
          playerCount: 1,
          publicQueue: 0,
          reserveQueue: 0,
          maxPlayers: 98,
          publicSlots: 96,
          reserveSlots: 2,
        },
        tickRate: 48,
        metricHistory: [],
      },
      classification: classifyOnlinePlayers(
        [{ name: "Ole", steamID: "1", teamID: "1" }],
        new Map([["1", [{ role: "Member" }]]]),
      ),
      entriesBySteamId: new Map([["1", [{ role: "Member" }]]]),
      includePlayers: true,
      seedThreshold: 40,
      now: new Date("2026-09-08T14:00:00.000Z"),
    });
    expect(payload!.players).toEqual([
      { name: "Ole", teamId: 1, rb: true, role: "member" },
    ]);
    expect(payload!.live.connected).toBe(true);
    expect(payload!.live.rbCount).toBe(1);
    expect(payload!.live.layer).toBe("Sumari Seed v1");
  });

  test("returns null when both sources are missing", () => {
    expect(
      buildLiveStatusPayload({
        bm: null,
        live: null,
        classification: classifyOnlinePlayers([], new Map()),
        includePlayers: false,
        seedThreshold: 40,
      }),
    ).toBeNull();
  });
});

describe("etagFor", () => {
  test("is stable for the same payload and quoted", () => {
    const a = etagFor({ x: 1 });
    const b = etagFor({ x: 1 });
    expect(a).toBe(b);
    expect(a.startsWith('"')).toBe(true);
    expect(etagFor({ x: 2 })).not.toBe(a);
  });
});

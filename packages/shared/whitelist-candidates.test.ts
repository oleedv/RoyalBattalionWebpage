import { describe, expect, test } from "bun:test";
import {
  WHITELIST_DISMISS_TTL_MS,
  dismissExpiresAt,
  formatDismissRemaining,
  isActiveDismissal,
  isActiveWhitelistEntry,
  partitionCandidatesForServer,
  pendingCountsByServer,
  remainingDismissDays,
} from "./whitelist-candidates";

const NOW = new Date("2026-09-02T12:00:00.000Z");

describe("isActiveWhitelistEntry", () => {
  test("active when not deactivated and no expiry", () => {
    expect(isActiveWhitelistEntry({ deactivatedAt: null, expiresAt: null }, NOW)).toBe(true);
  });

  test("active when expiry is in the future", () => {
    expect(
      isActiveWhitelistEntry({ deactivatedAt: null, expiresAt: new Date("2026-09-03T00:00:00.000Z") }, NOW),
    ).toBe(true);
  });

  test("inactive when expired", () => {
    expect(
      isActiveWhitelistEntry({ deactivatedAt: null, expiresAt: new Date("2026-09-01T00:00:00.000Z") }, NOW),
    ).toBe(false);
  });

  test("inactive when expiry is exactly now", () => {
    expect(isActiveWhitelistEntry({ deactivatedAt: null, expiresAt: NOW }, NOW)).toBe(false);
  });

  test("inactive when deactivated even with no expiry", () => {
    expect(
      isActiveWhitelistEntry({ deactivatedAt: new Date("2026-08-01T00:00:00.000Z"), expiresAt: null }, NOW),
    ).toBe(false);
  });
});

describe("isActiveDismissal", () => {
  test("active before expiry when not restored", () => {
    expect(
      isActiveDismissal({ expiresAt: new Date("2026-10-02T12:00:00.000Z"), restoredAt: null }, NOW),
    ).toBe(true);
  });

  test("inactive after expiry", () => {
    expect(
      isActiveDismissal({ expiresAt: new Date("2026-09-01T12:00:00.000Z"), restoredAt: null }, NOW),
    ).toBe(false);
  });

  test("inactive once restored even if expiry is in the future", () => {
    expect(
      isActiveDismissal(
        { expiresAt: new Date("2026-10-02T12:00:00.000Z"), restoredAt: new Date("2026-09-02T11:00:00.000Z") },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("dismissExpiresAt", () => {
  test("is 30 days after the dismiss instant", () => {
    const from = new Date("2026-09-02T12:00:00.000Z");
    expect(dismissExpiresAt(from).toISOString()).toBe("2026-10-02T12:00:00.000Z");
    expect(WHITELIST_DISMISS_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("formatDismissRemaining", () => {
  test("rounds up partial days", () => {
    const expires = new Date("2026-09-03T00:00:00.000Z");
    expect(remainingDismissDays(expires, NOW)).toBe(1);
    expect(formatDismissRemaining(expires, NOW)).toBe("1 day left");
  });

  test("pluralizes", () => {
    const expires = new Date("2026-09-12T12:00:00.000Z");
    expect(formatDismissRemaining(expires, NOW)).toBe("10 days left");
  });

  test("expired when at or past expiry", () => {
    expect(formatDismissRemaining(NOW, NOW)).toBe("expired");
  });
});

describe("partitionCandidatesForServer", () => {
  const users = [
    { userId: "u1", steamId: "1".repeat(17) },
    { userId: "u2", steamId: "2".repeat(17) },
    { userId: "u3", steamId: "3".repeat(17) },
    { userId: "u4", steamId: "4".repeat(17) },
  ];

  test("pending excludes active whitelist and active dismissals on that server", () => {
    const part = partitionCandidatesForServer(
      users,
      "main",
      [{ steamId: "1".repeat(17), server: "main" }],
      [{ userId: "u2", server: "main" }],
    );
    expect(part.alreadyWhitelisted.map((u) => u.userId)).toEqual(["u1"]);
    expect(part.dismissed.map((u) => u.userId)).toEqual(["u2"]);
    expect(part.pending.map((u) => u.userId)).toEqual(["u3", "u4"]);
  });

  test("whitelist and dismissals on another server do not hide the candidate", () => {
    const part = partitionCandidatesForServer(
      users,
      "main",
      [{ steamId: "1".repeat(17), server: "battle" }],
      [{ userId: "u2", server: "battle" }],
    );
    expect(part.pending.map((u) => u.userId)).toEqual(["u1", "u2", "u3", "u4"]);
  });

  test("already-whitelisted wins over dismissal so they do not sit in dismissed", () => {
    const part = partitionCandidatesForServer(
      [users[0]],
      "main",
      [{ steamId: "1".repeat(17), server: "main" }],
      [{ userId: "u1", server: "main" }],
    );
    expect(part.alreadyWhitelisted).toHaveLength(1);
    expect(part.dismissed).toHaveLength(0);
    expect(part.pending).toHaveLength(0);
  });
});

describe("pendingCountsByServer", () => {
  test("counts pending independently per server", () => {
    const counts = pendingCountsByServer(
      [
        { userId: "u1", steamId: "1".repeat(17) },
        { userId: "u2", steamId: "2".repeat(17) },
      ],
      ["main", "battle"],
      [{ steamId: "1".repeat(17), server: "main" }],
      [{ userId: "u2", server: "battle" }],
    );
    expect(counts).toEqual([
      { server: "main", pending: 1 },
      { server: "battle", pending: 1 },
    ]);
  });
});

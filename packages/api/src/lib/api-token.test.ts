import { describe, expect, test } from "bun:test";
import {
  decideApiTokenAccess,
  generateApiToken,
  hashApiToken,
  isApiTokenSecret,
  TOKEN_PREFIX,
} from "./api-token";

describe("generateApiToken", () => {
  test("returns rb_live_ secret, matching prefix, and sha256 hash", () => {
    const { secret, prefix, hash } = generateApiToken();
    expect(secret.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(secret.length).toBe(TOKEN_PREFIX.length + 64);
    expect(prefix).toBe(secret.slice(0, 12));
    expect(hash).toBe(hashApiToken(secret));
    expect(hash).toHaveLength(64);
  });

  test("each call produces a unique secret", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.secret).not.toBe(b.secret);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("isApiTokenSecret", () => {
  test("accepts rb_live_ secrets and rejects JWTs", () => {
    expect(isApiTokenSecret("rb_live_" + "ab".repeat(32))).toBe(true);
    expect(isApiTokenSecret("eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBe(false);
    expect(isApiTokenSecret("Bearer rb_live_x")).toBe(false);
    expect(isApiTokenSecret("")).toBe(false);
  });
});

describe("decideApiTokenAccess", () => {
  const secret = "rb_live_" + "ab".repeat(32);
  const live = { scope: "server-status", revokedAt: null, expiresAt: null };

  test("rejects JWTs so the route can demand an API token", () => {
    expect(decideApiTokenAccess("eyJhbGciOiJIUzI1NiJ9.e30.sig", live)).toBe("jwt-required");
  });

  test("unknown, revoked, and expired all look the same", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    expect(decideApiTokenAccess(secret, null, now)).toBe("invalid");
    expect(decideApiTokenAccess(secret, { ...live, revokedAt: now }, now)).toBe("invalid");
    expect(decideApiTokenAccess(secret, { ...live, expiresAt: new Date("2026-09-01") }, now)).toBe(
      "invalid",
    );
  });

  test("wrong scope is forbidden; matching scope is ok", () => {
    expect(decideApiTokenAccess(secret, { ...live, scope: "other" })).toBe("forbidden");
    expect(decideApiTokenAccess(secret, live)).toBe("ok");
  });
});

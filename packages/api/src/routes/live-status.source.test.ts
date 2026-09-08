import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const live = readFileSync(join(import.meta.dir, "live-status.ts"), "utf8");
const tokens = readFileSync(join(import.meta.dir, "api-tokens.ts"), "utf8");
const auth = readFileSync(join(import.meta.dir, "auth.ts"), "utf8");
const users = readFileSync(join(import.meta.dir, "users.ts"), "utf8");

describe("live-status route wiring", () => {
  test("uses API-token auth, not session JWT middleware", () => {
    expect(live).toContain("apiTokenAuth");
    expect(live).not.toContain("authMiddleware");
  });

  test("records rate-limited usage and returns 429", () => {
    expect(live).toContain('recordApiTokenUsage(tokenId, "rateLimited")');
    expect(live).toContain("429");
  });
});

describe("api-tokens admin routes", () => {
  test("require manage:api-tokens", () => {
    expect(tokens).toContain('requirePermission("manage:api-tokens")');
    expect(tokens).toContain("authMiddleware");
  });

  test("create response includes secret; list serializer does not mention secret", () => {
    expect(tokens).toContain("secret");
    expect(tokens).toMatch(/return success\(c, \{ \.\.\.serializeToken\(row\), secret \}/);
  });
});

describe("auth extra permissions", () => {
  test("sync loads UserPermission and merges with role perms", () => {
    expect(auth).toContain("userPermission");
    expect(auth).toContain("mergePermissions");
  });

  test("role resync does not delete UserPermission rows", () => {
    expect(auth).toContain("userRole.deleteMany");
    expect(auth).not.toContain("userPermission.deleteMany");
  });
});

describe("user extra permissions", () => {
  test("GET and PUT extra-permissions exist; PUT is allowed for manage:members", () => {
    expect(users).toContain('"/:id/extra-permissions"');
    expect(users).toContain('requirePermission("manage:roles", "manage:members")');
  });
});

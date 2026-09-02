import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function load(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function routePermissions(src: string, router: string) {
  const re = new RegExp(
    `${router}\\.(get|post|patch|delete)\\(\\s*"([^"]+)"\\s*,\\s*requirePermission\\("([^"]+)"\\)`,
    "g",
  );
  const found: { method: string; path: string; permission: string }[] = [];
  for (const m of src.matchAll(re)) {
    found.push({ method: m[1], path: m[2], permission: m[3] });
  }
  return found;
}

describe("whitelist route permission split", () => {
  const src = load("routes/whitelist.ts");
  const routes = routePermissions(src, "whitelist");

  test("every registered route declares a permission", () => {
    expect(routes.length).toBeGreaterThan(0);
    const undeclared = src.match(/whitelist\.(get|post|patch|delete)\(/g) ?? [];
    expect(undeclared.length).toBe(routes.length);
  });

  test("GET list and GET by id are view:whitelist", () => {
    expect(routes).toContainEqual({ method: "get", path: "/", permission: "view:whitelist" });
    expect(routes).toContainEqual({ method: "get", path: "/:id", permission: "view:whitelist" });
  });

  test("add, edit, delete, comments, and bulk mutations require manage:whitelist", () => {
    const mutations = routes.filter((r) => r.method !== "get" || r.path.startsWith("/candidates"));
    expect(mutations.length).toBeGreaterThan(0);
    for (const route of mutations) {
      expect(route.permission).toBe("manage:whitelist");
    }
  });

  test("candidate list, summary, dismiss, and restore require manage:whitelist", () => {
    expect(routes).toContainEqual({ method: "get", path: "/candidates", permission: "manage:whitelist" });
    expect(routes).toContainEqual({ method: "get", path: "/candidates/summary", permission: "manage:whitelist" });
    expect(routes).toContainEqual({
      method: "post",
      path: "/candidates/:userId/dismiss",
      permission: "manage:whitelist",
    });
    expect(routes).toContainEqual({
      method: "post",
      path: "/candidates/:userId/restore",
      permission: "manage:whitelist",
    });
  });

  test("no mutation is gated only by view:whitelist", () => {
    const leaks = routes.filter(
      (r) => r.permission === "view:whitelist" && r.method !== "get",
    );
    expect(leaks).toEqual([]);
  });
});

test("clans router requires manage:whitelist for every request", () => {
  const src = load("routes/clans.ts");
  expect(src).toContain('clans.use("*", authMiddleware, requirePermission("manage:whitelist"))');
});

test("admin-groups router requires manage:whitelist for every request", () => {
  const src = load("routes/admin-groups.ts");
  expect(src).toContain(
    'adminGroups.use("*", authMiddleware, requirePermission("manage:whitelist"))',
  );
});

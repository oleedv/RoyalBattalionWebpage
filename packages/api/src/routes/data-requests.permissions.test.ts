import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "data-requests.ts"), "utf8");

describe("data-requests routes", () => {
  test("member create and own-status routes do not require developer", () => {
    expect(src).toMatch(/dataRequests\.get\(\s*"\/me"/);
    expect(src).toMatch(/dataRequests\.post\(\s*"\/"/);
    expect(src).not.toMatch(/dataRequests\.get\(\s*"\/me"[^)]*requirePermission/);
    expect(src).not.toMatch(/dataRequests\.post\(\s*"\/"[^)]*requirePermission/);
  });

  test("list, summary, and handle require developer", () => {
    expect(src).toContain('requirePermission("developer")');
    expect(src).toMatch(/dataRequests\.get\(\s*"\/summary"/);
    expect(src).toMatch(/dataRequests\.get\(\s*"\/"/);
    expect(src).toMatch(/dataRequests\.patch\(\s*"\/:id"/);
  });

  test("does not auto-delete the user", () => {
    expect(src).not.toContain("prisma.user.delete");
  });
});

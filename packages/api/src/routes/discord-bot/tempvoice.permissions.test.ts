import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "tempvoice.ts"), "utf8");

test("temp voice reads require view or manage discord-bot", () => {
  expect(src).toContain('requirePermission("view:discord-bot", "manage:discord-bot")');
});

test("temp voice mutations require manage:discord-bot", () => {
  expect(src).toContain('requirePermission("manage:discord-bot")');
  expect(src).toContain("tempvoice_manage");
  expect(src).toContain("tempvoice_update_config");
});

test("staff ops are queued, not applied inline", () => {
  expect(src).toContain('enqueue("tempvoice_manage"');
  expect(src).not.toMatch(/channels\.fetch/);
});

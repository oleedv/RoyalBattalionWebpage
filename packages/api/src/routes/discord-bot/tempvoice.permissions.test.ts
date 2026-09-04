import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "tempvoice.ts"), "utf8");

test("temp voice reads accept dedicated or discord-bot view perms", () => {
  expect(src).toContain(
    'requirePermission("view:temp-voice", "manage:temp-voice", "view:discord-bot", "manage:discord-bot")',
  );
});

test("temp voice mutations require manage:temp-voice or manage:discord-bot", () => {
  expect(src).toContain('requirePermission("manage:temp-voice", "manage:discord-bot")');
  expect(src).toContain("tempvoice_manage");
  expect(src).toContain("tempvoice_update_config");
});

test("staff ops are queued, not applied inline", () => {
  expect(src).toContain('enqueue("tempvoice_manage"');
  expect(src).not.toMatch(/channels\.fetch/);
});

test("presets can be created, patched, and cleared", () => {
  expect(src).toContain('"/tempvoice/presets/:userId"');
  expect(src).toContain("tempvoice_preset_update");
  expect(src).toContain("tempvoice_preset_clear");
});

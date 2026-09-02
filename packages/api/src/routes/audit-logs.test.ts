import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "audit-logs.ts"), "utf8");

test("deleting an audit log does not write a new audit log entry", () => {
  expect(src).not.toContain('audit-log.delete');
  expect(src).not.toContain('audit-log.bulk-delete');
  expect(src).not.toMatch(/await audit\(/);
});

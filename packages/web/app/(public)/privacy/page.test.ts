import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

test("refuses under-18s without describing verification", () => {
  expect(src).toContain("We refuse anyone under the age of 18");
  expect(src).not.toMatch(/date of birth/i);
});

test("does not publish retention periods", () => {
  expect(src).not.toMatch(/indefinitely/i);
  expect(src).not.toMatch(/How Long We Keep/i);
  expect(src).not.toMatch(/Data Retention/i);
  expect(src).not.toMatch(/\b60 days\b/i);
  expect(src).not.toMatch(/\b365 days\b/i);
});

test("does not advertise data-subject request rights", () => {
  expect(src).not.toMatch(/Your Rights/i);
  expect(src).not.toMatch(/request deletion/i);
  expect(src).not.toContain('href="/settings"');
});

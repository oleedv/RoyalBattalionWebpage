import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("member detail extra permissions", () => {
  test("member modal includes View API Docs extra-permission grant", () => {
    expect(src).toContain("ExtraPermissionsPanel");
    expect(src).toContain("extraPermissions");
  });
});

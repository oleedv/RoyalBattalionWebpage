import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("whitelist page mutation UI requires manage:whitelist", () => {
  test("canManage is tied to manage:whitelist, not view:whitelist", () => {
    expect(src).toContain('const canManage = hasPermission("manage:whitelist")');
    expect(src).not.toMatch(/const canManage = hasPermission\("view:whitelist"\)/);
  });

  test("add, import, bulk select, comments, and edit/delete are canManage-gated", () => {
    expect(src).toMatch(/\{canManage && \(\s*<form onSubmit=\{handleAdd\}/);
    expect(src).toMatch(/\{canManage && \(\s*<button\s+onClick=\{openImportModal\}/);
    expect(src).toMatch(/\{canManage && \(\s*<button\s+onClick=\{toggleBulkMode\}/);
    expect(src).toMatch(/\{canManage && \(\s*<div className="flex gap-2">/);
    expect(src).toMatch(/\{\/\* Actions footer \*\/\}\s+\{canManage && \(/);
  });

  test("requests tab refuses view-only users", () => {
    expect(src).toContain("if (!canManage) {");
    expect(src).toContain("You need manage:whitelist permission to view requests.");
  });

  test("dismiss is persisted through the API, not a client-only Set", () => {
    expect(src).toContain("dismissWhitelistCandidate");
    expect(src).toContain("restoreWhitelistCandidate");
    expect(src).not.toContain("Dismissed candidates (client-side only)");
    expect(src).not.toMatch(/const \[dismissed, setDismissed\] = useState<Set<string>>/);
  });
});

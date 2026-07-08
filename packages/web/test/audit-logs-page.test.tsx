import { test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AuditLogEntry } from "shared";
import { AuditLogsView, type AuditLogsApi } from "@/app/(protected)/audit-logs/audit-logs-view";

const rows: AuditLogEntry[] = [
  { id: "1", userId: "u1", userName: "Alice", action: "whitelist.add", resource: "whitelist", resourceId: "76561190000000000", detail: { name: "Bob", server: "main" }, createdAt: "2026-02-01T10:00:00.000Z" },
  { id: "2", userId: "u2", userName: "Carol", action: "rcon.kick", resource: "live_server", resourceId: null, detail: { playerName: "Eve", reason: "afk" }, createdAt: "2026-02-01T11:00:00.000Z" },
];

function makeApi(over: Partial<AuditLogsApi> = {}): AuditLogsApi {
  return {
    getAuditLogs: async () => ({ success: true, data: { items: rows, total: 2, page: 1, limit: 50, hasNext: false } }),
    deleteAuditLog: async () => ({ success: true, data: { deleted: true } }),
    ...over,
  };
}

test("lists entries with tokenized action badges and a summary", async () => {
  render(<AuditLogsView token="t" canDelete={false} api={makeApi()} />);
  expect(await screen.findByText("Alice")).toBeDefined();
  const badge = screen.getByText("Whitelist Add");
  expect(badge.className).toContain("text-success");
  expect(badge.className).not.toMatch(/blue-\d/);
  expect(screen.getByText("Added Bob on main")).toBeDefined(); // formatDetailSummary
});

test("expanding a row shows the AuditDetail grid", async () => {
  render(<AuditLogsView token="t" canDelete={false} api={makeApi()} />);
  await screen.findByText("Alice");
  fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]);
  expect(await screen.findByRole("heading", { name: "Details" })).toBeDefined(); // AuditDetail h3 heading
  expect(screen.getByText("server")).toBeDefined(); // detail field label
});

test("developer delete opens an AlertDialog and removes the row on confirm", async () => {
  const deleteAuditLog = (async () => ({ success: true, data: { deleted: true } })) as AuditLogsApi["deleteAuditLog"];
  render(<AuditLogsView token="t" canDelete api={makeApi({ deleteAuditLog })} />);
  await screen.findByText("Alice");
  fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
  const confirm = await screen.findByRole("button", { name: "Delete" });
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByText("Alice")).toBeNull());
});

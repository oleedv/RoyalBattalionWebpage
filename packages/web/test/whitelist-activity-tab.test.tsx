import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ActivityTab, { type GetAuditLogsParams } from "@/app/(protected)/whitelist/activity-tab";
import type { AdminGroup, AuditLogEntry, Clan } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [];

const log: AuditLogEntry = {
  id: "L1", userId: "u1", userName: "Ole", action: "whitelist.add",
  resource: "WhitelistEntry", resourceId: "e1",
  detail: { name: "Olie", server: "main" },
  createdAt: new Date().toISOString(),
};

function makeApi(items: AuditLogEntry[], total = items.length) {
  return {
    getAuditLogs: mock((_token: string, _params: GetAuditLogsParams) =>
      Promise.resolve({
        success: true as const,
        data: { items, total, page: 1, limit: 50, hasNext: false },
      }),
    ),
  };
}

test("renders rows with tone badges and summaries", async () => {
  render(<ActivityTab token="tok" groups={groups} clans={clans} api={makeApi([log])} />);
  expect(await screen.findByText("Ole")).toBeDefined();
  expect(screen.getByText("add")).toBeDefined();
  expect(screen.getByText("add").className).toContain("text-success");
  expect(screen.getByText("Added Olie on main")).toBeDefined();
  expect(screen.getByText("1 total")).toBeDefined();
});

test("expanding a row shows the AuditDetail panel", async () => {
  render(<ActivityTab token="tok" groups={groups} clans={clans} api={makeApi([log])} />);
  await screen.findByText("Ole");
  fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
  expect(screen.getByText("Details")).toBeDefined();
  expect(screen.getByText("Server")).toBeDefined();
  expect(screen.getByRole("button", { name: "Show raw" })).toBeDefined();
});

test("action filter refetches page 1 and renders a removable chip", async () => {
  const api = makeApi([log]);
  render(<ActivityTab token="tok" groups={groups} clans={clans} api={api} />);
  await screen.findByText("Ole");
  fireEvent.change(screen.getByDisplayValue("All actions"), {
    target: { value: "whitelist.delete" },
  });
  await waitFor(() => {
    const lastCall = api.getAuditLogs.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(lastCall.action).toBe("whitelist.delete");
    expect(lastCall.page).toBe(1);
  });
  expect(screen.getByText("Action: Delete")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Remove filter Action: Delete" }));
  await waitFor(() => {
    const lastCall = api.getAuditLogs.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(lastCall.action).toBeUndefined();
  });
});

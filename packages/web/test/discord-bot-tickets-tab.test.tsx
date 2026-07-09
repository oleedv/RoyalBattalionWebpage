// packages/web/test/discord-bot-tickets-tab.test.tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Ticket, Permission } from "shared";
import { PermissionProvider } from "@/lib/permission-context";
import TicketsTab, { type TicketsApi } from "@/app/(protected)/discord-bot/components/TicketsTab";

// Fixtures
const t1: Ticket = {
  id: 1,
  uuid: "u1-uuid",
  channelId: "ch1",
  userId: "100",
  status: "open",
  tier: "normal",
  createdAt: "2026-02-01T00:00:00.000Z",
  closedAt: null,
  closedBy: null,
};
const t2: Ticket = {
  id: 2,
  uuid: "u2-uuid",
  channelId: "ch2",
  userId: "200",
  status: "closed",
  tier: "community_officer",
  createdAt: "2026-01-01T00:00:00.000Z",
  closedAt: "2026-01-05T00:00:00.000Z",
  closedBy: "300",
};
const t1Detail: Ticket = {
  ...t1,
  events: [
    {
      id: 10,
      ticketId: 1,
      eventType: "created",
      actorId: "100",
      detail: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    },
  ],
  messages: [
    {
      id: 20,
      ticketId: 1,
      authorId: "100",
      authorTag: "Alpha#1234",
      content: "hello from user",
      attachments: null,
      isStaff: false,
      createdAt: "2026-02-01T01:00:00.000Z",
    },
  ],
};

function makeApi(overrides: Partial<TicketsApi> = {}): TicketsApi {
  return {
    getTickets: mock(async () => ({ success: true as const, data: [t1, t2] })),
    getTicket: mock(async (_t: string, id: number) => ({
      success: true as const,
      data: id === 1 ? t1Detail : t2,
    })),
    resolveDiscordNames: mock(async () => ({
      success: true as const,
      data: { "100": "Alpha", "200": "Beta", "300": "Admin" },
    })),
    ...overrides,
  };
}

function renderWithPerms(perms: Permission[], api?: TicketsApi) {
  return render(
    <PermissionProvider permissions={perms} apiToken="tok" user={null}>
      <TicketsTab apiToken="tok" api={api ?? makeApi()} />
    </PermissionProvider>,
  );
}

// (1) Renders tickets from api.getTickets with a StatusBadge
test("(1) renders tickets from getTickets with StatusBadge", async () => {
  renderWithPerms(["view:tickets"]);
  expect(await screen.findByText("Ticket #1")).toBeDefined();
  // StatusBadge composite renders the variant label ("Open") for status "open".
  // CSS text-transform:uppercase shows "OPEN" visually; DOM text is "Open".
  const openEls = screen.queryAllByText("Open");
  expect(openEls.length).toBeGreaterThan(0);
});

// (2a) Developer bypass: user with only "developer" permission sees all tiers,
//       so visibleTiers.length > 1 and the tier filter Select renders.
test("(2a) developer sees all tiers — tier filter renders", async () => {
  renderWithPerms(["developer"]);
  await screen.findByText("Ticket #1");
  // With developer permission, getVisibleTiers returns all 3 tiers (length=3 > 1).
  // Both status select and tier select render, each with role="combobox".
  expect(screen.getAllByRole("combobox").length).toBe(2);
});

// (2b) Single-tier user sees only that tier, no tier filter (visibleTiers.length === 1).
test("(2b) single-tier user — no tier filter", async () => {
  renderWithPerms(["view:tickets:normal"]);
  await screen.findByText("Ticket #1");
  // Only the status select renders; tier filter is hidden.
  expect(screen.getAllByRole("combobox").length).toBe(1);
});

// (3) Expanding a ticket calls api.getTicket and shows the detail.
test("(3) expanding a ticket calls api.getTicket and shows detail", async () => {
  const api = makeApi();
  renderWithPerms(["view:tickets"], api);
  fireEvent.click(await screen.findByRole("button", { name: /Ticket #1/ }));
  expect(await screen.findByText("hello from user")).toBeDefined();
  expect(api.getTicket).toHaveBeenCalledWith("tok", 1);
});

// (4) Search (SearchInput) narrows the list.
test("(4) search narrows the list", async () => {
  renderWithPerms(["view:tickets"]);
  await screen.findByText("Ticket #1");
  await screen.findByText("Ticket #2");
  // Searching by t1's uuid: matches Ticket #1 only.
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "u1-uuid" } });
  await waitFor(() => expect(screen.queryByText("Ticket #2")).toBeNull());
  expect(screen.getByText("Ticket #1")).toBeDefined();
});

// (5) DownloadButton renders for an expanded ticket.
test("(5) DownloadButton renders for expanded ticket", async () => {
  renderWithPerms(["view:tickets"]);
  fireEvent.click(await screen.findByRole("button", { name: /Ticket #1/ }));
  expect(await screen.findByRole("button", { name: /download/i })).toBeDefined();
});

// packages/web/test/tickets-tab.test.tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { Ticket, LegacyTicket, Permission } from "shared";
import TicketsTab, { type TicketsApi } from "@/app/(protected)/tickets/tickets-tab";

const t1: Ticket = { id: 1, uuid: "u1", channelId: "c", userId: "100", status: "open", tier: "normal", createdAt: "2026-02-01T00:00:00.000Z", closedAt: null, closedBy: null };
const t2: Ticket = { id: 2, uuid: "u2", channelId: "c", userId: "200", status: "closed", tier: "comp_team", createdAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-05T00:00:00.000Z", closedBy: "300" };
const legacy: LegacyTicket = { id: 9, uuid: "l9", threadNumber: 42, userId: "400", username: "olduser", nickname: null, previousThreads: null, startedAt: "2025-12-01T00:00:00.000Z", closedAt: null };

function makeApi(overrides: Partial<TicketsApi> = {}): TicketsApi {
  return {
    getTickets: async () => ({ success: true, data: [t1, t2] }),
    getLegacyTickets: async () => ({ success: true, data: [legacy] }),
    getTicket: async (_t, id) => ({ success: true, data: { ...(id === 1 ? t1 : t2), messages: [{ id: 1, ticketId: id, authorId: "100", authorTag: "Neo#1", content: "detail body", attachments: null, isStaff: false, createdAt: "2026-02-01T00:00:00.000Z" }] } }),
    getLegacyTicket: async (_t, _id) => ({ success: true, data: { ...legacy, messages: [] } }),
    resolveDiscordNames: async () => ({ success: true, data: {} }),
    ...overrides,
  };
}

const allPerms = ["view:tickets"] as Permission[];

test("loads and lists current + legacy rows", async () => {
  render(<TicketsTab token="tok" permissions={allPerms} api={makeApi()} />);
  expect(await screen.findByText(/Ticket #1/)).toBeDefined();
  expect(screen.getByText(/Ticket #2/)).toBeDefined();
  expect(screen.getByText(/Thread #42/)).toBeDefined();
});

test("search filters the list", async () => {
  render(<TicketsTab token="tok" permissions={allPerms} api={makeApi()} />);
  await screen.findByText(/Ticket #1/);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "olduser" } });
  await waitFor(() => expect(screen.queryByText(/Ticket #1/)).toBeNull());
  expect(screen.getByText(/Thread #42/)).toBeDefined();
});

test("expanding a ticket fetches and shows the transcript", async () => {
  render(<TicketsTab token="tok" permissions={allPerms} api={makeApi()} />);
  await screen.findByText(/Ticket #1/);
  const expanders = screen.getAllByRole("button", { name: "Expand row" });
  fireEvent.click(expanders[0]);
  expect(await screen.findByText("detail body")).toBeDefined();
});

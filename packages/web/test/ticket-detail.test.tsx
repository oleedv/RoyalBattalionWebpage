// packages/web/test/ticket-detail.test.tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { Ticket, LegacyTicket } from "shared";
import { TicketDetailPanel, LegacyTicketDetailPanel } from "@/app/(protected)/tickets/ticket-detail";

const full: Ticket = {
  id: 7, uuid: "u-7", channelId: "c", userId: "111",
  status: "closed", tier: "normal",
  createdAt: "2026-01-01T00:00:00.000Z", closedAt: null, closedBy: null,
  events: [{ id: 1, ticketId: 7, eventType: "created", actorId: "111", detail: "opened", createdAt: "2026-01-01T00:00:00.000Z" }],
  messages: [{ id: 1, ticketId: 7, authorId: "111", authorTag: "User#1", content: "hello there", attachments: null, isStaff: false, createdAt: "2026-01-01T00:00:00.000Z" }],
};

test("renders skeleton until detail arrives, then the transcript + download", () => {
  const calls: number[] = [];
  const ensure = (id: number) => calls.push(id);
  const stub: Ticket = { ...full, events: [], messages: [] };

  const { rerender } = render(
    <TicketDetailPanel ticket={stub} detail={undefined} ensureDetail={ensure} displayName={(id) => `name:${id}`} />,
  );
  expect(calls).toEqual([7]); // fetch triggered on mount
  expect(screen.queryByText("hello there")).toBeNull();

  rerender(
    <TicketDetailPanel ticket={stub} detail={full} ensureDetail={ensure} displayName={(id) => `name:${id}`} />,
  );
  expect(screen.getByText("hello there")).toBeDefined();
  expect(screen.getByText("name:111")).toBeDefined(); // displayName applied
  expect(screen.getByRole("button", { name: /download/i })).toBeDefined();
});

test("legacy panel renders its messages once detail arrives", () => {
  const legacy: LegacyTicket = {
    id: 3, uuid: "l-3", threadNumber: 12, userId: "9", username: "bob",
    nickname: null, previousThreads: null, startedAt: "2026-01-01T00:00:00.000Z", closedAt: null,
    messages: [{ id: 1, ticketId: 3, type: "from_user", author: "bob", content: "legacy hi", createdAt: "2026-01-01T00:00:00.000Z" }],
  };
  render(<LegacyTicketDetailPanel ticket={legacy} detail={legacy} ensureDetail={() => {}} />);
  expect(screen.getByText("legacy hi")).toBeDefined();
  expect(screen.getByRole("button", { name: /download/i })).toBeDefined();
});

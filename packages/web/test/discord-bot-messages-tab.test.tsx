// packages/web/test/discord-bot-messages-tab.test.tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BotMessage } from "shared";
import MessagesTab, { type MessagesApi } from "@/app/(protected)/discord-bot/components/MessagesTab";

// Fixtures
const m1: BotMessage = {
  id: 1,
  messageId: "msg1",
  channelId: "ch1",
  channelName: "general",
  guildId: "guild1",
  authorId: "100",
  authorTag: "Alpha#1234",
  content: "Hello there",
  attachments: null,
  isDm: false,
  direction: "incoming",
  createdAt: "2026-07-09T10:00:00.000Z",
};

const m2: BotMessage = {
  id: 2,
  messageId: "msg2",
  channelId: "dm-ch",
  channelName: null,
  guildId: null,
  authorId: "200",
  authorTag: "Beta#5678",
  content: "This is a DM",
  attachments: null,
  isDm: true,
  direction: "incoming",
  createdAt: "2026-07-09T11:00:00.000Z",
};

function makeApi(overrides: Partial<MessagesApi> = {}): MessagesApi {
  return {
    getBotMessages: mock(async () => ({
      success: true as const,
      data: { items: [m1, m2], total: 2, page: 0, limit: 50, hasNext: false },
    })),
    ...overrides,
  };
}

// (1) Renders messages in the DataTable
test("(1) renders messages in the DataTable", async () => {
  render(<MessagesTab apiToken="tok" api={makeApi()} />);
  expect(await screen.findByText("Alpha#1234")).toBeDefined();
  expect(screen.getByText("Beta#5678")).toBeDefined();
  expect(screen.getByText("Hello there")).toBeDefined();
});

// (2) A DM message shows the DM badge
test("(2) a DM message shows the DM badge", async () => {
  render(<MessagesTab apiToken="tok" api={makeApi()} />);
  await screen.findByText("Alpha#1234");
  expect(screen.getByText("DM")).toBeDefined();
});

// (3) Changing the content search refetches with the search param
test("(3) changing the content search refetches with the search param", async () => {
  const api = makeApi();
  render(<MessagesTab apiToken="tok" api={api} />);
  await screen.findByText("Alpha#1234");

  const searchInput = screen.getByPlaceholderText("Search content...");
  fireEvent.change(searchInput, { target: { value: "foo" } });
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));

  await waitFor(() =>
    expect(api.getBotMessages).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ search: "foo" }),
    ),
  );
});

// (4) The DMs-only Switch toggles and refetches with dm
test("(4) the DMs-only Switch toggles and refetches with dm", async () => {
  const api = makeApi();
  render(<MessagesTab apiToken="tok" api={api} />);
  await screen.findByText("Alpha#1234");

  const sw = screen.getByRole("switch", { name: /dms only/i });
  sw.focus();
  fireEvent.keyDown(sw, { key: " " });
  fireEvent.keyUp(sw, { key: " " });

  fireEvent.click(screen.getByRole("button", { name: "Filter" }));

  await waitFor(() =>
    expect(api.getBotMessages).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ dm: true }),
    ),
  );
});

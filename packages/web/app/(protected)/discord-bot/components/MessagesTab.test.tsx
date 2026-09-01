import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { BotMessage, Paginated } from "shared";

const sample: BotMessage = {
  id: 1,
  messageId: "m1",
  channelId: "chan-1",
  channelName: "general",
  guildId: "guild-1",
  authorId: "auth-1",
  authorTag: "alice",
  content: "hello world",
  attachments: null,
  isDm: false,
  direction: "incoming",
  createdAt: "2026-09-01T12:00:00.000Z",
};

async function defaultGetBotMessages(_token: string, params: { page?: number; offset?: number } = {}) {
  const page = params.page ?? 1;
  const data: Paginated<BotMessage> = {
    items: [{ ...sample, id: page, content: `hello page ${page}` }],
    total: 120,
    page,
    limit: 50,
    hasNext: page * 50 < 120,
  };
  return { success: true as const, data };
}

const getBotMessages = mock(defaultGetBotMessages);

const resolveDiscordNames = mock(async (_token: string, ids: string[]) => {
  const data: Record<string, string> = {};
  for (const id of ids) {
    if (id === "353223201913962496") data[id] = "OleEd";
  }
  return { success: true as const, data };
});

mock.module("@/lib/api-client", () => ({
  getBotMessages,
  resolveDiscordNames,
}));

mock.module("@/hooks/use-auto-refresh", () => ({
  useAutoRefresh: () => {},
}));

const { default: MessagesTab } = await import("./MessagesTab");

afterEach(() => {
  cleanup();
  getBotMessages.mockClear();
  getBotMessages.mockImplementation(defaultGetBotMessages);
  resolveDiscordNames.mockClear();
});

test("shows author and channel as Name (id)", async () => {
  render(<MessagesTab apiToken="test-token" />);

  await waitFor(() => {
    expect(document.body.textContent).toContain("alice (auth-1)");
    expect(document.body.textContent).toContain("general (chan-1)");
  });
});

test("requests 1-based page from the API, not offset", async () => {
  render(<MessagesTab apiToken="test-token" />);

  await waitFor(() => {
    expect(getBotMessages.mock.calls.length).toBeGreaterThan(0);
  });

  const firstParams = getBotMessages.mock.calls[0]?.[1] as { page?: number; offset?: number };
  expect(firstParams.page).toBe(1);
  expect(firstParams.offset).toBeUndefined();
});

test("Next sends the following page to the API", async () => {
  render(<MessagesTab apiToken="test-token" />);

  await waitFor(() => {
    expect(document.body.textContent).toContain("hello page 1");
  });

  const next = [...document.querySelectorAll("button")].find((b) => b.textContent === "Next");
  expect(next).toBeTruthy();
  fireEvent.click(next!);

  await waitFor(() => {
    const pages = getBotMessages.mock.calls.map((c) => (c[1] as { page?: number }).page);
    expect(pages).toContain(2);
    expect(document.body.textContent).toContain("hello page 2");
  });
});

test("typing in search does not fetch until Filter is clicked", async () => {
  render(<MessagesTab apiToken="test-token" />);

  await waitFor(() => {
    expect(getBotMessages.mock.calls.length).toBe(1);
  });

  const search = document.querySelector('input[placeholder="Search content..."]') as HTMLInputElement;
  fireEvent.change(search, { target: { value: "hello" } });
  fireEvent.input(search, { target: { value: "hello" } });

  await new Promise((r) => setTimeout(r, 40));
  expect(getBotMessages.mock.calls.length).toBe(1);
});

test("prefixes tagged users with their display name", async () => {
  getBotMessages.mockImplementation(async () => ({
    success: true as const,
    data: {
      items: [{
        ...sample,
        content: "<@353223201913962496> are you able to do that?",
      }],
      total: 1,
      page: 1,
      limit: 50,
      hasNext: false,
    },
  }));

  render(<MessagesTab apiToken="test-token" />);

  await waitFor(() => {
    expect(document.body.textContent).toContain(
      "OleEd <@353223201913962496> are you able to do that?",
    );
  });
});

test("clicking an author applies that author id as a filter", async () => {
  render(<MessagesTab apiToken="test-token" />);

  await waitFor(() => {
    expect(document.body.textContent).toContain("alice (auth-1)");
  });

  const authorBtn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("alice"),
  );
  fireEvent.click(authorBtn!);

  await waitFor(() => {
    const params = getBotMessages.mock.calls.at(-1)?.[1] as { author?: string; page?: number };
    expect(params.author).toBe("auth-1");
    expect(params.page).toBe(1);
  });
});

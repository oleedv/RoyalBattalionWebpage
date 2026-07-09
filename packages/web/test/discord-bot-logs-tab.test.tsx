// packages/web/test/discord-bot-logs-tab.test.tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BotLog } from "shared";
import LogsTab, { type LogsApi } from "@/app/(protected)/discord-bot/components/LogsTab";

// Fixtures
const log1: BotLog = {
  id: 1,
  level: 30,
  levelLabel: "INFO",
  module: "bot",
  message: "Bot started",
  data: null,
  createdAt: "2026-07-09T10:00:00.000Z",
};

const log2: BotLog = {
  id: 2,
  level: 50,
  levelLabel: "ERROR",
  module: "db",
  message: "Connection failed",
  data: { code: "ECONNREFUSED" },
  createdAt: "2026-07-09T11:00:00.000Z",
};

function makeApi(overrides: Partial<LogsApi> = {}): LogsApi {
  return {
    getBotLogs: mock(async () => ({
      success: true as const,
      data: { items: [log1, log2], total: 2, page: 0, limit: 100, hasNext: false },
    })),
    ...overrides,
  };
}

// (1) Renders logs with a StatusBadge level
test("(1) renders logs with StatusBadge level", async () => {
  render(<LogsTab apiToken="tok" api={makeApi()} />);
  expect(await screen.findByText("INFO")).toBeDefined();
  expect(screen.getByText("ERROR")).toBeDefined();
  expect(screen.getByText("Bot started")).toBeDefined();
});

// (2) Clicking a row with data expands the pre JSON
test("(2) clicking a row with data expands the pre JSON", async () => {
  render(<LogsTab apiToken="tok" api={makeApi()} />);
  await screen.findByText("Connection failed");
  expect(document.querySelector("pre")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Connection failed/ }));
  expect(document.querySelector("pre")).not.toBeNull();
  expect(document.querySelector("pre")?.textContent).toContain("ECONNREFUSED");
});

// (3) Changing the level Select refetches with the level param
test("(3) changing the level Select refetches with level param", async () => {
  const api = makeApi();
  render(<LogsTab apiToken="tok" api={api} />);
  await screen.findByText("INFO");

  fireEvent.click(screen.getByRole("combobox"));
  const opt = await screen.findByRole("option", { name: "Error" });
  fireEvent.pointerDown(opt, { pointerType: "mouse", buttons: 1 });
  fireEvent.click(opt);

  await waitFor(() =>
    expect(api.getBotLogs).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ level: 50 }),
    ),
  );
});

// (4) The auto-refresh Switch toggles
test("(4) the auto-refresh Switch toggles", async () => {
  render(<LogsTab apiToken="tok" api={makeApi()} />);
  await screen.findByText("INFO");

  const sw = screen.getByRole("switch", { name: /auto.?refresh/i });
  expect(sw.getAttribute("aria-checked")).toBe("false");
  sw.focus();
  fireEvent.keyDown(sw, { key: " " });
  fireEvent.keyUp(sw, { key: " " });
  expect(sw.getAttribute("aria-checked")).toBe("true");
});

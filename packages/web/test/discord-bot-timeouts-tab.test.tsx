// packages/web/test/discord-bot-timeouts-tab.test.tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { TicketTimeout } from "shared";
import TimeoutsTab, { type TimeoutsApi } from "@/app/(protected)/discord-bot/components/TimeoutsTab";

// Fixtures
const future = new Date(Date.now() + 2 * 3600000).toISOString(); // +2h from now

const to1: TicketTimeout = {
  id: 1,
  userId: "111222333",
  timedOutBy: "999888777",
  expiresAt: future,
  createdAt: "2026-07-09T10:00:00.000Z",
};

const to2: TicketTimeout = {
  id: 2,
  userId: "444555666",
  timedOutBy: "999888777",
  expiresAt: future,
  createdAt: "2026-07-09T09:00:00.000Z",
};

function makeApi(overrides: Partial<TimeoutsApi> = {}): TimeoutsApi {
  return {
    getTicketTimeouts: mock(async () => ({ success: true as const, data: [to1, to2] })),
    createTicketTimeout: mock(async () => ({ success: true as const })),
    expireTicketTimeout: mock(async () => ({ success: true as const })),
    resolveDiscordNames: mock(async () => ({
      success: true as const,
      data: { "111222333": "UserAlpha", "999888777": "AdminBob", "444555666": "UserBeta" },
    })),
    ...overrides,
  };
}

// (1) Renders timeouts from api.getTicketTimeouts — known user/name appears
test("(1) renders timeouts from getTicketTimeouts", async () => {
  render(<TimeoutsTab apiToken="tok" canManage={false} api={makeApi()} />);
  expect(await screen.findByText("UserAlpha")).toBeDefined();
  expect(await screen.findByText("UserBeta")).toBeDefined();
});

// (2) With canManage: "Add Timeout" reveals the form; filling + Create calls createTicketTimeout
test("(2) Add Timeout form submits to createTicketTimeout", async () => {
  const api = makeApi();
  render(<TimeoutsTab apiToken="tok" canManage={true} api={api} />);
  await screen.findByText("UserAlpha");

  // Toggle the form open
  fireEvent.click(screen.getByRole("button", { name: "Add Timeout" }));
  expect(screen.getByPlaceholderText(/123456789012345678/)).toBeDefined();

  // Fill in user ID
  fireEvent.change(screen.getByPlaceholderText(/123456789012345678/), {
    target: { value: "777666555" },
  });

  // Duration is already "24" by default — click Create
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() =>
    expect(api.createTicketTimeout).toHaveBeenCalledWith("tok", {
      userId: "777666555",
      hours: 24,
    }),
  );
});

// (3a) Expire Now -> AlertDialog -> confirm calls expireTicketTimeout
test("(3a) Expire Now AlertDialog confirm calls expireTicketTimeout", async () => {
  const api = makeApi();
  render(<TimeoutsTab apiToken="tok" canManage={true} api={api} />);
  await screen.findByText("UserAlpha");

  // Click "Expire Now" for the first timeout (id=1)
  const expireButtons = screen.getAllByRole("button", { name: "Expire Now" });
  fireEvent.click(expireButtons[0]);

  // AlertDialog should appear with the confirm button
  const confirmBtn = await screen.findByRole("button", { name: "Expire now" });
  fireEvent.click(confirmBtn);

  await waitFor(() =>
    expect(api.expireTicketTimeout).toHaveBeenCalledWith("tok", 1),
  );
});

// (3b) Cancel does NOT call expireTicketTimeout
test("(3b) Expire Now AlertDialog cancel does not call expireTicketTimeout", async () => {
  const api = makeApi();
  render(<TimeoutsTab apiToken="tok" canManage={true} api={api} />);
  await screen.findByText("UserAlpha");

  const expireButtons = screen.getAllByRole("button", { name: "Expire Now" });
  fireEvent.click(expireButtons[0]);

  // Wait for dialog to appear then cancel
  const cancelBtn = await screen.findByRole("button", { name: "Keep timeout" });
  fireEvent.click(cancelBtn);

  // expireTicketTimeout should NOT be called
  await waitFor(() =>
    expect((api.expireTicketTimeout as ReturnType<typeof mock>).mock.calls.length).toBe(0),
  );
});

// (4) canManage=false: no "Add Timeout" and no "Expire Now" controls
test("(4) canManage=false hides Add Timeout and Expire Now", async () => {
  render(<TimeoutsTab apiToken="tok" canManage={false} api={makeApi()} />);
  await screen.findByText("UserAlpha");

  expect(screen.queryByRole("button", { name: "Add Timeout" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Expire Now" })).toBeNull();
});

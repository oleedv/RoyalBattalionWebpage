import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionProvider } from "@/lib/permission-context";

// mock.module must precede the import of the module under test so mocks are
// in place when the component's module graph initialises.
mock.module("../app/(protected)/discord-bot/components/OverviewTab", () => ({
  default: () => <div data-testid="overview-tab" />,
}));
mock.module("../app/(protected)/discord-bot/components/TicketsTab", () => ({
  default: () => <div data-testid="tickets-tab" />,
}));
mock.module("../app/(protected)/discord-bot/components/ProspectsTab", () => ({
  default: () => <div data-testid="prospects-tab" />,
}));
mock.module("../app/(protected)/discord-bot/components/MessagesTab", () => ({
  default: () => <div data-testid="messages-tab" />,
}));
mock.module("../app/(protected)/discord-bot/components/LogsTab", () => ({
  default: () => <div data-testid="logs-tab" />,
}));
mock.module("../app/(protected)/discord-bot/components/TimeoutsTab", () => ({
  default: () => <div data-testid="timeouts-tab" />,
}));

import DiscordBotPage from "@/app/(protected)/discord-bot/page";

function renderWithPerms(
  permissions: string[],
  apiToken: string | null = "tok",
) {
  return render(
    <PermissionProvider
      permissions={permissions as any}
      apiToken={apiToken}
      user={null}
    >
      <DiscordBotPage />
    </PermissionProvider>,
  );
}

test("(1) user without bot permissions sees AccessDeniedCard and no tab triggers", () => {
  renderWithPerms([]);
  expect(screen.getByText("Insufficient Permissions")).toBeDefined();
  expect(screen.queryByRole("tab", { name: "Overview" })).toBeNull();
});

test("(2) user with view:discord-bot sees tab triggers and the overview tab", () => {
  renderWithPerms(["view:discord-bot"]);
  expect(screen.getByRole("tab", { name: "Overview" })).toBeDefined();
  expect(screen.getByRole("tab", { name: "Tickets" })).toBeDefined();
  expect(screen.getByTestId("overview-tab")).toBeDefined();
  expect(screen.queryByTestId("tickets-tab")).toBeNull();
});

test("(3) clicking Timeouts trigger switches the active tab", () => {
  renderWithPerms(["view:discord-bot"]);
  expect(screen.queryByTestId("timeouts-tab")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Timeouts" }));
  expect(screen.getByTestId("timeouts-tab")).toBeDefined();
  expect(screen.queryByTestId("overview-tab")).toBeNull();
});

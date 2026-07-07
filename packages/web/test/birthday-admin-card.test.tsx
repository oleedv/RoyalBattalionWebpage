import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BirthdayAdminCard from "@/app/(protected)/dashboard/birthday-admin-card";
import type { BirthdayConfig } from "shared";

const baseConfig: BirthdayConfig = {
  enabled: false,
  channelId: null,
  postTime: "09:00",
  timezone: "Europe/Oslo",
};

const ok = (data: BirthdayConfig) =>
  Promise.resolve({ success: true as const, data });

function makeNotify() {
  return { success: mock(() => {}), error: mock(() => {}) };
}

test("loads config and pre-fills the royal-lounge default channel", async () => {
  const api = {
    get: mock(() => ok(baseConfig)),
    update: mock((_t: string, d: Partial<BirthdayConfig>) =>
      ok({ ...baseConfig, ...d }),
    ),
  };
  render(<BirthdayAdminCard token="tok" api={api} notify={makeNotify()} />);
  const channel = await screen.findByLabelText("Channel ID");
  expect((channel as HTMLInputElement).value).toBe("460898033794809856");
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect((screen.getByLabelText("Post time") as HTMLInputElement).value).toBe("09:00");
  expect(screen.getByRole("combobox").textContent).toContain("Europe/Oslo");
});

test("save PATCHes the edited config and toasts success", async () => {
  const api = {
    get: mock(() => ok(baseConfig)),
    update: mock((_t: string, d: Partial<BirthdayConfig>) =>
      ok({ ...baseConfig, ...d } as BirthdayConfig),
    ),
  };
  const notify = makeNotify();
  render(<BirthdayAdminCard token="tok" api={api} notify={notify} />);
  await screen.findByLabelText("Channel ID");

  fireEvent.click(screen.getByRole("switch"));
  fireEvent.change(screen.getByLabelText("Post time"), {
    target: { value: "10:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
  const sent = api.update.mock.calls[0][1] as BirthdayConfig;
  expect(sent.enabled).toBe(true);
  expect(sent.postTime).toBe("10:30");
  expect(sent.channelId).toBe("460898033794809856");
  expect(notify.error).not.toHaveBeenCalled();
});

test("failed save toasts the server error", async () => {
  const api = {
    get: mock(() => ok(baseConfig)),
    update: mock(() =>
      Promise.resolve({ success: false as const, error: "Bot unreachable" }),
    ),
  };
  const notify = makeNotify();
  render(<BirthdayAdminCard token="tok" api={api} notify={notify} />);
  await screen.findByLabelText("Channel ID");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      "Bot unreachable",
      "Failed to save birthday settings",
    ),
  );
});

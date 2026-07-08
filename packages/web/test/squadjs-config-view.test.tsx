import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  SquadJSConfigView,
  type SquadJSConfigApi,
} from "@/app/(protected)/squadjs-config/squadjs-config-view";
import type { SquadJSPlugin } from "shared";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const basePlugins: SquadJSPlugin[] = [
  {
    plugin: "DiscordChat",
    enabled: true,
    channelID: "123456",
    ignoreChats: ["ChatSquad"],
    verbose: false,
    delay: 5,
  },
  {
    plugin: "AutoTKWarn",
    enabled: false,
    message: "Please apologize for the teamkill",
  },
];

const descriptions: Record<string, string> = {
  DiscordChat: "Relays in-game chat to Discord.",
  AutoTKWarn: "Warns players who teamkill.",
};

const fieldDescriptions: Record<string, Record<string, string>> = {
  DiscordChat: { channelID: "Discord channel ID for chat relay." },
};

function clonePlugins(): SquadJSPlugin[] {
  return JSON.parse(JSON.stringify(basePlugins)) as SquadJSPlugin[];
}

function makeApi(over: Partial<SquadJSConfigApi> = {}): SquadJSConfigApi {
  return {
    getSquadJSEnvironments: mock(async () => ({
      success: true as const,
      data: { environments: ["main", "battle"] },
    })),
    getSquadJSPlugins: mock(async (_token: string, env: string) => ({
      success: true as const,
      data: { plugins: clonePlugins(), environment: env },
    })),
    updateSquadJSPlugins: mock(async () => ({
      success: true as const,
      data: { saved: true as const },
    })),
    getSquadJSDescriptions: mock(async () => ({
      success: true as const,
      data: { descriptions, fieldDescriptions },
    })),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Renders plugins after load
// ---------------------------------------------------------------------------

test("renders plugins from api.getSquadJSPlugins after load", async () => {
  render(
    <SquadJSConfigView token="t" permissions={["manage:squadjs"]} api={makeApi()} />,
  );
  expect(await screen.findByText("DiscordChat")).toBeDefined();
  expect(screen.getByText("AutoTKWarn")).toBeDefined();
});

// ---------------------------------------------------------------------------
// 2. Developer superpower + view-only read-only
// ---------------------------------------------------------------------------

test("developer superpower: Review & Save renders and fields are editable", async () => {
  render(
    <SquadJSConfigView token="t" permissions={["developer"]} api={makeApi()} />,
  );
  await screen.findByText("DiscordChat");
  expect(screen.getByRole("button", { name: "Review & Save" })).toBeDefined();

  // expand DiscordChat -> its string field is editable (not readOnly)
  fireEvent.click(screen.getByRole("button", { name: "Expand DiscordChat" }));
  const input = screen.getByDisplayValue("123456") as HTMLInputElement;
  expect(input.readOnly).toBe(false);
});

test("view-only (view:squadjs): no Review & Save and fields are read-only", async () => {
  render(
    <SquadJSConfigView token="t" permissions={["view:squadjs"]} api={makeApi()} />,
  );
  await screen.findByText("DiscordChat");
  expect(screen.queryByRole("button", { name: "Review & Save" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Expand DiscordChat" }));
  const input = screen.getByDisplayValue("123456") as HTMLInputElement;
  expect(input.readOnly).toBe(true);
});

// ---------------------------------------------------------------------------
// 3. No permissions -> access denied
// ---------------------------------------------------------------------------

test("no permissions renders access-denied and no plugin list", async () => {
  render(<SquadJSConfigView token="t" permissions={[]} api={makeApi()} />);
  expect(await screen.findByText("Insufficient Permissions")).toBeDefined();
  expect(screen.queryByText("DiscordChat")).toBeNull();
});

// ---------------------------------------------------------------------------
// 4. Editing marks dirty, enables Review & Save, opens ConfigDiffDialog
// ---------------------------------------------------------------------------

test("editing a field marks dirty, enables Review & Save, and opens the diff dialog", async () => {
  render(
    <SquadJSConfigView token="t" permissions={["manage:squadjs"]} api={makeApi()} />,
  );
  await screen.findByText("DiscordChat");

  // disabled while pristine
  expect(
    (screen.getByRole("button", { name: "Review & Save" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Expand DiscordChat" }));
  fireEvent.change(screen.getByDisplayValue("123456"), {
    target: { value: "999" },
  });

  // enabled once dirty
  expect(
    (screen.getByRole("button", { name: "Review & Save" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Review & Save" }));

  // ConfigDiffDialog content appears (portal)
  expect(await screen.findByText("Review Changes")).toBeDefined();
  expect(
    screen.getByText((c) => c.includes('"channelID": "999"')),
  ).toBeDefined();
});

// ---------------------------------------------------------------------------
// 5. Commit & Deploy calls updateSquadJSPlugins(token, activeEnv, plugins)
// ---------------------------------------------------------------------------

test("Commit & Deploy calls updateSquadJSPlugins with (token, activeEnv, plugins)", async () => {
  const api = makeApi();
  render(
    <SquadJSConfigView token="t" permissions={["manage:squadjs"]} api={api} />,
  );
  await screen.findByText("DiscordChat");

  fireEvent.click(screen.getByRole("button", { name: "Expand DiscordChat" }));
  fireEvent.change(screen.getByDisplayValue("123456"), {
    target: { value: "999" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review & Save" }));
  await screen.findByText("Review Changes");
  fireEvent.click(screen.getByRole("button", { name: "Commit & Deploy" }));

  await waitFor(() => expect(api.updateSquadJSPlugins).toHaveBeenCalled());
  const call = (api.updateSquadJSPlugins as ReturnType<typeof mock>).mock
    .calls[0];
  expect(call[0]).toBe("t");
  expect(call[1]).toBe("main");
  const sent = call[2] as SquadJSPlugin[];
  const dc = sent.find((p) => p.plugin === "DiscordChat");
  expect(dc?.channelID).toBe("999");
});

// ---------------------------------------------------------------------------
// 6. Env switch while dirty -> discard AlertDialog (confirm switches, cancel keeps)
// ---------------------------------------------------------------------------

test("switching environment while dirty opens discard dialog; cancel keeps, confirm switches", async () => {
  const api = makeApi();
  render(
    <SquadJSConfigView token="t" permissions={["manage:squadjs"]} api={api} />,
  );
  await screen.findByText("DiscordChat");

  // make dirty
  fireEvent.click(screen.getByRole("button", { name: "Expand DiscordChat" }));
  fireEvent.change(screen.getByDisplayValue("123456"), {
    target: { value: "999" },
  });

  // attempt env switch while dirty -> confirm dialog appears
  fireEvent.click(screen.getByRole("tab", { name: "battle" }));
  expect(await screen.findByText("Discard unsaved changes?")).toBeDefined();

  // cancel -> stays on main, edit preserved, no battle fetch
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  await waitFor(() =>
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull(),
  );
  expect(screen.getByDisplayValue("999")).toBeDefined();
  expect(
    (api.getSquadJSPlugins as ReturnType<typeof mock>).mock.calls.some(
      (c) => c[1] === "battle",
    ),
  ).toBe(false);

  // attempt again -> confirm discard -> switches to battle
  fireEvent.click(screen.getByRole("tab", { name: "battle" }));
  await screen.findByText("Discard unsaved changes?");
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

  await waitFor(() =>
    expect(
      (api.getSquadJSPlugins as ReturnType<typeof mock>).mock.calls.some(
        (c) => c[1] === "battle",
      ),
    ).toBe(true),
  );
});

// ---------------------------------------------------------------------------
// 7. notConfigured -> EmptyState with GITHUB_CONFIG_TOKEN message
// ---------------------------------------------------------------------------

test("notConfigured renders EmptyState mentioning GITHUB_CONFIG_TOKEN", async () => {
  const api = makeApi({
    getSquadJSEnvironments: mock(async () => ({
      success: false as const,
      error: "GitHub integration not configured",
    })),
  });
  render(
    <SquadJSConfigView token="t" permissions={["manage:squadjs"]} api={api} />,
  );
  expect(await screen.findByText(/GITHUB_CONFIG_TOKEN/)).toBeDefined();
  expect(screen.queryByText("DiscordChat")).toBeNull();
});

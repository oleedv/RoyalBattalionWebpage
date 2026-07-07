import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileCard from "@/app/(protected)/dashboard/profile-card";
import type { UserWithRoles } from "shared";

const user: UserWithRoles = {
  id: "u1",
  discordId: "123456789012345678",
  discordName: "olie",
  displayName: null,
  steamId: null,
  eosId: null,
  avatarUrl: null,
  country: "NO",
  membershipDate: null,
  dateOfBirth: null,
  birthdayOptOut: false,
  birthdayShowAge: false,
  hasLoggedIn: true,
  disabled: false,
  disabledAt: null,
  disabledReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  roles: [{ id: "r1", discordRoleId: "9", name: "Member" }],
};

function makeNotify() {
  return { success: mock(() => {}), error: mock(() => {}) };
}

function baseProps(overrides: Partial<Parameters<typeof ProfileCard>[0]> = {}) {
  return {
    token: "tok",
    sessionName: "Olie",
    sessionEmail: "olie@example.com",
    sessionImage: null,
    user,
    ...overrides,
  };
}

test("renders identity cluster with field tips and roles", () => {
  render(<ProfileCard {...baseProps()} />);
  expect(screen.getByText("123456789012345678")).toBeDefined();
  expect(screen.getByText("Steam: not linked")).toBeDefined();
  expect(screen.getByText("NO")).toBeDefined();
  expect(screen.getByText("Member")).toBeDefined();
  expect(
    screen.getAllByText("If this is incorrect, create a community ticket.")
      .length,
  ).toBeGreaterThanOrEqual(3);
});

test("links a Steam ID, toasts success and swaps to the linked view", async () => {
  const api = {
    linkSteam: mock((_t: string, steamId: string) =>
      Promise.resolve({
        success: true as const,
        data: { ...user, steamId },
      }),
    ),
    updateBirthdayPrefs: mock(() =>
      Promise.resolve({
        success: true as const,
        data: { birthdayOptOut: false, birthdayShowAge: false },
      }),
    ),
  };
  const notify = makeNotify();
  render(<ProfileCard {...baseProps({ api, notify })} />);
  fireEvent.change(screen.getByPlaceholderText("Enter Steam64 ID to link"), {
    target: { value: "76561198000000001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  await waitFor(() => {
    expect(screen.getByText("76561198000000001")).toBeDefined();
  });
  expect(api.linkSteam).toHaveBeenCalledWith("tok", "76561198000000001");
  expect(notify.success).toHaveBeenCalledWith("Steam ID linked.");
  expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
});

test("empty Steam submit toasts a validation error without calling the API", () => {
  const api = {
    linkSteam: mock(() =>
      Promise.resolve({ success: false as const, error: "nope" }),
    ),
    updateBirthdayPrefs: mock(() =>
      Promise.resolve({ success: false as const, error: "nope" }),
    ),
  };
  const notify = makeNotify();
  render(<ProfileCard {...baseProps({ api, notify })} />);
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  expect(notify.error).toHaveBeenCalledWith("Please enter a Steam ID.");
  expect(api.linkSteam).not.toHaveBeenCalled();
});

test("birthday pref switch flips optimistically and reverts on failure", async () => {
  const api = {
    linkSteam: mock(() =>
      Promise.resolve({ success: false as const, error: "x" }),
    ),
    updateBirthdayPrefs: mock(() =>
      Promise.resolve({ success: false as const, error: "DB down" }),
    ),
  };
  const notify = makeNotify();
  render(<ProfileCard {...baseProps({ api, notify })} />);
  const optOut = screen.getByRole("switch", {
    name: "Don't announce my birthday",
  });
  expect(optOut.getAttribute("aria-checked")).toBe("false");
  // Base UI Switch renders span[role=switch]; happy-dom synthetic clicks don't
  // reach its pointer handlers, so toggle via the keyboard path (Space).
  optOut.focus();
  fireEvent.keyDown(optOut, { key: " " });
  fireEvent.keyUp(optOut, { key: " " });
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith("DB down", "Failed to save"),
  );
  expect(optOut.getAttribute("aria-checked")).toBe("false");
  expect(api.updateBirthdayPrefs).toHaveBeenCalledWith("tok", {
    birthdayOptOut: true,
  });
});

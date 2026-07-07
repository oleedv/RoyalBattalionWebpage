import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RequestsTab from "@/app/(protected)/whitelist/requests-tab";
import type { AdminGroup, WhitelistCandidate } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Seeder", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const candidate: WhitelistCandidate = {
  userId: "u1",
  discordName: "Olie",
  steamId: "76561198000000001",
  roleName: "Member",
};

type BasePropsType = {
  candidates: WhitelistCandidate[];
  groups: AdminGroup[];
  onApproved: ReturnType<typeof mock>;
  dismissed: Set<string>;
  setDismissed: ReturnType<typeof mock>;
  token: string | null;
  canManage: boolean;
  activeServer: string;
  notify: { error: ReturnType<typeof mock> };
  api?: Record<string, unknown>;
};

function baseProps(over: Record<string, unknown> = {}): BasePropsType & Record<string, unknown> {
  return {
    candidates: [candidate],
    groups,
    onApproved: mock(() => {}),
    dismissed: new Set<string>(),
    setDismissed: mock(() => {}),
    token: "tok",
    canManage: true,
    activeServer: "main",
    notify: { error: mock(() => {}) },
    ...over,
  } as BasePropsType & Record<string, unknown>;
}

test("approve posts the entry with the chosen group and reports up", async () => {
  const api = {
    addWhitelistEntry: mock(() =>
      Promise.resolve({ success: true as const, data: { id: "e9" } as never }),
    ),
  };
  const props = baseProps({ api });
  render(<RequestsTab {...(props as any)} />);
  fireEvent.change(screen.getByDisplayValue("Whitelist (default)"), {
    target: { value: "g1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(props.onApproved).toHaveBeenCalled());
  expect(api.addWhitelistEntry).toHaveBeenCalledWith("tok", "76561198000000001", {
    name: "Olie",
    groupId: "g1",
    server: "main",
  });
  expect(props.setDismissed).toHaveBeenCalled();
});

test("failed approve toasts and does not dismiss", async () => {
  const api = {
    addWhitelistEntry: mock(() =>
      Promise.resolve({ success: false as const, error: "Steam ID already whitelisted" }),
    ),
  };
  const props = baseProps({ api });
  render(<RequestsTab {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(props.notify.error).toHaveBeenCalledWith(
      "Steam ID already whitelisted",
      "Failed to approve request",
    ),
  );
  expect(props.setDismissed).not.toHaveBeenCalled();
});

test("no candidates renders the empty state; no permission renders the notice", () => {
  render(<RequestsTab {...(baseProps({ candidates: [] }) as any)} />);
  expect(screen.getByText(/No pending whitelist requests/)).toBeDefined();
  render(<RequestsTab {...(baseProps({ canManage: false }) as any)} />);
  expect(screen.getByText(/manage:whitelist permission/)).toBeDefined();
});

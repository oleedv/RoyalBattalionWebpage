import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImportDialog from "@/app/(protected)/whitelist/import-dialog";
import CfgDialog from "@/app/(protected)/whitelist/cfg-dialog";
import type { AdminGroup, Clan, WhitelistEntry } from "shared";

const groups: AdminGroup[] = [
  { id: "g1", name: "Whitelist", permissions: "reserve", sortOrder: 1, createdAt: "" },
];
const clans: Clan[] = [{ id: "c1", name: "Royal Battalion", tag: "RB", createdAt: "" }];
const existing: WhitelistEntry = {
  id: "e1", steamId: "111", server: "main", name: "Old", clan: null, clanId: null,
  clanName: null, role: null, groupId: null, groupName: null, userId: null,
  addedBy: "x", reason: null, expiresAt: null, createdAt: "",
};

test("parse classifies rows, disables import at 0 new, imports valid rows", async () => {
  const api = {
    bulkAddWhitelist: mock(() =>
      Promise.resolve({ success: true as const, data: { created: 1, skipped: [] } }),
    ),
  };
  const onImported = mock(() => {});
  render(
    <ImportDialog
      open
      onClose={mock(() => {})}
      entries={[existing]}
      groups={groups}
      clans={clans}
      token="tok"
      activeServer="main"
      onImported={onImported}
      api={api}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("Paste entries here, one per line..."), {
    target: {
      value: "// RB\nAdmin=222:Whitelist // Fresh\nAdmin=111:Whitelist // Dupe",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Parse" }));
  expect(screen.getByText("1 new")).toBeDefined();
  expect(screen.getByText("1 already whitelisted")).toBeDefined();
  expect(screen.getByText("Already whitelisted")).toBeDefined(); // per-row note

  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const sent = (api.bulkAddWhitelist.mock.calls as any)[0] as unknown[];
  const rows = sent[1] as { steamId: string; clanId?: string; clan?: string; groupId?: string }[];
  expect(rows.length).toBe(1); // dupe filtered out
  expect(rows[0].steamId).toBe("222");
  expect(rows[0].clanId).toBe("c1");
  expect(rows[0].clan).toBe("RB");
  expect(rows[0].groupId).toBe("g1");
  expect(sent[2]).toBe("main");
  expect((onImported.mock.calls as any)[0][0]).toContain("Imported 1 entry");
});

test("CfgDialog shows the content and the server in the title", () => {
  render(
    <CfgDialog open onClose={() => {}} content="Group=Whitelist:reserve" activeServer="main" />,
  );
  expect(screen.getByText("admins.cfg (main)")).toBeDefined();
  expect(screen.getByText("Group=Whitelist:reserve")).toBeDefined();
  expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
});

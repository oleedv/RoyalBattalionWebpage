import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Match, Paginated } from "shared";
import {
  MatchManagerView,
  type MatchManagerApi,
} from "@/app/(protected)/match-manager/match-manager-view";

const match1: Match = {
  id: "m1",
  date: "2024-01-15T00:00:00.000Z",
  map: "Yehorivka",
  layer: "Yehorivka_AAS_v1",
  result: "WIN",
  server: "Main Server",
  vodUrl: null,
  hidden: false,
  createdBy: "admin",
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z",
};

function paginated(
  items: Match[],
  total?: number,
): { success: true; data: Paginated<Match> } {
  return {
    success: true,
    data: {
      items,
      total: total ?? items.length,
      page: 1,
      limit: 20,
      hasNext: false,
    },
  };
}

function makeApi(overrides: Partial<MatchManagerApi> = {}): MatchManagerApi {
  return {
    getMatches: mock(async () => paginated([match1])),
    updateMatch: mock(async (_t, _id, data) => ({
      success: true as const,
      data: { ...match1, ...(data as Partial<Match>) },
    })),
    deleteMatch: mock(async () => ({ success: true as const })),
    resyncMatches: mock(async () => ({
      success: true as const,
      data: { resynced: 3 },
    })),
    ...overrides,
  };
}

test("renders match rows from getMatches", async () => {
  render(<MatchManagerView token="t" api={makeApi()} />);
  expect(await screen.findByText("Yehorivka")).toBeDefined();
  expect(screen.getByText("WIN")).toBeDefined();
});

test("clicking Edit enters edit mode — Input with date value appears", async () => {
  render(<MatchManagerView token="t" api={makeApi()} />);
  await screen.findByText("Yehorivka");

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

  // date input shows the ISO-date slice
  const dateInput = screen.getByDisplayValue("2024-01-15");
  expect(dateInput).toBeDefined();
});

test("Save calls updateMatch with changed field and exits edit mode", async () => {
  const api = makeApi();
  render(<MatchManagerView token="t" api={api} />);
  await screen.findByText("Yehorivka");

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

  // Change the map field
  const mapInput = screen.getByDisplayValue("Yehorivka");
  fireEvent.change(mapInput, { target: { value: "Fallujah" } });

  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(
      (api.updateMatch as ReturnType<typeof mock>).mock.calls.length,
    ).toBe(1),
  );

  const [, id, data] = (api.updateMatch as ReturnType<typeof mock>).mock
    .calls[0] as [string, string, Record<string, unknown>];
  expect(id).toBe("m1");
  expect((data as { map: string }).map).toBe("Fallujah");

  // Edit mode exits — date input disappears
  await waitFor(() =>
    expect(screen.queryByDisplayValue("2024-01-15")).toBeNull(),
  );
});

test("Cancel exits edit mode without calling updateMatch", async () => {
  const api = makeApi();
  render(<MatchManagerView token="t" api={api} />);
  await screen.findByText("Yehorivka");

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByDisplayValue("2024-01-15")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  await waitFor(() =>
    expect(screen.queryByDisplayValue("2024-01-15")).toBeNull(),
  );
  expect(
    (api.updateMatch as ReturnType<typeof mock>).mock.calls.length,
  ).toBe(0);
});

test("Switch toggling calls updateMatch with { hidden: true }", async () => {
  // match1 has hidden: false, so switch is checked=true (visible)
  const api = makeApi();
  render(<MatchManagerView token="t" api={api} />);
  await screen.findByText("Yehorivka");

  // Base UI Switch ignores synthetic clicks in happy-dom; toggle via keyboard.
  const sw = screen.getByRole("switch", { name: "Toggle visibility" });
  sw.focus();
  fireEvent.keyDown(sw, { key: " " });
  fireEvent.keyUp(sw, { key: " " });

  await waitFor(() =>
    expect(
      (api.updateMatch as ReturnType<typeof mock>).mock.calls.length,
    ).toBe(1),
  );

  const [, id, data] = (api.updateMatch as ReturnType<typeof mock>).mock
    .calls[0] as [string, string, Record<string, unknown>];
  expect(id).toBe("m1");
  expect((data as { hidden: boolean }).hidden).toBe(true);
});

test("Delete calls deleteMatch and the row disappears", async () => {
  const api = makeApi();
  render(<MatchManagerView token="t" api={api} />);
  await screen.findByText("Yehorivka");

  fireEvent.click(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() =>
    expect(
      (api.deleteMatch as ReturnType<typeof mock>).mock.calls.length,
    ).toBe(1),
  );
  const [, id] = (api.deleteMatch as ReturnType<typeof mock>).mock.calls[0] as [
    string,
    string,
  ];
  expect(id).toBe("m1");

  await waitFor(() => expect(screen.queryByText("Yehorivka")).toBeNull());
});

test("Resync calls resyncMatches and shows the message", async () => {
  const api = makeApi();
  render(<MatchManagerView token="t" api={api} />);
  await screen.findByText("Yehorivka");

  fireEvent.click(screen.getByRole("button", { name: "Resync" }));

  await waitFor(() =>
    expect(
      (api.resyncMatches as ReturnType<typeof mock>).mock.calls.length,
    ).toBe(1),
  );
  await waitFor(() =>
    expect(screen.getByText("Resynced 3 matches")).toBeDefined(),
  );
});

test("Next page calls getMatches with incremented page", async () => {
  // total: 25, PAGE_SIZE: 20 → totalPages: 2 → pagination visible
  const api = makeApi({
    getMatches: mock(async () => paginated([match1], 25)),
  });
  render(<MatchManagerView token="t" api={api} />);
  await screen.findByText("Yehorivka");

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  await waitFor(() => {
    const calls = (api.getMatches as ReturnType<typeof mock>).mock
      .calls as [string, { page?: number; limit?: number }][];
    const hasPage2 = calls.some(([, params]) => params.page === 2);
    expect(hasPage2).toBe(true);
  });
});

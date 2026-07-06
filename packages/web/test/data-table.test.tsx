import { test, expect } from "bun:test";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table-v2";

type Row = { id: string; name: string; steamId: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "steamId", header: "Steam ID", meta: { mono: true } },
];

const data: Row[] = [
  { id: "1", name: "Brick", steamId: "765611980999" },
  { id: "2", name: "Aldo", steamId: "765611980111" },
  { id: "3", name: "Falke", steamId: "765611980555" },
];

test("renders rows and mono cells", () => {
  render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);
  expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3
  const steamCell = screen.getByText("765611980999");
  expect(steamCell.closest("td")!.className).toContain("font-mono");
});

test("sorts by column header click", () => {
  render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);
  fireEvent.click(screen.getByRole("button", { name: /Name/ }));
  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("Aldo")).toBeDefined();
});

test("selection drives the bulk bar", () => {
  render(
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      enableSelection
      bulkActions={(rows) => <span>{rows.length} selected</span>}
    />,
  );
  expect(screen.queryByText(/selected/)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
  expect(screen.getByText("3 selected")).toBeDefined();
});

test("paginates", () => {
  render(
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      pageSize={2}
    />,
  );
  expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Falke")).toBeDefined();
});

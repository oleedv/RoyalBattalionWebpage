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

test("loading renders skeleton rows with aria-busy, hiding data", () => {
  const { container } = render(
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      loading
      skeletonRows={4}
    />,
  );
  expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  expect(screen.getAllByRole("row")).toHaveLength(5); // header + 4 skeletons
  expect(screen.queryByText("Brick")).toBeNull();
  expect(screen.queryByText("No results.")).toBeNull();
});

test("expandable rows toggle a full-width detail cell", () => {
  render(
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      renderDetail={(row) => <div>Detail for {row.name}</div>}
    />,
  );
  expect(screen.queryByText("Detail for Brick")).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Expand row" })[0]);
  const detail = screen.getByText("Detail for Brick");
  expect(detail.closest("td")!.getAttribute("colspan")).toBe("3"); // expander + 2 columns
  fireEvent.click(screen.getByRole("button", { name: "Collapse row" }));
  expect(screen.queryByText("Detail for Brick")).toBeNull();
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

// Fixtures for new-prop tests (2-field row to avoid collision with the 3-field Row above)
type SmRow = { id: string; name: string };
const smRows: SmRow[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];
const smCols = [{ accessorKey: "name", header: "Name" }] as ColumnDef<SmRow, unknown>[];

test("onRowClick fires for row clicks but not for interactive children", () => {
  const clicked: string[] = [];
  render(
    <DataTable
      columns={[
        ...smCols,
        {
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <>
              <button>act-{row.original.id}</button>
              <a href={`/profile/${row.original.id}`}>link-{row.original.id}</a>
            </>
          ),
        },
      ]}
      data={smRows}
      getRowId={(r) => r.id}
      onRowClick={(r) => clicked.push(r.id)}
    />,
  );
  fireEvent.click(screen.getByText("Alpha"));
  expect(clicked).toEqual(["1"]);
  fireEvent.click(screen.getByText("act-2"));
  expect(clicked).toEqual(["1"]); // button click must not bubble into onRowClick
  fireEvent.click(screen.getByText("link-2"));
  expect(clicked).toEqual(["1"]); // anchor click (entries "profile ->") must not either
});

test("rowClassName applies per-row classes", () => {
  render(
    <DataTable
      columns={smCols}
      data={smRows}
      getRowId={(r) => r.id}
      rowClassName={(r) => (r.id === "2" ? "opacity-50" : undefined)}
    />,
  );
  const beta = screen.getByText("Beta").closest("tr")!;
  expect(beta.className).toContain("opacity-50");
  const alpha = screen.getByText("Alpha").closest("tr")!;
  expect(alpha.className).not.toContain("opacity-50");
});

test("initialSorting sorts on first render", () => {
  render(
    <DataTable
      columns={smCols}
      data={[{ id: "1", name: "Zulu" }, { id: "2", name: "Alpha" }]}
      getRowId={(r) => r.id}
      initialSorting={[{ id: "name", desc: false }]}
    />,
  );
  const cells = screen.getAllByRole("row").slice(1); // skip header row
  expect(cells[0].textContent).toContain("Alpha");
  expect(cells[1].textContent).toContain("Zulu");
});

test("serverPagination renders all rows and drives the callback pager", () => {
  const pages: number[] = [];
  const many: SmRow[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: `P${i}`,
  }));
  render(
    <DataTable
      columns={smCols}
      data={many}
      getRowId={(r) => r.id}
      pageSize={10}
      serverPagination={{ page: 2, totalPages: 5, onPageChange: (p) => pages.push(p) }}
    />,
  );
  // no client slicing: all 30 rows render even though pageSize is 10
  expect(screen.getAllByRole("row").length).toBe(31);
  expect(screen.getByText("2/5")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(pages).toEqual([3, 1]);
});

"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SkeletonTableRows } from "@/components/skeleton";
import { cn } from "@/lib/utils";

export type ColumnMeta = { mono?: boolean; className?: string };

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  enableSelection?: boolean;
  bulkActions?: (rows: TData[], clear: () => void) => React.ReactNode;
  pageSize?: number;
  emptyState?: React.ReactNode;
  className?: string;
  /** Show skeleton rows instead of data. Use for the initial load only. */
  loading?: boolean;
  /** Number of skeleton rows to render while loading (default 6). */
  skeletonRows?: number;
  /** When set, rows get a disclosure chevron toggling a full-width detail cell. */
  renderDetail?: (row: TData) => React.ReactNode;
  /** Whole-row drill-in. Ignored for clicks on interactive elements inside cells. */
  onRowClick?: (row: TData) => void;
  /** Per-row class hook (e.g. de-emphasize expired rows). */
  rowClassName?: (row: TData) => string | undefined;
  /** Initial sort state (tanstack SortingState). */
  initialSorting?: SortingState;
  /**
   * Server-side pagination: render all passed rows and drive the pager via
   * callback instead of slicing client-side.
   */
  serverPagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  enableSelection = false,
  bulkActions,
  pageSize = 20,
  emptyState,
  className,
  loading = false,
  skeletonRows = 6,
  renderDetail,
  onRowClick,
  rowClassName,
  initialSorting,
  serverPagination,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    initialSorting ?? [],
  );
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    const prefix: ColumnDef<TData, unknown>[] = [];
    if (enableSelection) {
      prefix.push({
        id: "__select",
        size: 32,
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={
              table.getIsSomePageRowsSelected() &&
              !table.getIsAllPageRowsSelected()
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(value === true)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
          />
        ),
      });
    }
    if (renderDetail) {
      prefix.push({
        id: "__expander",
        size: 32,
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <button
            type="button"
            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
            aria-expanded={row.getIsExpanded()}
            className="inline-flex items-center text-text-muted hover:text-text-primary"
            onClick={() => row.toggleExpanded()}
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ),
      });
    }
    return prefix.length > 0 ? [...prefix, ...columns] : columns;
  }, [columns, enableSelection, renderDetail]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection, expanded },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    getRowId,
    enableRowSelection: enableSelection,
    getRowCanExpand: () => Boolean(renderDetail),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: serverPagination ? undefined : getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    autoResetPageIndex: false,
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const pageCount = table.getPageCount();

  function handleRowClick(e: React.MouseEvent, row: TData) {
    if (!onRowClick) return;
    const target = e.target as HTMLElement;
    if (target.closest("a,button,input,select,textarea,label,[role=checkbox]")) return;
    onRowClick(row);
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className="overflow-hidden rounded-sm border border-border"
        aria-busy={loading || undefined}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      width:
                        header.getSize() !== 150 ? header.getSize() : undefined,
                    }}
                    className="h-9 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-text-primary"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {{
                          asc: <ArrowUp className="size-3" />,
                          desc: <ArrowDown className="size-3" />,
                        }[header.column.getIsSorted() as string] ?? (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows
                rows={skeletonRows}
                columns={allColumns.map((c, i) => ({ key: c.id ?? `c${i}` }))}
              />
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="h-32">
                  {emptyState ?? (
                    <p className="text-center text-sm text-text-muted">
                      No results.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    onClick={(e) => handleRowClick(e, row.original)}
                    className={cn(
                      "h-8",
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row.original),
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | ColumnMeta
                        | undefined;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "py-1 text-[13px]",
                            meta?.mono &&
                              "font-mono text-xs tabular-nums text-text-secondary",
                            meta?.className,
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {renderDetail && row.getIsExpanded() && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={allColumns.length}
                        className="bg-bg-secondary/30 px-4 py-3"
                      >
                        {renderDetail(row.original)}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {(serverPagination ? serverPagination.totalPages > 1 : pageCount > 1) && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {serverPagination
              ? `${serverPagination.page}/${serverPagination.totalPages}`
              : `${table.getState().pagination.pageIndex + 1}/${pageCount}`}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={
              serverPagination
                ? serverPagination.page <= 1
                : !table.getCanPreviousPage()
            }
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(serverPagination.page - 1)
                : table.previousPage()
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={
              serverPagination
                ? serverPagination.page >= serverPagination.totalPages
                : !table.getCanNextPage()
            }
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(serverPagination.page + 1)
                : table.nextPage()
            }
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {enableSelection && selectedRows.length > 0 && bulkActions && (
        <div className="sticky bottom-4 z-10 mt-3 flex items-center gap-3 rounded-sm border border-border-accent bg-bg-card/95 px-4 py-2 shadow-lg backdrop-blur">
          {bulkActions(selectedRows, () => table.resetRowSelection())}
        </div>
      )}
    </div>
  );
}

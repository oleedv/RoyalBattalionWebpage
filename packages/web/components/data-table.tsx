"use client";

import { Fragment, type ReactNode } from "react";
import { SkeletonTableRows } from "./skeleton";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowClassName?: string | ((item: T) => string);
  /** Show skeleton rows instead of data. Use for the initial load only. */
  loading?: boolean;
  /** Number of skeleton rows to render while loading (default 6). */
  skeletonRows?: number;
  isExpanded?: (item: T) => boolean;
  renderExpanded?: (item: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No items found",
  onRowClick,
  rowClassName,
  loading = false,
  skeletonRows = 6,
  isExpanded,
  renderExpanded,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto" aria-busy={loading || undefined}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted ${col.className || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonTableRows rows={skeletonRows} columns={columns} />
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => {
              const className =
                typeof rowClassName === "function"
                  ? rowClassName(item)
                  : rowClassName;
              const expanded = Boolean(isExpanded?.(item));
              return (
                <Fragment key={keyExtractor(item)}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    className={`${expanded ? "border-b-0 bg-bg-secondary/40" : "border-b border-border/50"} transition-colors hover:bg-bg-secondary/50 ${onRowClick ? "cursor-pointer" : ""} ${className || ""}`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 ${col.className || ""}`}
                      >
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                  {expanded && renderExpanded && (
                    <tr className="border-b border-border/50">
                      <td colSpan={columns.length} className="bg-bg-secondary/20 px-4 pb-4 pt-1">
                        {renderExpanded(item)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

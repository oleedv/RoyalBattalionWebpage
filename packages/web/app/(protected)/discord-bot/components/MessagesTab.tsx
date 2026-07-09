"use client";

import { useState, useEffect, useCallback } from "react";
import { getBotMessages } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table-v2";
import { StatusBadge } from "@/components/status-badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/search-input-v2";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { ColumnDef } from "@tanstack/react-table";
import type { BotMessage } from "shared";

const PAGE_SIZE = 50;

export type MessagesApi = { getBotMessages: typeof getBotMessages };
const defaultApi: MessagesApi = { getBotMessages };

const columns: ColumnDef<BotMessage, unknown>[] = [
  {
    id: "time",
    header: "Time",
    accessorFn: (row) => row.createdAt,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-text-muted">
        {new Date(row.original.createdAt).toLocaleString()}
      </span>
    ),
    meta: { mono: true },
  },
  {
    id: "author",
    header: "Author",
    accessorKey: "authorTag",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-text-primary">
        {row.original.authorTag}
      </span>
    ),
  },
  {
    id: "channel",
    header: "Channel",
    accessorFn: (row) => row.channelName || row.channelId,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-text-secondary">
        {row.original.channelName || row.original.channelId}
      </span>
    ),
  },
  {
    id: "content",
    header: "Content",
    accessorKey: "content",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-md truncate text-text-secondary">
        {row.original.content || ""}
        {row.original.attachments && row.original.attachments.length > 0 && (
          <span className="ml-1 rounded-sm bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
            {row.original.attachments.length} file
            {row.original.attachments.length > 1 ? "s" : ""}
          </span>
        )}
      </span>
    ),
  },
  {
    id: "type",
    header: "Type",
    accessorFn: (row) => (row.isDm ? "DM" : "Guild"),
    enableSorting: false,
    cell: ({ row }) =>
      row.original.isDm ? (
        <StatusBadge tone="accent">DM</StatusBadge>
      ) : (
        <span className="text-xs text-text-muted">Guild</span>
      ),
  },
];

export default function MessagesTab({
  apiToken,
  api = defaultApi,
}: {
  apiToken: string;
  api?: MessagesApi;
}) {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Filters
  const [author, setAuthor] = useState("");
  const [channel, setChannel] = useState("");
  const [search, setSearch] = useState("");
  const [dmOnly, setDmOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchMessages = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      const res = await api.getBotMessages(apiToken, {
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
        author: author || undefined,
        channel: channel || undefined,
        dm: dmOnly || undefined,
        search: search || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      if (res.success && res.data) {
        setMessages(res.data.items);
        setTotal(res.data.total);
      } else {
        setError(res.error || "Failed to load messages");
      }
      setLoading(false);
    },
    [apiToken, api, author, channel, search, dmOnly, dateFrom, dateTo],
  );

  useEffect(() => {
    fetchMessages(page);
  }, [page, fetchMessages]);

  const silentRefreshMessages = useCallback(async () => {
    try {
      const res = await api.getBotMessages(apiToken, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        author: author || undefined,
        channel: channel || undefined,
        dm: dmOnly || undefined,
        search: search || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      if (res.success && res.data) {
        setMessages(res.data.items);
        setTotal(res.data.total);
      }
    } catch {
      /* silent */
    }
  }, [apiToken, api, page, author, channel, search, dmOnly, dateFrom, dateTo]);

  useAutoRefresh(silentRefreshMessages, 20_000, !!apiToken);

  function applyFilters() {
    setPage(0);
    fetchMessages(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search content..."
        />
        <Input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Author ID..."
        />
        <Input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Channel ID..."
        />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              aria-label="DMs only"
              checked={dmOnly}
              onCheckedChange={(v) => {
                setDmOnly(v);
                setPage(0);
              }}
            />
            <span className="text-sm text-text-secondary">DMs only</span>
          </div>
          <Button onClick={applyFilters}>Filter</Button>
        </div>
      </div>

      {/* Date range */}
      <div className="mb-4 flex gap-3">
        <Input
          type="datetime-local"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-auto"
        />
        <span className="self-center text-xs text-text-muted">to</span>
        <Input
          type="datetime-local"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-auto"
        />
      </div>

      {/* Results info */}
      <div className="mb-3">
        <span className="text-xs text-text-muted">
          {total.toLocaleString()} messages {loading && "(loading...)"}
        </span>
      </div>

      {/* Table or error */}
      {error ? (
        <div className="text-danger">{error}</div>
      ) : (
        <DataTable
          columns={columns}
          data={messages}
          getRowId={(row) => String(row.id)}
          loading={loading && messages.length === 0}
          skeletonRows={8}
          emptyState={<EmptyState message="No messages found" />}
          serverPagination={{
            page: page + 1,
            totalPages: Math.max(1, totalPages),
            onPageChange: (p) => setPage(p - 1),
          }}
        />
      )}
    </div>
  );
}
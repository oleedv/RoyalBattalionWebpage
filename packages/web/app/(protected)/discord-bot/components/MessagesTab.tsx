"use client";

import { useState, useEffect, useCallback } from "react";
import { getBotMessages } from "@/lib/api-client";
import type { BotMessage } from "shared";

const PAGE_SIZE = 50;

export default function MessagesTab({ apiToken }: { apiToken: string }) {
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

  const fetchMessages = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    const res = await getBotMessages(apiToken, {
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
  }, [apiToken, author, channel, search, dmOnly, dateFrom, dateTo]);

  useEffect(() => {
    fetchMessages(page);
  }, [page, fetchMessages]);

  function applyFilters() {
    setPage(0);
    fetchMessages(0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") applyFilters();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search content..."
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Author ID..."
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
        />
        <input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Channel ID..."
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={dmOnly}
              onChange={(e) => { setDmOnly(e.target.checked); setPage(0); }}
              className="rounded-sm"
            />
            DMs only
          </label>
          <button
            onClick={applyFilters}
            className="rounded-sm bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Date range */}
      <div className="mb-6 flex gap-3">
        <input
          type="datetime-local"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        />
        <span className="self-center text-xs text-text-muted">to</span>
        <input
          type="datetime-local"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        />
      </div>

      {/* Results info */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {total.toLocaleString()} messages {loading && "(loading...)"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs text-text-muted">
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="text-danger">{error}</div>
      ) : messages.length === 0 && !loading ? (
        <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
          No messages found
        </div>
      ) : (
        <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Author</th>
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Channel</th>
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Content</th>
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Type</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="border-b border-border/30 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-text-muted">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-text-primary">
                      {m.authorTag}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                      {m.channelName || m.channelId}
                    </td>
                    <td className="max-w-md truncate px-4 py-2 text-text-secondary">
                      {m.content || ""}
                      {m.attachments && m.attachments.length > 0 && (
                        <span className="ml-1 rounded-sm bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
                          {m.attachments.length} file{m.attachments.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {m.isDm ? (
                        <span className="rounded-sm border border-accent/30 bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">DM</span>
                      ) : (
                        <span className="text-xs text-text-muted">Guild</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

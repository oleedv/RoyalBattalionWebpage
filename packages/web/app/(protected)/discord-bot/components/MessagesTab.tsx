"use client";

import { useState, useEffect, useCallback, useMemo, type KeyboardEvent, type ReactNode } from "react";
import { getBotMessages } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDiscordNameMap } from "@/hooks/use-discord-names";
import { SkeletonTableRows } from "@/components/skeleton";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { BotMessage } from "shared";
import { authorLabel, formatNamedId } from "./message-labels";
import { extractUserMentionIds, formatUserMentions } from "./mention-format";

const PAGE_SIZE = 50;

type Filters = {
  author: string;
  channel: string;
  search: string;
  dmOnly: boolean;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  author: "",
  channel: "",
  search: "",
  dmOnly: false,
  dateFrom: "",
  dateTo: "",
};

const MESSAGE_COLUMNS = [
  { key: "time" },
  { key: "author" },
  { key: "channel" },
  { key: "content" },
  { key: "type" },
];

const pagerBtn =
  "rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:pointer-events-none disabled:opacity-30";

function NamedId({
  name,
  id,
  active,
  onClick,
  title,
}: {
  name: string | null | undefined;
  id: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  if (!id && !name) return <span className="text-text-muted">—</span>;
  const label = formatNamedId(name, id);
  const idSuffix = id && name?.trim() && name.trim() !== id ? ` (${id})` : "";
  const visibleName = idSuffix ? name!.trim() : label;

  const body = (
    <>
      <span className="truncate">{visibleName}</span>
      {idSuffix && (
        <span className="font-mono text-[11px] text-text-muted">{idSuffix}</span>
      )}
    </>
  );

  if (!onClick || !id) {
    return <span className="inline-flex max-w-[18rem] items-baseline">{body}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className={`inline-flex max-w-[18rem] items-baseline text-left hover:text-accent ${
        active ? "text-accent" : ""
      }`}
    >
      {body}
    </button>
  );
}

function PaginationBar({
  page,
  totalPages,
  loading,
  rangeLabel,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: {
  page: number;
  totalPages: number;
  loading: boolean;
  rangeLabel: string;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-text-muted">
        {rangeLabel}
        {loading && " (loading...)"}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={onFirst} disabled={atStart || loading} className={pagerBtn} aria-label="First page">
            First
          </button>
          <button type="button" onClick={onPrev} disabled={atStart || loading} className={pagerBtn} aria-label="Previous page">
            Prev
          </button>
          <span className="px-3 text-xs text-text-muted">
            {page} / {totalPages}
          </span>
          <button type="button" onClick={onNext} disabled={atEnd || loading} className={pagerBtn} aria-label="Next page">
            Next
          </button>
          <button type="button" onClick={onLast} disabled={atEnd || loading} className={pagerBtn} aria-label="Last page">
            Last
          </button>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ message }: { message: BotMessage }) {
  let kind: ReactNode;
  if (message.isDm) {
    kind = (
      <span className="rounded-sm border border-accent/30 bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
        DM
      </span>
    );
  } else if (message.threadId) {
    kind = (
      <span className="rounded-sm border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
        Thread
      </span>
    );
  } else {
    kind = <span className="text-xs text-text-muted">Guild</span>;
  }

  const outgoing = message.direction === "outgoing";
  return (
    <div className="flex flex-col gap-0.5">
      {kind}
      <span className={`text-[10px] uppercase tracking-wide ${outgoing ? "text-accent" : "text-text-muted"}`}>
        {outgoing ? "Out" : "In"}
      </span>
    </div>
  );
}

export default function MessagesTab({ apiToken }: { apiToken: string }) {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [author, setAuthor] = useState("");
  const [channel, setChannel] = useState("");
  const [search, setSearch] = useState("");
  const [dmOnly, setDmOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const { nameMap, resolveNames } = useDiscordNameMap(apiToken);

  const draft: Filters = { author, channel, search, dmOnly, dateFrom, dateTo };
  const hasActiveFilters = Boolean(
    applied.author || applied.channel || applied.search || applied.dmOnly || applied.dateFrom || applied.dateTo,
  );

  const fetchMessages = useCallback(
    async (pageNum: number, filters: Filters) => {
      setLoading(true);
      setError(null);
      const res = await getBotMessages(apiToken, {
        limit: PAGE_SIZE,
        page: pageNum,
        author: filters.author || undefined,
        channel: filters.channel || undefined,
        dm: filters.dmOnly || undefined,
        search: filters.search || undefined,
        from: filters.dateFrom || undefined,
        to: filters.dateTo || undefined,
      });
      if (res.success && res.data) {
        setMessages(res.data.items);
        setTotal(res.data.total);
      } else {
        setError(res.error || "Failed to load messages");
      }
      setLoading(false);
    },
    [apiToken],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    fetchMessages(page, applied);
  }, [page, applied, fetchMessages]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const silentRefreshMessages = useCallback(async () => {
    try {
      const res = await getBotMessages(apiToken, {
        limit: PAGE_SIZE,
        page,
        author: applied.author || undefined,
        channel: applied.channel || undefined,
        dm: applied.dmOnly || undefined,
        search: applied.search || undefined,
        from: applied.dateFrom || undefined,
        to: applied.dateTo || undefined,
      });
      if (res.success && res.data) {
        setMessages(res.data.items);
        setTotal(res.data.total);
      }
    } catch {
      /* silent */
    }
  }, [apiToken, page, applied]);

  useAutoRefresh(silentRefreshMessages, 20_000, !!apiToken);

  useEffect(() => {
    const ids = messages.flatMap((m) => [
      ...extractUserMentionIds(m.content),
      ...extractUserMentionIds(m.replyToContent),
    ]);
    if (ids.length > 0) void resolveNames(ids);
  }, [messages, resolveNames]);

  const mentionNames = useMemo(() => {
    const merged: Record<string, string> = { ...nameMap };
    for (const m of messages) {
      if (m.authorId && m.authorTag && !merged[m.authorId]) {
        merged[m.authorId] = m.authorTag;
      }
    }
    return merged;
  }, [nameMap, messages]);

  function applyFilters(next: Filters = draft) {
    setAuthor(next.author);
    setChannel(next.channel);
    setSearch(next.search);
    setDmOnly(next.dmOnly);
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    setApplied(next);
    setPage(1);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") applyFilters();
  }

  function clearFilters() {
    setAuthor("");
    setChannel("");
    setSearch("");
    setDmOnly(false);
    setDateFrom("");
    setDateTo("");
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  function filterByAuthor(id: string) {
    applyFilters({ ...applied, author: applied.author === id ? "" : id });
  }

  function filterByChannel(id: string) {
    applyFilters({ ...applied, channel: applied.channel === id ? "" : id });
  }

  const safePage = Math.min(page, totalPages);

  const rangeStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);
  const rangeLabel =
    total === 0
      ? "0 messages"
      : `${formatNumber(rangeStart)}–${formatNumber(rangeEnd)} of ${formatNumber(total)}`;

  const pager = {
    page: safePage,
    totalPages,
    loading,
    rangeLabel,
    onFirst: () => setPage(1),
    onPrev: () => setPage((p) => Math.max(1, p - 1)),
    onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    onLast: () => setPage(totalPages),
  };

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted">
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
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={dmOnly}
            onChange={(e) => applyFilters({ ...draft, dmOnly: e.target.checked })}
            className="rounded-sm"
          />
          DMs only
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          From
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            onKeyDown={handleKeyDown}
            className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          To
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            onKeyDown={handleKeyDown}
            className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => applyFilters()}
          className="rounded-sm bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Filter
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-sm border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
          >
            Clear
          </button>
        )}
        <span className="text-[11px] text-text-muted">Click an author or channel to filter by that ID.</span>
      </div>

      <div className="mb-3">
        <PaginationBar {...pager} />
      </div>

      {error ? (
        <div className="text-danger">{error}</div>
      ) : messages.length === 0 && !loading ? (
        <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
          <p>{hasActiveFilters ? "No messages match these filters." : "No messages found."}</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div
          className="facet-border overflow-hidden rounded-sm bg-bg-card"
          aria-busy={loading && messages.length === 0}
        >
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
              <tbody className={loading && messages.length > 0 ? "opacity-60" : undefined}>
                {loading && messages.length === 0 ? (
                  <SkeletonTableRows rows={8} columns={MESSAGE_COLUMNS} />
                ) : (
                  messages.map((m) => {
                    const expanded = expandedId === m.id;
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setExpandedId(expanded ? null : m.id)}
                        className={`cursor-pointer border-b border-border/30 last:border-0 transition-colors hover:bg-bg-card-hover ${
                          m.direction === "outgoing" ? "bg-accent/5" : ""
                        } ${expanded ? "bg-bg-tertiary/40" : ""}`}
                      >
                        <td className="whitespace-nowrap px-4 py-2 align-top text-text-muted">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 align-top text-text-primary">
                          <NamedId
                            name={m.authorTag}
                            id={m.authorId}
                            active={applied.author === m.authorId}
                            onClick={() => filterByAuthor(m.authorId)}
                            title={applied.author === m.authorId ? "Clear author filter" : `Filter by ${authorLabel(m)}`}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 align-top text-text-secondary">
                          {m.isDm ? (
                            <NamedId
                              name="DM"
                              id={m.channelId}
                              active={applied.channel === m.channelId}
                              onClick={() => filterByChannel(m.channelId)}
                              title="Filter by this DM channel"
                            />
                          ) : m.threadName ? (
                            <span className="inline-flex items-baseline gap-1">
                              {(m.parentChannelName || m.parentChannelId) && (
                                <>
                                  <NamedId
                                    name={m.parentChannelName}
                                    id={m.parentChannelId || ""}
                                    active={applied.channel === m.parentChannelId}
                                    onClick={() => m.parentChannelId && filterByChannel(m.parentChannelId)}
                                    title="Filter by parent channel"
                                  />
                                  <span className="text-text-muted">›</span>
                                </>
                              )}
                              <NamedId
                                name={m.threadName}
                                id={m.threadId || m.channelId}
                                active={applied.channel === (m.threadId || m.channelId)}
                                onClick={() => filterByChannel(m.threadId || m.channelId)}
                                title="Filter by this thread"
                              />
                            </span>
                          ) : (
                            <NamedId
                              name={m.channelName}
                              id={m.channelId}
                              active={applied.channel === m.channelId}
                              onClick={() => filterByChannel(m.channelId)}
                              title="Filter by this channel"
                            />
                          )}
                        </td>
                        <td
                          className="max-w-md px-4 py-2 align-top text-text-secondary"
                          title={expanded ? "Click to collapse" : "Click to expand"}
                        >
                          {(m.replyToTag || m.replyToContent) && (
                            <div className={`${expanded ? "whitespace-normal" : "truncate"} mb-0.5 text-[11px] text-text-muted`}>
                              Reply to {m.replyToTag || "message"}
                              {m.replyToContent ? `: ${formatUserMentions(m.replyToContent, mentionNames)}` : ""}
                            </div>
                          )}
                          <div className={expanded ? "whitespace-pre-wrap break-words" : "truncate"}>
                            {m.content
                              ? formatUserMentions(m.content, mentionNames)
                              : <span className="text-text-muted">{m.attachments?.length ? "" : "(empty)"}</span>}
                            {m.attachments && m.attachments.length > 0 && (
                              <span className="ml-1 rounded-sm bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
                                {m.attachments.length} file{m.attachments.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 align-top">
                          <TypeBadge message={m} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-3">
          <PaginationBar {...pager} />
        </div>
      )}
    </div>
  );
}

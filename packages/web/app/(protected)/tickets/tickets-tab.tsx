"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Ticket, LegacyTicket, Permission } from "shared";
import {
  getTickets,
  getTicket,
  getLegacyTickets,
  getLegacyTicket,
  resolveDiscordNames,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table-v2";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { SearchInput } from "@/components/search-input-v2";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, ticketStatusVariant } from "@/components/status-badge";
import { TIER_LABELS, TIER_COLORS, getVisibleTiers } from "./lib";
import { TicketDetailPanel, LegacyTicketDetailPanel } from "./ticket-detail";

export type TicketsApi = {
  getTickets: typeof getTickets;
  getTicket: typeof getTicket;
  getLegacyTickets: typeof getLegacyTickets;
  getLegacyTicket: typeof getLegacyTicket;
  resolveDiscordNames: typeof resolveDiscordNames;
};

const defaultApi: TicketsApi = {
  getTickets,
  getTicket,
  getLegacyTickets,
  getLegacyTicket,
  resolveDiscordNames,
};

type UnifiedTicket =
  | { kind: "current"; data: Ticket }
  | { kind: "legacy"; data: LegacyTicket };

export default function TicketsTab({
  token,
  permissions,
  api = defaultApi,
}: {
  token: string | null;
  permissions: Permission[];
  api?: TicketsApi;
}) {
  const visibleTiers = useMemo(() => getVisibleTiers(permissions), [permissions]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [legacyTickets, setLegacyTickets] = useState<LegacyTicket[]>([]);
  const [ticketDetails, setTicketDetails] = useState<Record<number, Ticket>>({});
  const [legacyDetails, setLegacyDetails] = useState<Record<number, LegacyTicket>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");

  const resolveNames = useCallback(
    async (ids: string[]) => {
      if (!token) return;
      const unknown = ids.filter((id) => id);
      if (unknown.length === 0) return;
      const res = await api.resolveDiscordNames(token, [...new Set(unknown)]);
      if (res.success && res.data) setNameMap((prev) => ({ ...prev, ...res.data }));
    },
    [token, api],
  );

  const displayName = useCallback(
    (id: string | null): string => (!id ? "--" : nameMap[id] || id),
    [nameMap],
  );

  const load = useCallback(async () => {
    if (!token) return;
    const [ticketRes, legacyRes] = await Promise.all([
      api.getTickets(token),
      api.getLegacyTickets(token),
    ]);
    if (ticketRes.success && ticketRes.data) {
      setTickets(ticketRes.data);
      resolveNames(ticketRes.data.flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]));
    }
    if (legacyRes.success && legacyRes.data) setLegacyTickets(legacyRes.data);
  }, [token, api, resolveNames]);

  useEffect(() => {
    if (!token) return;
    load().finally(() => setLoaded(true));
  }, [token, load]);

  useAutoRefresh(load, 20_000, !!token);

  const ensureTicketDetail = useCallback(
    async (id: number) => {
      if (ticketDetails[id] || !token) return;
      const res = await api.getTicket(token, id);
      if (res.success && res.data) {
        setTicketDetails((prev) => ({ ...prev, [id]: res.data! }));
        resolveNames((res.data.events || []).map((e) => e.actorId).filter(Boolean));
      }
    },
    [ticketDetails, token, api, resolveNames],
  );

  const ensureLegacyDetail = useCallback(
    async (id: number) => {
      if (legacyDetails[id] || !token) return;
      const res = await api.getLegacyTicket(token, id);
      if (res.success && res.data) setLegacyDetails((prev) => ({ ...prev, [id]: res.data! }));
    },
    [legacyDetails, token, api],
  );

  const rows = useMemo<UnifiedTicket[]>(() => {
    const q = search.toLowerCase();

    const currentFiltered: UnifiedTicket[] = tickets
      .filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (tierFilter !== "all" && tierFilter !== "legacy" && t.tier !== tierFilter) return false;
        if (tierFilter === "legacy") return false;
        if (!visibleTiers.length || !visibleTiers.includes(t.tier)) return false;
        if (!q) return true;
        return (
          String(t.id).includes(q) ||
          t.userId.toLowerCase().includes(q) ||
          t.uuid.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q) ||
          (nameMap[t.userId] || "").toLowerCase().includes(q)
        );
      })
      .map((data): UnifiedTicket => ({ kind: "current", data }));

    const legacyFiltered: UnifiedTicket[] = legacyTickets
      .filter((t) => {
        if (statusFilter !== "all" && statusFilter !== "closed") return false;
        if (tierFilter !== "all" && tierFilter !== "legacy") return false;
        if (!q) return true;
        return (
          String(t.id).includes(q) ||
          (t.threadNumber ? String(t.threadNumber).includes(q) : false) ||
          t.username.toLowerCase().includes(q) ||
          (t.nickname || "").toLowerCase().includes(q) ||
          t.userId.toLowerCase().includes(q) ||
          t.uuid.toLowerCase().includes(q)
        );
      })
      .map((data): UnifiedTicket => ({ kind: "legacy", data }));

    const unified = [...currentFiltered, ...legacyFiltered];
    unified.sort((a, b) => {
      const dateA = a.kind === "current" ? a.data.createdAt : a.data.startedAt;
      const dateB = b.kind === "current" ? b.data.createdAt : b.data.startedAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    return unified;
  }, [tickets, legacyTickets, search, statusFilter, tierFilter, visibleTiers, nameMap]);

  const activeFilters: ActiveFilter[] = [];
  if (statusFilter !== "all") activeFilters.push({ key: "status", label: `Status: ${statusFilter}` });
  if (tierFilter !== "all") {
    activeFilters.push({ key: "tier", label: `Type: ${tierFilter === "legacy" ? "Legacy" : TIER_LABELS[tierFilter] || tierFilter}` });
  }

  const columns = useMemo<ColumnDef<UnifiedTicket, unknown>[]>(
    () => [
      {
        id: "ref",
        header: "Ticket",
        cell: ({ row }) => {
          const item = row.original;
          const label =
            item.kind === "current"
              ? `Ticket #${item.data.id}`
              : item.data.threadNumber
                ? `Thread #${item.data.threadNumber}`
                : `Ticket #${item.data.id}`;
          return <span className="font-display text-sm font-semibold tracking-wide text-text-primary">{label}</span>;
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.kind === "current" ? (
            <StatusBadge variant={ticketStatusVariant(row.original.data.status)} />
          ) : (
            <StatusBadge variant="ticket-closed" />
          ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => {
          const item = row.original;
          if (item.kind === "legacy") return <StatusBadge variant="ticket-legacy" />;
          return (
            <span className={`text-xs ${TIER_COLORS[item.data.tier] || "text-text-muted"}`}>
              {TIER_LABELS[item.data.tier] || item.data.tier}
            </span>
          );
        },
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const item = row.original;
          const label = item.kind === "current" ? displayName(item.data.userId) : item.data.nickname || item.data.username;
          return <span className="text-sm text-text-secondary">{label}</span>;
        },
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => {
          const item = row.original;
          const iso = item.kind === "current" ? item.data.createdAt : item.data.startedAt;
          return <span className="text-xs text-text-muted">{new Date(iso).toLocaleDateString()}</span>;
        },
      },
      {
        id: "closed",
        header: "Closed",
        cell: ({ row }) => {
          const closed = row.original.data.closedAt;
          return closed ? (
            <span className="text-xs text-text-muted">{new Date(closed).toLocaleDateString()}</span>
          ) : (
            <span className="text-text-muted">--</span>
          );
        },
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => {
          const item = row.original;
          const href = item.kind === "current" ? `/ticket/${item.data.uuid}` : `/ticket/legacy/${item.data.uuid}`;
          return (
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-7 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
              title="Open in new tab"
            >
              <ExternalLink className="size-4" />
            </Link>
          );
        },
      },
    ],
    [displayName],
  );

  return (
    <>
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={(key) => {
          if (key === "status") setStatusFilter("all");
          if (key === "tier") setTierFilter("all");
        }}
        onClearAll={() => {
          setStatusFilter("all");
          setTierFilter("all");
        }}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by ID, user, UUID, username..."
          className="min-w-64 flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {["all", "open", "closing", "closed"].map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="all">All Types</option>
          {visibleTiers.map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t] || t}
            </option>
          ))}
          <option value="legacy">Legacy</option>
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => `${r.kind}-${r.data.id}`}
        pageSize={50}
        loading={!loaded}
        renderDetail={(row) =>
          row.kind === "current" ? (
            <TicketDetailPanel
              ticket={row.data}
              detail={ticketDetails[row.data.id]}
              ensureDetail={ensureTicketDetail}
              displayName={displayName}
            />
          ) : (
            <LegacyTicketDetailPanel
              ticket={row.data}
              detail={legacyDetails[row.data.id]}
              ensureDetail={ensureLegacyDetail}
            />
          )
        }
        emptyState={
          <EmptyState
            className="py-8"
            message={
              tickets.length === 0 && legacyTickets.length === 0
                ? "No tickets found"
                : "No tickets match your search"
            }
          />
        }
      />
    </>
  );
}

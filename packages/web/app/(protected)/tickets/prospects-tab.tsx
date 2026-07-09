"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Prospect } from "shared";
import { getProspects, getProspect, resolveDiscordNames } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, ticketStatusVariant } from "@/components/status-badge";
import { ProspectDetailPanel } from "./prospect-detail";

export type ProspectsApi = {
  getProspects: typeof getProspects;
  getProspect: typeof getProspect;
  resolveDiscordNames: typeof resolveDiscordNames;
};

const defaultApi: ProspectsApi = { getProspects, getProspect, resolveDiscordNames };

export default function ProspectsTab({
  token,
  api = defaultApi,
}: {
  token: string | null;
  api?: ProspectsApi;
}) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [details, setDetails] = useState<Record<number, Prospect>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const nameMapRef = useRef<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const resolveNames = useCallback(
    async (ids: string[]) => {
      if (!token) return;
      const unknown = ids.filter((id) => id && !nameMapRef.current[id]);
      if (unknown.length === 0) return;
      const res = await api.resolveDiscordNames(token, [...new Set(unknown)]);
      if (res.success && res.data && Object.keys(res.data).length > 0) {
        setNameMap((prev) => {
          const next = { ...prev, ...res.data };
          nameMapRef.current = next;
          return next;
        });
      }
    },
    [token, api],
  );

  const displayName = useCallback(
    (id: string | null): string => (!id ? "--" : nameMap[id] || id),
    [nameMap],
  );

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api.getProspects(token);
    if (res.success && res.data) {
      setProspects(res.data);
      await resolveNames(res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]));
    }
  }, [token, api, resolveNames]);

  useEffect(() => {
    if (!token) return;
    load().finally(() => setLoaded(true));
  }, [token, load]);

  useAutoRefresh(load, 20_000, !!token);

  const ensureDetail = useCallback(
    async (id: number) => {
      if (details[id] || !token) return;
      const res = await api.getProspect(token, id);
      if (res.success && res.data) {
        setDetails((prev) => ({ ...prev, [id]: res.data! }));
        await resolveNames([
          ...(res.data.events || []).map((e) => e.actorId),
          ...(res.data.votes || []).map((v) => v.voterId),
        ].filter(Boolean));
      }
    },
    [details, token, api, resolveNames],
  );

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return prospects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.alias.toLowerCase().includes(q) ||
        p.userId.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        p.steamId.toLowerCase().includes(q) ||
        p.uuid.toLowerCase().includes(q)
      );
    });
  }, [prospects, search, statusFilter]);

  const activeFilters: ActiveFilter[] = [];
  if (statusFilter !== "all") activeFilters.push({ key: "status", label: `Status: ${statusFilter}` });

  const columns = useMemo<ColumnDef<Prospect, unknown>[]>(
    () => [
      {
        id: "alias",
        header: "Prospect",
        cell: ({ row }) => (
          <span className="font-display text-sm font-semibold tracking-wide text-text-primary">{row.original.alias}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge variant={ticketStatusVariant(row.original.status)} />,
      },
      {
        id: "nationality",
        header: "Nationality",
        cell: ({ row }) => <span className="text-sm text-text-secondary">{row.original.nationality}</span>,
      },
      {
        id: "squadHours",
        header: "Squad Hrs",
        cell: ({ row }) => <span className="text-xs text-text-muted">{row.original.squadHours}h</span>,
      },
      {
        id: "created",
        header: "Applied",
        cell: ({ row }) => (
          <span className="text-xs text-text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Link
            href={`/prospect/${row.original.uuid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-7 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
            title="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={() => setStatusFilter("all")}
        onClearAll={() => setStatusFilter("all")}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by alias, nationality, steam ID, UUID..."
          className="min-w-64 flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {["all", "open", "closed", "accepted", "denied"].map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(p) => String(p.id)}
        pageSize={50}
        loading={!loaded}
        renderDetail={(row) => (
          <ProspectDetailPanel
            prospect={row}
            detail={details[row.id]}
            ensureDetail={ensureDetail}
            displayName={displayName}
          />
        )}
        emptyState={
          <EmptyState
            className="py-8"
            message={prospects.length === 0 ? "No prospect applications found" : "No prospects match your search"}
          />
        }
      />
    </>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getMatches,
  updateMatch,
  deleteMatch,
  resyncMatches,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table-v2";
import { Skeleton } from "@/components/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { StatusBadge, matchResultVariant } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import type { Match } from "shared";

const PAGE_SIZE = 20;

export type MatchManagerApi = {
  getMatches: typeof getMatches;
  updateMatch: typeof updateMatch;
  deleteMatch: typeof deleteMatch;
  resyncMatches: typeof resyncMatches;
};

export const defaultApi: MatchManagerApi = {
  getMatches,
  updateMatch,
  deleteMatch,
  resyncMatches,
};

export function MatchManagerView({
  token,
  api = defaultApi,
}: {
  token: string;
  api?: MatchManagerApi;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Resync state
  const [resyncing, setResyncing] = useState(false);
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editMap, setEditMap] = useState("");
  const [editLayer, setEditLayer] = useState("");
  const [editResult, setEditResult] = useState("");
  const [editVodUrl, setEditVodUrl] = useState("");
  const [editServer, setEditServer] = useState("Main Server");
  const [editError, setEditError] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMatches(token, { page, limit: PAGE_SIZE });
      if (res.success && res.data) {
        setMatches(res.data.items);
        setTotal(res.data.total);
      } else {
        setError(res.error || "Failed to load matches");
      }
    } catch {
      setError("Failed to initialize");
    } finally {
      setLoading(false);
    }
  }, [token, page, api]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const refreshMatches = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getMatches(token, { page, limit: PAGE_SIZE });
      if (res.success && res.data) {
        setMatches(res.data.items);
        setTotal(res.data.total);
      }
    } catch { /* silent */ }
  }, [token, page, api]);

  useAutoRefresh(refreshMatches, 20_000, !!token && !editingId);

  function startEdit(match: Match) {
    setEditingId(match.id);
    setEditDate(match.date.slice(0, 10));
    setEditMap(match.map);
    setEditLayer(match.layer);
    setEditResult(match.result);
    setEditVodUrl(match.vodUrl || "");
    setEditServer(match.server);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!token) return;
    setEditError(null);

    const res = await api.updateMatch(token, id, {
      date: new Date(editDate).toISOString(),
      map: editMap.trim(),
      layer: editLayer.trim(),
      result: editResult,
      server: editServer,
      vodUrl: editVodUrl.trim() || null,
    });

    if (res.success && res.data) {
      setMatches((prev) => prev.map((m) => (m.id === id ? res.data! : m)));
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update match");
    }
  }

  async function handleToggleVisibility(match: Match) {
    if (!token) return;

    const res = await api.updateMatch(token, match.id, {
      hidden: !match.hidden,
    });

    if (res.success && res.data) {
      setMatches((prev) =>
        prev.map((m) => (m.id === match.id ? res.data! : m)),
      );
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;

    const res = await api.deleteMatch(token, id);
    if (res.success) {
      setMatches((prev) => prev.filter((m) => m.id !== id));
    }
  }

  async function handleResync() {
    if (!token || resyncing) return;
    setResyncing(true);
    setResyncMessage(null);
    const res = await api.resyncMatches(token);
    if (res.success && res.data) {
      setResyncMessage(`Resynced ${res.data.resynced} matches`);
      await refreshMatches();
    } else {
      setResyncMessage(res.error || "Resync failed");
    }
    setResyncing(false);
  }

  const matchColumns = useMemo(
    (): ColumnDef<Match, unknown>[] => [
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => {
          const match = row.original;
          return editingId === match.id ? (
            <Input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-32"
            />
          ) : (
            <span className="text-text-primary">{formatDate(match.date)}</span>
          );
        },
      },
      {
        id: "map",
        header: "Map",
        cell: ({ row }) => {
          const match = row.original;
          return editingId === match.id ? (
            <Input
              type="text"
              value={editMap}
              onChange={(e) => setEditMap(e.target.value)}
            />
          ) : (
            <span className="text-text-secondary">{match.map}</span>
          );
        },
      },
      {
        id: "layer",
        header: "Layer",
        cell: ({ row }) => {
          const match = row.original;
          return editingId === match.id ? (
            <Input
              type="text"
              value={editLayer}
              onChange={(e) => setEditLayer(e.target.value)}
            />
          ) : (
            <span className="text-text-secondary">{match.layer}</span>
          );
        },
      },
      {
        id: "result",
        header: "Result",
        cell: ({ row }) => {
          const match = row.original;
          return editingId === match.id ? (
            <Select value={editResult} onValueChange={(v) => { if (v != null) setEditResult(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WIN">WIN</SelectItem>
                <SelectItem value="LOSS">LOSS</SelectItem>
                <SelectItem value="DRAW">DRAW</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <StatusBadge variant={matchResultVariant(match.result)} />
          );
        },
      },
      {
        id: "server",
        header: "Server",
        cell: ({ row }) => {
          const match = row.original;
          return editingId === match.id ? (
            <Select value={editServer} onValueChange={(v) => { if (v != null) setEditServer(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Main Server">Main Server</SelectItem>
                <SelectItem value="Battle Server">Battle Server</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <span className="text-text-secondary">{match.server}</span>
          );
        },
      },
      {
        id: "vod",
        header: "VOD",
        cell: ({ row }) => {
          const match = row.original;
          return editingId === match.id ? (
            <Input
              type="url"
              value={editVodUrl}
              onChange={(e) => setEditVodUrl(e.target.value)}
              placeholder="VOD URL"
            />
          ) : match.vodUrl ? (
            <a
              href={match.vodUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent transition-colors hover:text-accent-muted"
            >
              Watch
            </a>
          ) : (
            <span className="text-text-muted">--</span>
          );
        },
      },
      {
        id: "visible",
        header: "Visible",
        cell: ({ row }) => {
          const match = row.original;
          return (
            <Switch
              checked={!match.hidden}
              onCheckedChange={() => handleToggleVisibility(match)}
              aria-label="Toggle visibility"
            />
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const match = row.original;
          return editingId === match.id ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => saveEdit(match.id)}
              >
                Save
              </Button>
              <Button variant="ghost" size="xs" onClick={cancelEdit}>
                Cancel
              </Button>
              {editError && (
                <span className="text-xs text-danger">{editError}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => startEdit(match)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleDelete(match.id)}
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ],
    [editingId, editDate, editMap, editLayer, editResult, editServer, editVodUrl, editError],
  );

  if (loading && matches.length === 0) {
    return (
      <div>
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold tracking-wide">
            Matches
          </h1>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-24 rounded-sm" />
            <Skeleton className="h-8 w-28 rounded-sm" />
          </div>
        </div>
        <DataTable<Match>
          columns={matchColumns}
          data={[]}
          getRowId={(match) => match.id}
          loading
          skeletonRows={8}
        />
      </div>
    );
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Matches
        </h1>
        <div className="flex items-center gap-3">
          {resyncMessage && (
            <span className="text-xs text-text-secondary">{resyncMessage}</span>
          )}
          <Button
            variant="outlineGold"
            onClick={handleResync}
            disabled={resyncing}
            title="Rebuild match details from SquadJS data"
          >
            {resyncing ? "Resyncing..." : "Resync"}
          </Button>
          <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
            {total} matches
          </span>
        </div>
      </div>

      <DataTable<Match>
        columns={matchColumns}
        data={matches}
        getRowId={(match) => match.id}
        serverPagination={{ page, totalPages, onPageChange: setPage }}
        emptyState={<EmptyState message="No matches yet" />}
      />
    </div>
  );
}

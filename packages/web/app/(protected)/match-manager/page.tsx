"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getMatches,
  updateMatch,
  deleteMatch,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { Match } from "shared";

export default function MatchesPage() {
  const { apiToken } = usePermissions();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editMap, setEditMap] = useState("");
  const [editLayer, setEditLayer] = useState("");
  const [editResult, setEditResult] = useState("");
  const [editVodUrl, setEditVodUrl] = useState("");
  const [editServer, setEditServer] = useState("Main Server");
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      if (!apiToken) return;
      try {
        const res = await getMatches(apiToken);
        if (res.success && res.data) {
          setMatches(res.data);
        } else {
          setError(res.error || "Failed to load matches");
        }
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [apiToken]);

  const refreshMatches = useCallback(async () => {
    if (!apiToken) return;
    try {
      const res = await getMatches(apiToken);
      if (res.success && res.data) setMatches(res.data);
    } catch { /* silent */ }
  }, [apiToken]);

  useAutoRefresh(refreshMatches, 20_000, !!apiToken && !editingId);

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
    if (!apiToken) return;
    setEditError(null);

    const res = await updateMatch(apiToken, id, {
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
    if (!apiToken) return;

    const res = await updateMatch(apiToken, match.id, {
      hidden: !match.hidden,
    });

    if (res.success && res.data) {
      setMatches((prev) => prev.map((m) => (m.id === match.id ? res.data! : m)));
    }
  }

  async function handleDelete(id: string) {
    if (!apiToken) return;

    const res = await deleteMatch(apiToken, id);
    if (res.success) {
      setMatches((prev) => prev.filter((m) => m.id !== id));
    }
  }

  function resultBadge(result: string) {
    const base = "inline-block rounded-sm px-2 py-0.5 text-xs font-semibold tracking-wide uppercase";
    switch (result.toUpperCase()) {
      case "WIN":
        return <span className={`${base} bg-success/10 text-success`}>{result}</span>;
      case "LOSS":
        return <span className={`${base} bg-danger/10 text-danger`}>{result}</span>;
      default:
        return <span className={`${base} bg-text-muted/10 text-text-muted`}>{result}</span>;
    }
  }

  if (loading) {
    return <div className="text-text-secondary">Loading matches...</div>;
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
        <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
          {matches.length} matches
        </span>
      </div>

      {/* Matches table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Map
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Layer
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Result
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Server
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  VOD
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Visible
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No matches yet
                  </td>
                </tr>
              ) : (
                matches.map((match) => (
                  <tr
                    key={match.id}
                    className="border-b border-border/50 transition-colors hover:bg-bg-tertiary/50"
                  >
                    <td className="px-4 py-3">
                      {editingId === match.id ? (
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                        />
                      ) : (
                        <span className="text-text-primary">
                          {new Date(match.date).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === match.id ? (
                        <input
                          type="text"
                          value={editMap}
                          onChange={(e) => setEditMap(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                        />
                      ) : (
                        <span className="text-text-secondary">{match.map}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === match.id ? (
                        <input
                          type="text"
                          value={editLayer}
                          onChange={(e) => setEditLayer(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                        />
                      ) : (
                        <span className="text-text-secondary">{match.layer}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === match.id ? (
                        <select
                          value={editResult}
                          onChange={(e) => setEditResult(e.target.value)}
                          className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                        >
                          <option value="WIN">WIN</option>
                          <option value="LOSS">LOSS</option>
                          <option value="DRAW">DRAW</option>
                        </select>
                      ) : (
                        resultBadge(match.result)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === match.id ? (
                        <select
                          value={editServer}
                          onChange={(e) => setEditServer(e.target.value)}
                          className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                        >
                          <option value="Main Server">Main Server</option>
                          <option value="Battle Server">Battle Server</option>
                        </select>
                      ) : (
                        <span className="text-text-secondary">{match.server}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === match.id ? (
                        <input
                          type="url"
                          value={editVodUrl}
                          onChange={(e) => setEditVodUrl(e.target.value)}
                          placeholder="VOD URL"
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
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
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleVisibility(match)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          !match.hidden ? "bg-success" : "bg-bg-tertiary border border-border"
                        }`}
                        title={match.hidden ? "Hidden from public" : "Visible on public page"}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            !match.hidden ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === match.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveEdit(match.id)}
                            className="text-xs text-success transition-colors hover:text-success/80"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs text-text-muted transition-colors hover:text-text-primary"
                          >
                            Cancel
                          </button>
                          {editError && (
                            <span className="text-xs text-danger">
                              {editError}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(match)}
                            className="text-xs text-text-muted transition-colors hover:text-accent"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(match.id)}
                            className="text-xs text-text-muted transition-colors hover:text-danger"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

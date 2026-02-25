"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getTicketTimeouts,
  createTicketTimeout,
  expireTicketTimeout,
  resolveDiscordNames,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { TicketTimeout } from "shared";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const DURATION_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "7 days", hours: 168 },
];

export default function TimeoutsTab({
  apiToken,
  canManage,
}: {
  apiToken: string;
  canManage: boolean;
}) {
  const [timeouts, setTimeouts] = useState<TicketTimeout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formPreset, setFormPreset] = useState("24");
  const [formCustomHours, setFormCustomHours] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function resolveNames(ids: string[]) {
    const unknown = ids.filter((id) => id && !nameMap[id]);
    if (unknown.length === 0) return;
    const res = await resolveDiscordNames(apiToken, [...new Set(unknown)]);
    if (res.success && res.data) setNameMap((prev) => ({ ...prev, ...res.data }));
  }

  function displayName(id: string): string {
    return nameMap[id] || id;
  }

  async function fetchTimeouts() {
    const res = await getTicketTimeouts(apiToken);
    if (res.success && res.data) {
      setTimeouts(res.data);
      const ids = res.data.flatMap((t) => [t.userId, t.timedOutBy]);
      resolveNames(ids);
    } else {
      setError(res.error || "Failed to load timeouts");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchTimeouts();
  }, [apiToken]);

  const silentRefreshTimeouts = useCallback(async () => {
    try {
      const res = await getTicketTimeouts(apiToken);
      if (res.success && res.data) {
        setTimeouts(res.data);
        const ids = res.data.flatMap((t) => [t.userId, t.timedOutBy]);
        resolveNames(ids);
      }
    } catch { /* silent */ }
  }, [apiToken]);

  useAutoRefresh(silentRefreshTimeouts, 20_000, !showForm);

  async function handleCreate() {
    setFormError(null);
    const hours = formPreset === "custom" ? Number(formCustomHours) : Number(formPreset);
    if (!formUserId.trim()) {
      setFormError("User ID is required");
      return;
    }
    if (!hours || hours < 1) {
      setFormError("Invalid duration");
      return;
    }

    setSubmitting(true);
    const res = await createTicketTimeout(apiToken, {
      userId: formUserId.trim(),
      hours,
    });
    setSubmitting(false);

    if (res.success) {
      setFormUserId("");
      setFormPreset("24");
      setFormCustomHours("");
      setShowForm(false);
      setLoading(true);
      fetchTimeouts();
    } else {
      setFormError(res.error || "Failed to create timeout");
    }
  }

  async function handleExpire(id: number) {
    const res = await expireTicketTimeout(apiToken, id);
    if (res.success) {
      setTimeouts((prev) => prev.filter((t) => t.id !== id));
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return timeouts;
    return timeouts.filter(
      (t) =>
        t.userId.toLowerCase().includes(q) ||
        (nameMap[t.userId] && nameMap[t.userId].toLowerCase().includes(q))
    );
  }, [timeouts, search, nameMap]);

  if (loading) return <div className="text-text-muted">Loading timeouts...</div>;
  if (error) return <div className="text-danger">{error}</div>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user ID or name..."
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-sm border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            {showForm ? "Cancel" : "Add Timeout"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
          <h3 className="mb-4 text-sm font-medium tracking-wide text-text-primary">
            New Ticket Timeout
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Discord User ID
              </label>
              <input
                type="text"
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
                placeholder="e.g. 123456789012345678"
                className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
              />
            </div>
            <div className="min-w-40">
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Duration
              </label>
              <select
                value={formPreset}
                onChange={(e) => setFormPreset(e.target.value)}
                className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
              >
                {DURATION_PRESETS.map((p) => (
                  <option key={p.hours} value={String(p.hours)}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom...</option>
              </select>
            </div>
            {formPreset === "custom" && (
              <div className="min-w-28">
                <label className="mb-1 block text-xs font-medium text-text-muted">
                  Hours
                </label>
                <input
                  type="number"
                  min="1"
                  max="8760"
                  value={formCustomHours}
                  onChange={(e) => setFormCustomHours(e.target.value)}
                  placeholder="Hours"
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
              </div>
            )}
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
          {formError && (
            <p className="mt-2 text-xs text-danger">{formError}</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
            {timeouts.length === 0
              ? "No active timeouts"
              : "No timeouts match your search"}
          </div>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className="facet-border flex items-center justify-between rounded-sm bg-bg-card px-5 py-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-text-muted"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                      {displayName(t.userId)}
                    </span>
                    <span className="rounded-sm border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                      {relativeTime(t.expiresAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>by {displayName(t.timedOutBy)}</span>
                    <span className="h-1 w-1 rounded-full bg-text-muted" />
                    <span>Expires: {fmtDate(t.expiresAt)}</span>
                    <span className="h-1 w-1 rounded-full bg-text-muted" />
                    <span>Created: {fmtDate(t.createdAt)}</span>
                  </div>
                </div>
              </div>
              {canManage && (
                <button
                  onClick={() => handleExpire(t.id)}
                  className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                >
                  Expire Now
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

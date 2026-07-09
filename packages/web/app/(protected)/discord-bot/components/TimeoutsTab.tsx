"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getTicketTimeouts,
  createTicketTimeout,
  expireTicketTimeout,
  resolveDiscordNames,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Skeleton, SkeletonList } from "@/components/skeleton";
import type { TicketTimeout } from "shared";
import { SearchInput } from "@/components/search-input-v2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyableId } from "@/components/copyable-id";
import { EmptyState } from "@/components/empty-state";

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

export type TimeoutsApi = {
  getTicketTimeouts: typeof getTicketTimeouts;
  createTicketTimeout: typeof createTicketTimeout;
  expireTicketTimeout: typeof expireTicketTimeout;
  resolveDiscordNames: typeof resolveDiscordNames;
};

const defaultApi: TimeoutsApi = {
  getTicketTimeouts,
  createTicketTimeout,
  expireTicketTimeout,
  resolveDiscordNames,
};

export default function TimeoutsTab({
  apiToken,
  canManage,
  api = defaultApi,
}: {
  apiToken: string;
  canManage: boolean;
  api?: TimeoutsApi;
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
  const [expireId, setExpireId] = useState<number | null>(null);

  async function resolveNames(ids: string[]) {
    const unknown = ids.filter((id) => id && !nameMap[id]);
    if (unknown.length === 0) return;
    const res = await api.resolveDiscordNames(apiToken, [...new Set(unknown)]);
    if (res.success && res.data) setNameMap((prev) => ({ ...prev, ...res.data }));
  }

  function displayName(id: string): string {
    return nameMap[id] || id;
  }

  async function fetchTimeouts() {
    const res = await api.getTicketTimeouts(apiToken);
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
      const res = await api.getTicketTimeouts(apiToken);
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
    const res = await api.createTicketTimeout(apiToken, {
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

  async function handleExpireConfirm() {
    if (expireId === null) return;
    const id = expireId;
    setExpireId(null);
    const res = await api.expireTicketTimeout(apiToken, id);
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

  if (loading && timeouts.length === 0)
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-9 flex-1" />
          {canManage && <Skeleton className="h-9 w-32" />}
        </div>
        <SkeletonList rows={4} avatar />
      </div>
    );
  if (error) return <div className="text-danger">{error}</div>;

  const expireTarget = expireId !== null ? timeouts.find((t) => t.id === expireId) : null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by user ID or name..."
          className="flex-1"
        />
        {canManage && (
          <Button
            variant="outline"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "Add Timeout"}
          </Button>
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
              <Input
                type="text"
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
                placeholder="e.g. 123456789012345678"
              />
            </div>
            <div className="min-w-40">
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Duration
              </label>
              <Select value={formPreset} onValueChange={(v) => { if (v !== null) setFormPreset(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_PRESETS.map((p) => (
                    <SelectItem key={p.hours} value={String(p.hours)}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formPreset === "custom" && (
              <div className="min-w-28">
                <label className="mb-1 block text-xs font-medium text-text-muted">
                  Hours
                </label>
                <Input
                  type="number"
                  min="1"
                  max="8760"
                  value={formCustomHours}
                  onChange={(e) => setFormCustomHours(e.target.value)}
                  placeholder="Hours"
                />
              </div>
            )}
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </div>
          {formError && (
            <p className="mt-2 text-xs text-danger">{formError}</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            message={
              timeouts.length === 0
                ? "No active timeouts"
                : "No timeouts match your search"
            }
          />
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
                    <CopyableId value={t.userId} />
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpireId(t.id)}
                >
                  Expire Now
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <AlertDialog
        open={expireId !== null}
        onOpenChange={(open) => {
          if (!open) setExpireId(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Expire this timeout?</AlertDialogTitle>
            <AlertDialogDescription>
              {expireTarget
                ? `This will immediately lift the ticket timeout for ${displayName(expireTarget.userId)}.`
                : "This will immediately lift the ticket timeout."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep timeout</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleExpireConfirm}>
              Expire now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

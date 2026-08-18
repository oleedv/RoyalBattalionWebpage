"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getProspectCooldowns,
  createProspectCooldown,
  updateProspectCooldown,
  deleteProspectCooldown,
  getProspectConfig,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDiscordNameMap } from "@/hooks/use-discord-names";
import { formatDateTime } from "@/lib/format";
import { SkeletonList } from "@/components/skeleton";
import type { ProspectCooldown } from "shared";

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / 3600000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(diff / 60000);
  return `${minutes}m`;
}

const DAY_PRESETS = [7, 14, 21, 28, 42];

export function CooldownList({ apiToken, canManage }: { apiToken: string; canManage: boolean }) {
  const [rows, setRows] = useState<ProspectCooldown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { nameMap, resolveNames } = useDiscordNameMap(apiToken);
  const hasRowsRef = useRef(false);
  const [defaultDays, setDefaultDays] = useState(28);
  const [showForm, setShowForm] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formDays, setFormDays] = useState("28");
  const [formReason, setFormReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDays, setEditDays] = useState("28");

  const load = useCallback(async () => {
    const [listRes, cfgRes] = await Promise.all([
      getProspectCooldowns(apiToken),
      getProspectConfig(apiToken),
    ]);
    if (listRes.success && listRes.data) {
      setError(null);
      setRows(listRes.data);
      hasRowsRef.current = listRes.data.length > 0;
      void resolveNames(listRes.data.flatMap((r) => [r.userId, r.createdBy]));
    } else if (!hasRowsRef.current) {
      setError(listRes.error || "Failed to load cooldowns");
    }
    if (cfgRes.success && cfgRes.data) {
      setDefaultDays(cfgRes.data.cooldownDays);
      setFormDays(String(cfgRes.data.cooldownDays));
    }
    setLoading(false);
  }, [apiToken, resolveNames]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 20_000, !showForm && editingId === null);

  async function handleCreate() {
    setFormError(null);
    const days = Number(formDays);
    if (!formUserId.trim()) { setFormError("User ID is required"); return; }
    if (!days || days < 1) { setFormError("Invalid duration"); return; }
    setSubmitting(true);
    const res = await createProspectCooldown(apiToken, {
      userId: formUserId.trim(),
      days,
      reason: formReason.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      setShowForm(false);
      setFormUserId("");
      setFormReason("");
      await load();
    } else {
      setFormError(res.error || "Failed to add cooldown");
    }
  }

  async function handleEdit(id: number) {
    const days = Number(editDays);
    if (!days || days < 1) return;
    setSubmitting(true);
    const res = await updateProspectCooldown(apiToken, id, { days });
    setSubmitting(false);
    if (res.success) {
      setEditingId(null);
      await load();
    }
  }

  async function handleRemove(id: number) {
    setSubmitting(true);
    const res = await deleteProspectCooldown(apiToken, id);
    setSubmitting(false);
    if (res.success) await load();
  }

  if (loading && rows.length === 0) return <SkeletonList rows={3} />;
  if (error && rows.length === 0) return <div className="text-danger">{error}</div>;

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">Active cooldowns</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setFormDays(String(defaultDays)); }}
            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
          >
            {showForm ? "Cancel" : "Add cooldown"}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="mb-4 grid gap-3 rounded-sm border border-border/60 bg-bg-tertiary/30 p-4 sm:grid-cols-4">
          <input
            value={formUserId}
            onChange={(e) => setFormUserId(e.target.value)}
            placeholder="Discord user ID"
            className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
          />
          <select
            value={DAY_PRESETS.includes(Number(formDays)) ? formDays : "custom"}
            onChange={(e) => setFormDays(e.target.value === "custom" ? formDays : e.target.value)}
            className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
          >
            {DAY_PRESETS.map((d) => <option key={d} value={d}>{d} days</option>)}
            <option value="custom">Custom</option>
          </select>
          {!DAY_PRESETS.includes(Number(formDays)) && (
            <input
              type="number"
              min={1}
              value={formDays}
              onChange={(e) => setFormDays(e.target.value)}
              className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
            />
          )}
          <input
            value={formReason}
            onChange={(e) => setFormReason(e.target.value)}
            placeholder="Reason (optional)"
            className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-bg-primary hover:bg-accent-bright disabled:opacity-50"
          >
            Add
          </button>
          {formError && <p className="sm:col-span-4 text-sm text-danger">{formError}</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">No one is on cooldown</p>
      ) : (
        <div className="divide-y divide-border/30">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="text-sm font-medium text-text-primary">{nameMap[row.userId] || row.userId}</div>
                <div className="text-xs text-text-muted">
                  {row.userId} · expires {formatDateTime(row.expiresAt)} ({relativeTime(row.expiresAt)})
                  {row.reason ? ` · ${row.reason}` : ""}
                </div>
                <div className="text-[11px] text-text-muted">Added by {nameMap[row.createdBy] || row.createdBy}</div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  {editingId === row.id ? (
                    <>
                      <input
                        type="number"
                        min={1}
                        value={editDays}
                        onChange={(e) => setEditDays(e.target.value)}
                        className="w-16 rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleEdit(row.id)}
                        disabled={submitting}
                        className="rounded-sm bg-accent/15 px-2 py-1 text-xs font-medium text-accent disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs text-text-muted">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEditingId(row.id); setEditDays(String(defaultDays)); }}
                        className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(row.id)}
                        disabled={submitting}
                        className="rounded-sm border border-danger/30 bg-danger/10 px-2 py-1 text-xs text-danger disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createApiToken,
  getApiTokens,
  revokeApiToken,
  searchApiTokenUsers,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { DataTable, type Column } from "@/components/data-table";
import { Modal } from "@/components/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import type { ApiToken, ApiTokenUsageDay } from "shared";

type UserHit = { id: string; discordName: string; displayName: string | null; discordId: string };

function statusClass(status: ApiToken["status"]) {
  if (status === "live") return "bg-success/15 text-success";
  if (status === "expired") return "bg-warning/15 text-warning";
  return "bg-danger/15 text-danger";
}

function UsageBars({ usage }: { usage: ApiTokenUsageDay[] }) {
  const last7: ApiTokenUsageDay[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    last7.push(usage.find((u) => u.date.startsWith(key)) ?? { date: key, okCount: 0, errorCount: 0, rateLimitedCount: 0 });
  }
  const max = Math.max(1, ...last7.map((u) => u.okCount + u.errorCount + u.rateLimitedCount));
  return (
    <div className="flex h-8 items-end gap-0.5" title="Last 7 days">
      {last7.map((u) => {
        const total = u.okCount + u.errorCount + u.rateLimitedCount;
        const h = Math.max(total > 0 ? 4 : 2, Math.round((total / max) * 32));
        const color = u.rateLimitedCount > 0 ? "bg-warning" : total > 0 ? "bg-accent/70" : "bg-border";
        return <div key={u.date} className={`w-1.5 ${color}`} style={{ height: h }} />;
      })}
    </div>
  );
}

export default function ApiTokensPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canManage = hasPermission("manage:api-tokens");
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userHits, setUserHits] = useState<UserHit[]>([]);
  const [linkedUser, setLinkedUser] = useState<UserHit | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    if (!apiToken) return;
    setLoading(true);
    setError(null);
    const res = await getApiTokens(apiToken);
    if (res.success && res.data) setTokens(res.data);
    else setError(res.error || "Failed to load tokens");
    setLoading(false);
  }, [apiToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!apiToken || userQuery.trim().length < 2) {
      setUserHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await searchApiTokenUsers(apiToken, userQuery.trim());
      if (res.success && res.data) setUserHits(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [apiToken, userQuery]);

  async function handleCreate() {
    if (!apiToken || !name.trim()) return;
    setCreating(true);
    setCreateError(null);
    const res = await createApiToken(apiToken, {
      name: name.trim(),
      userId: linkedUser?.id ?? null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setCreating(false);
    if (!res.success || !res.data) {
      setCreateError(res.error || "Failed to create token");
      return;
    }
    setSecret(res.data.secret);
    setCreateOpen(false);
    setName("");
    setExpiresAt("");
    setLinkedUser(null);
    setUserQuery("");
    setTokens((prev) => [res.data!, ...prev]);
  }

  async function handleRevoke() {
    if (!apiToken || !revokeTarget) return;
    setRevoking(true);
    const res = await revokeApiToken(apiToken, revokeTarget.id);
    setRevoking(false);
    if (res.success && res.data) {
      setTokens((prev) => prev.map((t) => (t.id === res.data!.id ? res.data! : t)));
    }
    setRevokeTarget(null);
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!canManage) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  const columns: Column<ApiToken>[] = [
    {
      key: "name",
      header: "Name",
      render: (t) => (
        <div>
          <div className="font-medium text-text-primary">{t.name}</div>
          <code className="text-[11px] text-text-muted">{t.tokenPrefix}…</code>
        </div>
      ),
    },
    {
      key: "user",
      header: "Linked user",
      render: (t) =>
        t.user ? (
          <span className="text-text-secondary">{t.user.displayName || t.user.discordName}</span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <span className={`rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusClass(t.status)}`}>
          {t.status}
        </span>
      ),
    },
    {
      key: "usage",
      header: "7d",
      render: (t) => <UsageBars usage={t.usage} />,
    },
    {
      key: "requests",
      header: "Requests",
      render: (t) => <span className="text-text-secondary">{t.requestCount}</span>,
    },
    {
      key: "lastUsed",
      header: "Last used",
      render: (t) => (
        <span className="text-text-muted">
          {t.lastUsedAt ? formatRelativeTime(t.lastUsedAt) : "never"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (t) => <span className="text-text-muted">{formatDateTime(t.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-text-primary">API Tokens</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Consumer keys for <code className="text-accent">GET /v1/live/status</code>. The secret is shown once.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold tracking-wide text-bg-primary hover:bg-accent-bright"
        >
          New token
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}

      <div className="rounded-sm border border-border bg-bg-card">
        <DataTable
          columns={columns}
          data={tokens}
          keyExtractor={(t) => t.id}
          loading={loading}
          emptyMessage="No tokens yet."
          onRowClick={(t) => setExpandedId((id) => (id === t.id ? null : t.id))}
          isExpanded={(t) => t.id === expandedId}
          renderExpanded={(t) => (
            <div className="space-y-3 px-4 py-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Scope</div>
                  <div className="text-text-secondary">{t.scope}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">Expires</div>
                  <div className="text-text-secondary">{t.expiresAt ? formatDateTime(t.expiresAt) : "never"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">30-day calls</div>
                  <div className="text-text-secondary">
                    {t.usage.reduce((n, u) => n + u.okCount, 0)} ok ·{" "}
                    {t.usage.reduce((n, u) => n + u.errorCount, 0)} err ·{" "}
                    {t.usage.reduce((n, u) => n + u.rateLimitedCount, 0)} 429
                  </div>
                </div>
              </div>
              {t.status === "live" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRevokeTarget(t);
                  }}
                  className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger hover:bg-danger/20"
                >
                  Revoke
                </button>
              )}
            </div>
          )}
        />
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <h3 className="font-display mb-1 text-lg font-semibold">New API token</h3>
        <p className="mb-4 text-sm text-text-secondary">
          Scoped to live server status. Paste the secret into the device; we cannot show it again.
        </p>
        <label className="mb-3 block text-xs uppercase tracking-wider text-text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
            placeholder="ESP32 — display"
          />
        </label>
        <label className="mb-3 block text-xs uppercase tracking-wider text-text-muted">
          Linked user (optional)
          <input
            value={linkedUser ? (linkedUser.displayName || linkedUser.discordName) : userQuery}
            onChange={(e) => {
              setLinkedUser(null);
              setUserQuery(e.target.value);
            }}
            className="mt-1 w-full rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
            placeholder="Discord name or ID"
          />
        </label>
        {userHits.length > 0 && !linkedUser && (
          <ul className="mb-3 max-h-40 overflow-auto rounded-sm border border-border bg-bg-secondary text-sm">
            {userHits.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-bg-tertiary"
                  onClick={() => {
                    setLinkedUser(u);
                    setUserHits([]);
                    setUserQuery("");
                  }}
                >
                  {u.displayName || u.discordName}{" "}
                  <span className="text-text-muted">({u.discordId})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="mb-4 block text-xs uppercase tracking-wider text-text-muted">
          Expires (optional)
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
          />
        </label>
        {createError && <div className="mb-3 text-sm text-danger">{createError}</div>}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setCreateOpen(false)}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-bg-primary disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </Modal>

      <Modal open={Boolean(secret)} onClose={() => setSecret(null)}>
        <h3 className="font-display mb-1 text-lg font-semibold">Copy this secret now</h3>
        <p className="mb-3 text-sm text-text-secondary">
          It will not be shown again. Authorization: Bearer &lt;secret&gt;
        </p>
        <pre className="mb-4 overflow-x-auto rounded-sm border border-border bg-bg-tertiary p-3 text-xs text-accent">
          {secret}
        </pre>
        <div className="flex justify-end gap-3">
          <button
            onClick={copySecret}
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => setSecret(null)}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-bg-primary"
          >
            Done
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke token"
        message={
          revokeTarget
            ? `Revoke ${revokeTarget.name} (${revokeTarget.tokenPrefix}…)? Devices using it will get 401.`
            : ""
        }
        confirmLabel="Revoke"
        loading={revoking}
      />
    </div>
  );
}

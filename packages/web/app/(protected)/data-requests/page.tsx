"use client";

import { useCallback, useEffect, useState } from "react";
import { usePermissions } from "@/lib/permission-context";
import {
  getDeletionRequests,
  markDeletionRequestHandled,
  notifyDataRequestsChanged,
} from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { DataDeletionRequest } from "shared";

export default function DataRequestsPage() {
  const { apiToken } = usePermissions();
  const [requests, setRequests] = useState<DataDeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handlingId, setHandlingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) return;
    const res = await getDeletionRequests(apiToken);
    if (res.success && res.data) {
      setRequests(res.data);
      setError(null);
    } else {
      setError(res.error || "Failed to load requests.");
    }
    setLoading(false);
  }, [apiToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMark(id: string) {
    if (!apiToken) return;
    setHandlingId(id);
    try {
      const res = await markDeletionRequestHandled(apiToken, id);
      if (res.success && res.data) {
        setRequests((prev) => prev.map((r) => (r.id === id ? res.data! : r)));
        notifyDataRequestsChanged();
      }
    } finally {
      setHandlingId(null);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const handled = requests.filter((r) => r.status === "handled");

  return (
    <div>
      <h1 className="font-display mb-2 text-3xl font-bold tracking-wide">
        Data Requests
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-text-secondary">
        Deletion requests from signed-in members. Handle these by hand, then
        mark them as done.
      </p>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="max-w-3xl space-y-8">
          <section>
            <h2 className="font-display mb-3 text-base font-semibold tracking-wide">
              Pending ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-text-muted">No open requests.</p>
            ) : (
              <ul className="space-y-3">
                {pending.map((r) => (
                  <li
                    key={r.id}
                    className="facet-border rounded-sm bg-bg-card p-5"
                  >
                    <RequestBody request={r} />
                    <button
                      type="button"
                      onClick={() => handleMark(r.id)}
                      disabled={handlingId === r.id}
                      className="mt-4 rounded-sm border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/60 hover:bg-accent/20 disabled:opacity-50"
                    >
                      {handlingId === r.id ? "Saving…" : "Mark handled"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {handled.length > 0 && (
            <section>
              <h2 className="font-display mb-3 text-base font-semibold tracking-wide">
                Handled
              </h2>
              <ul className="space-y-3">
                {handled.map((r) => (
                  <li
                    key={r.id}
                    className="facet-border rounded-sm bg-bg-card/60 p-5 opacity-80"
                  >
                    <RequestBody request={r} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RequestBody({ request }: { request: DataDeletionRequest }) {
  const name = request.displayName || request.discordName;
  return (
    <div>
      <div className="font-medium text-text-primary">{name}</div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wider text-text-muted">
            Discord
          </dt>
          <dd className="text-text-secondary">
            @{request.discordName}
            <span className="ml-2 font-mono text-xs text-text-muted">
              {request.discordId}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-text-muted">
            Steam ID
          </dt>
          <dd className="font-mono text-text-secondary">
            {request.steamId || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-text-muted">
            Requested
          </dt>
          <dd className="text-text-secondary">{formatDateTime(request.createdAt)}</dd>
        </div>
        {request.handledAt && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-muted">
              Handled
            </dt>
            <dd className="text-text-secondary">{formatDateTime(request.handledAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

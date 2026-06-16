"use client";

import { useState, useEffect, useCallback } from "react";
import { getSeedingLiveStatus } from "@/lib/api-client";
import type { SeedingLiveStatus as LiveStatusData } from "shared";

interface Props {
  apiToken: string;
}

function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > 120_000;
}

export function SeedingLiveStatus({ apiToken }: Props) {
  const [status, setStatus] = useState<LiveStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    const res = await getSeedingLiveStatus(apiToken);
    if (res.success && res.data) {
      setStatus(res.data);
      setError(null);
    } else {
      setError(res.error || "Failed to fetch live status");
    }
  }, [apiToken]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 20_000);
    return () => clearInterval(id);
  }, [fetch]);

  if (error) {
    return (
      <div className="facet-border rounded-sm bg-bg-card px-5 py-4 text-sm text-text-muted">
        Live status unavailable: {error}
      </div>
    );
  }

  if (!status) {
    return (
      <div className="facet-border rounded-sm bg-bg-card px-5 py-4 text-sm text-text-muted">
        Loading live status...
      </div>
    );
  }

  if (!status.serverResolvedOk) {
    return (
      <div className="facet-border rounded-sm bg-bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-text-muted" />
          <span className="text-sm text-text-muted">Server unavailable (not configured)</span>
        </div>
      </div>
    );
  }

  const unavailable = !status.socketConnected || isStale(status.updatedAt);

  if (unavailable) {
    return (
      <div className="facet-border rounded-sm bg-bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-danger" />
          <span className="text-sm text-text-muted">Server unavailable (no live data)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="mb-1 text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Population</div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-success" />
            {status.currentPopulation != null ? status.currentPopulation : "--"}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Current Layer</div>
          <div className="text-sm text-text-primary">{status.currentLayer || "--"}</div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Session</div>
          {status.activeSessionId != null ? (
            <span className="rounded-sm border border-success/30 bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              Active #{status.activeSessionId}
            </span>
          ) : (
            <span className="text-sm text-text-muted">No active session</span>
          )}
        </div>
      </div>

      {status.updatedAt && (
        <div className="mt-3 text-xs text-text-muted">
          Updated {new Date(status.updatedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

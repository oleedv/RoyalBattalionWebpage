"use client";

import { useState } from "react";
import { addWhitelistEntry } from "@/lib/api-client";
import type { AdminGroup, WhitelistCandidate, WhitelistEntry } from "shared";
import { toastError } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export interface RequestsApi {
  addWhitelistEntry: typeof addWhitelistEntry;
}
export interface RequestsNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: RequestsApi = { addWhitelistEntry };
const defaultNotify: RequestsNotify = { error: toastError };

export default function RequestsTab({
  candidates,
  groups,
  onApproved,
  dismissed: _dismissed,
  setDismissed,
  token,
  canManage,
  activeServer,
  api = defaultApi,
  notify = defaultNotify,
}: {
  candidates: WhitelistCandidate[];
  groups: AdminGroup[];
  onApproved: (entry: WhitelistEntry) => void;
  dismissed: Set<string>;
  setDismissed: React.Dispatch<React.SetStateAction<Set<string>>>;
  token: string | null;
  canManage: boolean;
  activeServer: string;
  api?: RequestsApi;
  notify?: RequestsNotify;
}) {
  const [approving, setApproving] = useState<string | null>(null);
  const [approveGroupId, setApproveGroupId] = useState<Record<string, string>>({});

  async function handleApprove(candidate: WhitelistCandidate) {
    if (!token) return;
    setApproving(candidate.userId);

    const groupId = approveGroupId[candidate.userId] || undefined;
    const res = await api.addWhitelistEntry(token, candidate.steamId, {
      name: candidate.discordName,
      groupId,
      server: activeServer,
    });

    if (res.success && res.data) {
      onApproved(res.data);
      setDismissed((prev) => new Set(prev).add(candidate.userId));
    } else {
      notify.error(res.error, "Failed to approve request");
    }
    setApproving(null);
  }

  function handleDismiss(userId: string) {
    setDismissed((prev) => new Set(prev).add(userId));
  }

  if (!canManage) {
    return (
      <div className="py-8 text-center text-text-muted">
        You need manage:whitelist permission to view requests.
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="facet-border rounded-sm bg-bg-card">
        <EmptyState message="No pending whitelist requests. Users with a qualifying Discord role and linked Steam ID will appear here." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => (
        <div key={c.userId} className="facet-border flex items-center justify-between rounded-sm bg-bg-card p-4">
          <div>
            <div className="mb-1 font-medium text-text-primary">{c.discordName}</div>
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <code className="font-mono text-accent">{c.steamId}</code>
              <span className="h-1 w-1 rounded-full bg-text-muted" />
              <span>Role: {c.roleName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={approveGroupId[c.userId] || ""}
              onChange={(e) =>
                setApproveGroupId((prev) => ({ ...prev, [c.userId]: e.target.value }))
              }
              className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Whitelist (default)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => handleApprove(c)}
              disabled={approving === c.userId}
              className="rounded-sm bg-success/15 px-4 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/25 disabled:opacity-50"
            >
              {approving === c.userId ? "Approving..." : "Approve"}
            </button>
            <Button variant="ghost" size="xs" onClick={() => handleDismiss(c.userId)}>
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

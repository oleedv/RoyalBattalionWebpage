"use client";

import { Fragment, useState } from "react";

export type AuditField = { label: string; value: string };
export type AuditChange = { key: string; label: string; from: string; to: string };

/**
 * Human-readable audit-detail panel: key-value grid, from -> to change rows,
 * and a collapsible raw-JSON block. Callers precompute the readable strings
 * (id -> name resolution is domain-specific).
 */
export function AuditDetail({
  fields,
  changes,
  plainChanges = [],
  raw,
}: {
  fields: AuditField[];
  changes: AuditChange[];
  plainChanges?: AuditField[];
  raw: unknown;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="rounded-sm border border-border bg-bg-secondary/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">Details</h3>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          {showRaw ? "Hide raw" : "Show raw"}
        </button>
      </div>

      {fields.length > 0 && (
        <dl className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
          {fields.map((e) => (
            <Fragment key={e.label}>
              <dt className="font-medium text-text-muted">{e.label}</dt>
              <dd className="break-words text-text-primary">{e.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {changes.length > 0 && (
        <div className={fields.length > 0 ? "mt-3" : ""}>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Changes</div>
          <div className="space-y-1.5">
            {changes.map((c) => (
              <div key={c.key} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-[5rem] font-medium text-text-muted">{c.label}</span>
                <span className="text-text-secondary">{c.from}</span>
                <span className="text-text-muted">→</span>
                <span className="font-medium text-text-primary">{c.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {plainChanges.length > 0 && (
        <dl className="mt-3 grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
          {plainChanges.map((e) => (
            <Fragment key={e.label}>
              <dt className="font-medium text-text-muted">{e.label}</dt>
              <dd className="break-words text-text-primary">{e.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {showRaw && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap border-t border-border/50 pt-3 font-mono text-xs text-text-muted">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
    </div>
  );
}

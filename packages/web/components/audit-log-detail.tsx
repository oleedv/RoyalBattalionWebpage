"use client";

import { Fragment, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { inspectAuditLog, type AuditInspectContext } from "@/lib/audit-inspect";
import type { AuditLogEntry } from "shared";

export function FilterNameButton({
  name,
  active,
  onFilter,
  title,
}: {
  name: string;
  active?: boolean;
  onFilter?: (name: string) => void;
  title?: string;
}) {
  if (!onFilter) {
    return <span className="font-medium text-text-primary">{name}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onFilter(name);
      }}
      title={title ?? (active ? `Clear filter for ${name}` : `Filter by ${name}`)}
      className={`text-left font-medium transition-colors hover:text-accent ${
        active ? "text-accent" : "text-text-primary"
      }`}
    >
      {name}
    </button>
  );
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={value}
      className="group inline-flex items-center gap-1.5 text-left"
    >
      <code className="break-all text-text-secondary">{value}</code>
      <span className="text-[10px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

export function AuditLogDetail({
  log,
  filterName,
  onFilterName,
  context,
}: {
  log: AuditLogEntry;
  filterName?: string;
  onFilterName?: (name: string) => void;
  context?: AuditInspectContext;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const view = inspectAuditLog(log, context);
  const others = view.people.filter((p) => p.label !== "Actor");

  return (
    <div
      className="rounded-sm border border-border bg-bg-secondary/40 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
          What happened
        </h3>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          {showRaw ? "Hide raw" : "Show raw"}
        </button>
      </div>

      <p className="mb-4 text-sm text-text-primary">{view.summary}</p>

      <dl className="grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="font-medium text-text-muted">By</dt>
        <dd className="break-words text-text-primary">
          <FilterNameButton
            name={view.actorName}
            active={filterName === view.actorName}
            onFilter={onFilterName}
          />
          {view.actorId && (
            <span className="ml-2 font-mono text-[11px] text-text-muted">{view.actorId}</span>
          )}
        </dd>

        {others.map((person) => (
          <Fragment key={`${person.label}:${person.name}:${person.id ?? ""}`}>
            <dt className="font-medium text-text-muted">{person.label}</dt>
            <dd className="break-words text-text-primary">
              <FilterNameButton
                name={person.name}
                active={filterName === person.name}
                onFilter={onFilterName}
              />
            </dd>
          </Fragment>
        ))}

        <dt className="font-medium text-text-muted">Action</dt>
        <dd className="text-text-primary">{view.actionLabel}</dd>

        <dt className="font-medium text-text-muted">Resource</dt>
        <dd className="break-words text-text-primary">
          {view.resourceLabel}
          {view.resourceId ? (
            <span className="ml-2 font-mono text-[11px] text-text-muted">{view.resourceId}</span>
          ) : null}
        </dd>

        <dt className="font-medium text-text-muted">When</dt>
        <dd className="text-text-primary">{formatDateTime(view.createdAt)}</dd>
      </dl>

      {view.fields.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Involved
          </div>
          <dl className="grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-4 gap-y-1.5 text-xs">
            {view.fields.map((field) => (
              <Fragment key={field.key}>
                <dt className="font-medium text-text-muted">{field.label}</dt>
                <dd className="break-words text-text-primary">
                  {field.filterValue && onFilterName ? (
                    <FilterNameButton
                      name={field.filterValue}
                      active={filterName === field.filterValue}
                      onFilter={onFilterName}
                    />
                  ) : field.copyable ? (
                    <Copyable value={field.value} />
                  ) : (
                    field.value
                  )}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}

      {view.changes.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Changes
          </div>
          <div className="space-y-1.5">
            {view.changes.map((change) => (
              <div key={change.key} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-[6.5rem] font-medium text-text-muted">{change.label}</span>
                {change.from != null && (
                  <>
                    <span className="text-text-secondary">{change.from}</span>
                    <span className="text-text-muted">→</span>
                  </>
                )}
                <span className="font-medium text-text-primary">{change.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRaw && (
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap border-t border-border/50 pt-3 font-mono text-xs text-text-muted">
          {JSON.stringify(
            {
              id: log.id,
              userId: log.userId,
              userName: log.userName,
              action: log.action,
              resource: log.resource,
              resourceId: log.resourceId,
              createdAt: log.createdAt,
              detail: log.detail,
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}

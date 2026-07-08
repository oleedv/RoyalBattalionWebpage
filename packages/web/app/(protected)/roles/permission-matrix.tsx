"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_GROUPS,
  getGroupActiveCount,
  type PermEntry,
  type PermGroup,
} from "./lib";
import type { Permission } from "shared";

function PermCard({
  entry,
  active,
  canManage,
  onToggle,
}: {
  entry: PermEntry;
  active: boolean;
  canManage: boolean;
  onToggle: (perm: Permission) => void;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-sm border px-3 py-2.5 text-xs transition-colors ${
        active ? "border-accent/30 bg-accent/10" : "border-border bg-bg-tertiary"
      } ${canManage ? "cursor-pointer hover:border-accent/40" : "cursor-default"}`}
      onClick={() => { if (canManage) onToggle(entry.perm); }}
    >
      {/* Wrapper stops the checkbox click (and Base UI's internal hidden-input re-dispatch) from
          also bubbling up to the card div's onClick, preventing a double-fire. */}
      <span className="mt-0.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={entry.label}
          checked={active}
          onCheckedChange={() => onToggle(entry.perm)}
          disabled={!canManage}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`font-medium tracking-wide ${active ? "text-accent" : "text-text-secondary"}`}>
          {entry.label}
        </div>
        <div className="mt-0.5 text-[10px] leading-tight text-text-muted">{entry.description}</div>
      </div>
    </div>
  );
}

export function PermissionMatrix({
  effectivePerms,
  canManage,
  onToggle,
  onSelectGroup,
}: {
  effectivePerms: Permission[];
  canManage: boolean;
  onToggle: (perm: Permission) => void;
  onSelectGroup: (group: PermGroup, select: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {PERMISSION_GROUPS.map((group) => {
        const { active, total } = getGroupActiveCount(group, effectivePerms);
        const allSelected = active === total;
        return (
          <div
            key={group.id}
            data-group={group.id}
            className="rounded-sm border border-border/50 bg-bg-tertiary/30"
          >
            {/* Group header */}
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${active > 0 ? "bg-accent" : "bg-text-muted/30"}`} />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                  {group.label}
                </span>
                <span className="text-[10px] text-text-muted/60">{group.description}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-text-muted/60">
                  {active}/{total}
                </span>
                {canManage && total > 1 && (
                  <button
                    type="button"
                    onClick={() => onSelectGroup(group, !allSelected)}
                    className="text-[10px] font-medium text-text-muted transition-colors hover:text-accent"
                  >
                    {allSelected ? "None" : "All"}
                  </button>
                )}
              </div>
            </div>

            {/* Main entries */}
            <div className="grid gap-1.5 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.entries.map((entry) => (
                <PermCard
                  key={entry.perm}
                  entry={entry}
                  active={effectivePerms.includes(entry.perm)}
                  canManage={canManage}
                  onToggle={onToggle}
                />
              ))}
            </div>

            {/* Sub-groups */}
            {group.subGroups?.map((sg) => (
              <div key={sg.label} className="mx-2 mb-2 border-t border-border/40 pt-2">
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
                    {sg.label}
                  </span>
                  <span className="text-[10px] text-text-muted/40">{sg.description}</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {sg.entries.map((entry) => (
                    <PermCard
                      key={entry.perm}
                      entry={entry}
                      active={effectivePerms.includes(entry.perm)}
                      canManage={canManage}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

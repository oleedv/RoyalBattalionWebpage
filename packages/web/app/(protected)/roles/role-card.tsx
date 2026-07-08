"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { PermissionMatrix } from "./permission-matrix";
import type { PermGroup } from "./lib";
import type { DiscordRole, Permission } from "shared";

export function RoleCard({
  role,
  effectivePerms,
  changed,
  isExpanded,
  canManage,
  saving,
  saveError,
  togglingWl,
  togglingMember,
  deleteOpen,
  onToggleExpand,
  onTogglePerm,
  onSelectGroup,
  onSave,
  onDiscard,
  onToggleWl,
  onToggleMember,
  onDeleteOpenChange,
  onConfirmDelete,
}: {
  role: DiscordRole;
  effectivePerms: Permission[];
  changed: boolean;
  isExpanded: boolean;
  canManage: boolean;
  saving: boolean;
  saveError: string | null;
  togglingWl: boolean;
  togglingMember: boolean;
  deleteOpen: boolean;
  onToggleExpand: () => void;
  onTogglePerm: (perm: Permission) => void;
  onSelectGroup: (group: PermGroup, select: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
  onToggleWl: () => void;
  onToggleMember: () => void;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}) {
  const permCount = effectivePerms.length;

  return (
    <div className="facet-border rounded-sm bg-bg-card">
      {/* Role header - clickable to expand/collapse */}
      <div
        onClick={onToggleExpand}
        className="flex cursor-pointer items-center justify-between p-5 pb-4 transition-colors hover:bg-bg-tertiary/30"
      >
        <div className="flex items-center gap-3">
          {/* Chevron */}
          <svg
            className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-display text-lg font-semibold tracking-wide text-text-primary">
                {role.name}
              </h3>
              {changed && (
                <span className="rounded-sm bg-warning/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-warning">
                  unsaved
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span>
                ID: <code className="text-text-secondary">{role.discordRoleId}</code>
              </span>
              <span className="text-text-muted/40">|</span>
              <span>
                {permCount > 0
                  ? `${permCount} permission${permCount !== 1 ? "s" : ""}`
                  : "No permissions"}
              </span>
              {role.grantsWhitelist && (
                <>
                  <span className="text-text-muted/40">|</span>
                  <span className="text-success">Grants Whitelist</span>
                </>
              )}
              {role.isMemberRole && (
                <>
                  <span className="text-text-muted/40">|</span>
                  <span className="text-accent">Member Role</span>
                </>
              )}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteOpenChange(true)}
            >
              Unregister
            </Button>
          </div>
        )}
      </div>

      {/* Expanded: permissions + actions */}
      {isExpanded && (
        <>
          {/* Role toggles + Save/Discard */}
          {canManage && (
            <div className="flex items-center justify-between border-t border-border/50 px-5 py-3">
              <div className="flex items-center gap-4">
                <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
                  <Switch
                    aria-label="Grants whitelist"
                    checked={role.grantsWhitelist}
                    onCheckedChange={() => onToggleWl()}
                    disabled={togglingWl}
                  />
                  <span className={role.grantsWhitelist ? "text-success" : "text-text-muted"}>
                    {role.grantsWhitelist ? "Grants Whitelist" : "No Whitelist"}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
                  <Switch
                    aria-label="Member role"
                    checked={role.isMemberRole}
                    onCheckedChange={() => onToggleMember()}
                    disabled={togglingMember}
                  />
                  <span className={role.isMemberRole ? "text-accent" : "text-text-muted"}>
                    {role.isMemberRole ? "Member Role" : "Not Member"}
                  </span>
                </div>
              </div>
              {changed && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={onSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Permissions"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onDiscard}>
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}

          {saveError && (
            <div className="mx-5 mb-3 text-sm text-danger">
              {saveError}
            </div>
          )}

          {/* Permission matrix */}
          <div
            className={`space-y-2 px-5 pb-5 ${
              !canManage ? "pointer-events-none opacity-70" : ""
            }`}
          >
            <PermissionMatrix
              effectivePerms={effectivePerms}
              canManage={canManage}
              onToggle={onTogglePerm}
              onSelectGroup={onSelectGroup}
            />
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Unregister {role.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the role registration and its permission assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onConfirmDelete}>
              Unregister Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

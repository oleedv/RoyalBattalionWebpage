"use client";

import { useEffect, useState } from "react";
import { EXTRA_GRANTABLE_PERMISSIONS } from "shared";
import type { Permission } from "shared";
import { updateUserExtraPermissions } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";

const LABELS: Record<string, { label: string; description: string }> = {
  "view:api-docs": {
    label: "View API Docs",
    description: "Swagger at /api-docs, without a Discord role",
  },
};

export function ExtraPermissionsPanel({
  userId,
  value,
  onSaved,
  embedded,
}: {
  userId: string;
  value: string[];
  onSaved?: (permissions: string[]) => void;
  embedded?: boolean;
}) {
  const { apiToken, hasPermission } = usePermissions();
  const canEdit = hasPermission("manage:members") || hasPermission("manage:roles");
  const [pending, setPending] = useState<string[]>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPending(value);
  }, [userId, value]);

  if (!canEdit && value.length === 0) return null;

  async function save() {
    if (!apiToken) return;
    setSaving(true);
    setError(null);
    const res = await updateUserExtraPermissions(apiToken, userId, pending as Permission[]);
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to save");
      return;
    }
    onSaved?.(res.data?.permissions ?? pending);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className={embedded ? "border-b border-border px-6 py-4" : "mt-4 rounded-sm border border-border bg-bg-card px-6 py-4"}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
        Extra permissions
      </h3>
      <p className="mb-3 text-xs text-text-secondary">
        Grants that are not tied to a Discord role. They survive role sync.
      </p>
      <div className="space-y-2">
        {EXTRA_GRANTABLE_PERMISSIONS.map((perm) => {
          const meta = LABELS[perm] ?? { label: perm, description: "" };
          const checked = pending.includes(perm);
          return (
            <label key={perm} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                disabled={!canEdit || saving}
                onChange={(e) => {
                  setPending((prev) =>
                    e.target.checked ? [...prev, perm] : prev.filter((p) => p !== perm),
                  );
                }}
              />
              <span>
                <span className="text-text-primary">{meta.label}</span>
                {meta.description && (
                  <span className="block text-xs text-text-muted">{meta.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-bg-primary disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-xs text-success">Saved</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}

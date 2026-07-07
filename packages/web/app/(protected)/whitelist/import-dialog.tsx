"use client";

import { useEffect, useMemo, useState } from "react";
import { bulkAddWhitelist } from "@/lib/api-client";
import type { AdminGroup, Clan, WhitelistEntry } from "shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  classifyImportRows,
  formatImportResult,
  importCounts,
  parseImportLines,
  type ParsedImportRow,
} from "./lib";

export interface ImportApi {
  bulkAddWhitelist: typeof bulkAddWhitelist;
}
const defaultApi: ImportApi = { bulkAddWhitelist };

export default function ImportDialog({
  open,
  onClose,
  entries,
  groups,
  clans,
  token,
  activeServer,
  onImported,
  api = defaultApi,
}: {
  open: boolean;
  onClose: () => void;
  entries: WhitelistEntry[];
  groups: AdminGroup[];
  clans: Clan[];
  token: string | null;
  activeServer: string;
  onImported: (message: string) => void;
  api?: ImportApi;
}) {
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Reset per open (mirrors the old openImportModal()).
  useEffect(() => {
    if (open) {
      setImportText("");
      setImportRows([]);
      setStep("paste");
      setError(null);
    }
  }, [open]);

  const dupeMap = useMemo(
    () => classifyImportRows(importRows, entries),
    [importRows, entries],
  );
  const counts = useMemo(() => importCounts(importRows, dupeMap), [importRows, dupeMap]);

  function handleParse() {
    setImportRows(parseImportLines(importText, clans, groups));
    setStep("review");
  }

  async function confirmImport() {
    if (!token) return;
    const validRows = importRows.filter((row, i) => row.steamId.trim() && !dupeMap.has(i));
    if (validRows.length === 0) return;

    setImporting(true);
    const res = await api.bulkAddWhitelist(
      token,
      validRows.map((r) => {
        const selectedClan = clans.find((c) => c.id === r.clanId);
        return {
          steamId: r.steamId,
          name: r.name || undefined,
          clanId: r.clanId || undefined,
          clan: selectedClan?.tag || undefined,
          groupId: r.groupId || undefined,
        };
      }),
      activeServer,
    );

    if (res.success && res.data) {
      onImported(formatImportResult(res.data.created, res.data.skipped));
      onClose();
    } else {
      setError(res.error || "Import failed");
    }
    setImporting(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold tracking-wide">
            Import Whitelist ({activeServer})
          </DialogTitle>
        </DialogHeader>

        {step === "paste" && (
          <div>
            <p className="mb-3 text-sm text-text-secondary">Paste entries in the format:</p>
            <code className="mb-3 block rounded-sm bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-secondary">
              Admin=76561197960957079:SuperAdmin // Ole
            </code>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste entries here, one per line..."
              rows={10}
              className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="gold" onClick={handleParse} disabled={!importText.trim()}>
                Parse
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-text-secondary">Review parsed entries before importing.</p>
              {importRows.length > 1 && importRows[0] && (importRows[0].clanId || importRows[0].groupId) && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setImportRows((prev) => {
                      const first = prev[0];
                      return prev.map((r, i) =>
                        i === 0 ? r : { ...r, clanId: first.clanId, groupId: first.groupId },
                      );
                    })
                  }
                >
                  Apply first row to all
                </Button>
              )}
            </div>
            <div className="mb-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-sm bg-accent/10 px-2 py-0.5 text-accent">{counts.newCount} new</span>
              {counts.existingCount > 0 && (
                <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-warning">{counts.existingCount} already whitelisted</span>
              )}
              {counts.batchCount > 0 && (
                <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-warning">{counts.batchCount} duplicate{counts.batchCount === 1 ? "" : "s"} in paste</span>
              )}
              {counts.errorCount > 0 && (
                <span className="rounded-sm bg-danger/10 px-2 py-0.5 text-danger">{counts.errorCount} error{counts.errorCount === 1 ? "" : "s"}</span>
              )}
            </div>
            <div className="mb-4 max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Steam ID</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Name</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Clan</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Group</th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, i) => {
                    const dupeReason = dupeMap.get(i);
                    const rowBg = row.error ? "bg-danger/10" : dupeReason ? "bg-warning/5" : "";
                    return (
                      <tr key={i} className={`border-b border-border/50 ${rowBg}`}>
                        <td className="px-3 py-2">
                          <input type="text" value={row.steamId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, steamId: e.target.value, error: false } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 font-mono text-sm text-accent focus:border-accent focus:outline-none" />
                          {dupeReason === "existing" && <span className="mt-1 block text-[10px] text-warning">Already whitelisted</span>}
                          {dupeReason === "batch" && <span className="mt-1 block text-[10px] text-warning">Duplicate in paste</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.name} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" />
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.clanId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, clanId: e.target.value } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                            <option value="">No Clan</option>
                            {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.groupId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => (j === i ? { ...r, groupId: e.target.value } : r)))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                            <option value="">No group</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => setImportRows((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-text-muted transition-colors hover:text-danger" aria-label={`Remove row ${i + 1}`}>
                            x
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">
                {counts.newCount} new {counts.newCount === 1 ? "entry" : "entries"} will be imported
              </span>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("paste")}>Back</Button>
                <Button variant="gold" onClick={confirmImport} disabled={importing || counts.newCount === 0}>
                  {importing ? "Importing..." : "Import"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

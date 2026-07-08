"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import type { SeedingConfig, SeedingSession } from "shared";

export function SeedingControls({
  config,
  activeSession,
  onSendNow,
  sending,
}: {
  config: SeedingConfig | null;
  activeSession: SeedingSession | null;
  onSendNow: () => void;
  sending: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Next Scheduled Call */}
        <div>
          <span className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
            Next Call
          </span>
          <div className="text-sm text-text-primary">
            {config?.dailyTime
              ? `${config.dailyTime} ${config.timezone || "UTC"}`
              : "Not configured"}
          </div>
        </div>

        {/* Active Session */}
        <div>
          <span className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
            Active Session
          </span>
          <div className="text-sm">
            {activeSession ? (
              <span className="text-success">
                Active - {activeSession.mapName || activeSession.layerName || "Unknown"} (
                {activeSession.peakPlayers ?? 0} peak)
              </span>
            ) : (
              <span className="text-text-muted">No active session</span>
            )}
          </div>
        </div>

        {/* Send Now */}
        <div className="flex items-end">
          <Button onClick={() => setConfirmOpen(true)} disabled={sending}>
            {sending ? "Sending..." : "Send Seeding Call Now"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Send seeding call now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will ping the seeder role in Discord.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onSendNow();
              }}
            >
              Send call
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

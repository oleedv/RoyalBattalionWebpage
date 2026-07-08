"use client";

import { useEffect } from "react";
import type { Prospect } from "shared";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { DescriptionList, InfoField } from "@/components/description-list";
import { DownloadButton } from "@/components/download-button";
import { CopyableId } from "@/components/copyable-id";
import { fmtDate, exportProspectText } from "./lib";
import { MessageAttachments } from "./ticket-detail";

function DetailSkeleton() {
  return (
    <SkeletonRegion label="Loading details…" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-sm" />
        <Skeleton className="h-16 w-full rounded-sm" />
      </div>
    </SkeletonRegion>
  );
}

function ProspectDetailBody({
  prospect,
  displayName,
}: {
  prospect: Prospect;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <DownloadButton text={exportProspectText(prospect)} filename={`prospect-${prospect.alias}.txt`} />
      </div>

      <DescriptionList>
        <InfoField label="Alias">{prospect.alias}</InfoField>
        <InfoField label="Nationality">{prospect.nationality}</InfoField>
        <InfoField label="Date of Birth">{prospect.dateOfBirth}</InfoField>
        <InfoField label="Squad Hours">{prospect.squadHours}h</InfoField>
        <InfoField label="Preferred Roles">{prospect.preferredRoles}</InfoField>
        <InfoField label="Previous Clan">{prospect.prevClan || "--"}</InfoField>
        <InfoField label="Active Hours">{prospect.activeHours}</InfoField>
        <InfoField label="Competitive">{prospect.competitive}</InfoField>
        <InfoField label="Steam ID">
          <CopyableId value={prospect.steamId} />
        </InfoField>
        {prospect.mentorId && <InfoField label="Mentor">{displayName(prospect.mentorId)}</InfoField>}
      </DescriptionList>

      <div>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">Why Royal Battalion?</span>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{prospect.whyRb}</p>
      </div>

      {prospect.votes && prospect.votes.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Votes ({prospect.votes.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {prospect.votes.map((v) => {
              const color =
                v.vote === "yes"
                  ? "text-success border-success/30 bg-success/10"
                  : v.vote === "no"
                    ? "text-danger border-danger/30 bg-danger/10"
                    : "text-accent border-accent/30 bg-accent/10";
              return (
                <div key={v.id} className={`rounded-sm border px-3 py-1.5 ${color}`}>
                  <div className="text-xs font-medium">{v.voterTag || v.voterId}</div>
                  <div className="text-[10px] uppercase font-semibold">{v.vote}</div>
                  {v.reason && <div className="mt-0.5 text-[10px] opacity-80">{v.reason}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {prospect.events && prospect.events.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Timeline</h4>
          <div className="space-y-2">
            {prospect.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {event.eventType.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-text-muted">by {displayName(event.actorId)}</span>
                  </div>
                  {event.detail && <p className="text-xs text-text-secondary">{event.detail}</p>}
                  <span className="text-xs text-text-muted">{fmtDate(event.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {prospect.messages && prospect.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Messages</h4>
          <div className="space-y-3">
            {prospect.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-sm border p-3 ${
                  msg.isStaff ? "border-accent/20 bg-accent/5" : "border-border/50 bg-bg-tertiary/30"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{msg.authorTag}</span>
                  {msg.isStaff && (
                    <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
                      Staff
                    </span>
                  )}
                  <span className="text-xs text-text-muted">{fmtDate(msg.createdAt)}</span>
                </div>
                {msg.content && (
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">{msg.content}</p>
                )}
                <MessageAttachments attachments={msg.attachments} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProspectDetailPanel({
  prospect,
  detail,
  ensureDetail,
  displayName,
}: {
  prospect: Prospect;
  detail: Prospect | undefined;
  ensureDetail: (id: number) => void;
  displayName: (id: string | null) => string;
}) {
  useEffect(() => {
    ensureDetail(prospect.id);
  }, [prospect.id, ensureDetail]);

  if (!detail) return <DetailSkeleton />;
  return <ProspectDetailBody prospect={detail} displayName={displayName} />;
}

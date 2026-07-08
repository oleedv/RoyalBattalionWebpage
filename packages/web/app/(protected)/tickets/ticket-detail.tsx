"use client";

import { useEffect } from "react";
import type { Ticket, LegacyTicket, LegacyTicketMessage } from "shared";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";
import { DescriptionList, InfoField } from "@/components/description-list";
import { DownloadButton } from "@/components/download-button";
import {
  fmtDate,
  exportTicketText,
  exportLegacyTicketText,
  parseAttachments,
  isImageUrl,
  LEGACY_MSG_STYLES,
} from "./lib";

export function MessageAttachments({ attachments }: { attachments: string | null }) {
  const urls = parseAttachments(attachments);
  if (urls.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url, i) =>
        isImageUrl(url) ? (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={url}
              alt={`Attachment ${i + 1}`}
              className="max-h-32 max-w-48 rounded-sm border border-border/50 object-cover transition-opacity hover:opacity-80"
              loading="lazy"
            />
          </a>
        ) : (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-accent transition-colors hover:bg-bg-card-hover"
          >
            Attachment {i + 1}
          </a>
        )
      )}
    </div>
  );
}

function LegacyMessageItem({ msg }: { msg: LegacyTicketMessage }) {
  const style = LEGACY_MSG_STYLES[msg.type] || LEGACY_MSG_STYLES.bot;
  const isBotType = msg.type === "bot" || msg.type === "bot_to_user";

  return (
    <div className={`rounded-sm border p-3 ${style.border} ${style.bg}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-sm font-medium ${isBotType ? "text-text-muted" : "text-text-primary"}`}>
          {msg.author || "System"}
        </span>
        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        <span className="text-xs text-text-muted">{fmtDate(msg.createdAt)}</span>
      </div>
      {msg.content && (
        <p className={`whitespace-pre-wrap text-sm ${isBotType ? "text-text-muted" : "text-text-secondary"}`}>
          {msg.content}
        </p>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <SkeletonRegion label="Loading details…" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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

function TicketDetailBody({
  ticket,
  displayName,
}: {
  ticket: Ticket;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <DescriptionList className="lg:grid-cols-4">
          <InfoField label="User">{displayName(ticket.userId)}</InfoField>
          <InfoField label="Created">{fmtDate(ticket.createdAt)}</InfoField>
          {ticket.closedAt && <InfoField label="Closed">{fmtDate(ticket.closedAt)}</InfoField>}
          {ticket.closedBy && <InfoField label="Closed By">{displayName(ticket.closedBy)}</InfoField>}
        </DescriptionList>
        <DownloadButton text={exportTicketText(ticket)} filename={`ticket-${ticket.id}.txt`} />
      </div>

      {ticket.events && ticket.events.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Timeline</h4>
          <div className="space-y-2">
            {ticket.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary capitalize">{event.eventType}</span>
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

      {ticket.messages && ticket.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Messages</h4>
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
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

      {!ticket.events?.length && !ticket.messages?.length && (
        <p className="py-4 text-center text-sm text-text-muted">No events or messages recorded</p>
      )}
    </div>
  );
}

function LegacyTicketDetailBody({ ticket }: { ticket: LegacyTicket }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <DescriptionList className="lg:grid-cols-4">
          <InfoField label="User">{ticket.nickname || ticket.username}</InfoField>
          {ticket.threadNumber && <InfoField label="Thread">#{ticket.threadNumber}</InfoField>}
          <InfoField label="Started">{fmtDate(ticket.startedAt)}</InfoField>
          {ticket.closedAt && <InfoField label="Closed">{fmtDate(ticket.closedAt)}</InfoField>}
          {ticket.previousThreads != null && ticket.previousThreads > 0 && (
            <InfoField label="Previous Threads">{ticket.previousThreads}</InfoField>
          )}
        </DescriptionList>
        <DownloadButton text={exportLegacyTicketText(ticket)} filename={`legacy-ticket-${ticket.id}.txt`} />
      </div>

      {ticket.messages && ticket.messages.length > 0 ? (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Messages ({ticket.messages.length})
          </h4>
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
              <LegacyMessageItem key={msg.id} msg={msg} />
            ))}
          </div>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-text-muted">No messages recorded</p>
      )}
    </div>
  );
}

export function TicketDetailPanel({
  ticket,
  detail,
  ensureDetail,
  displayName,
}: {
  ticket: Ticket;
  detail: Ticket | undefined;
  ensureDetail: (id: number) => void;
  displayName: (id: string | null) => string;
}) {
  useEffect(() => {
    ensureDetail(ticket.id);
  }, [ticket.id, ensureDetail]);

  if (!detail) return <DetailSkeleton />;
  return <TicketDetailBody ticket={detail} displayName={displayName} />;
}

export function LegacyTicketDetailPanel({
  ticket,
  detail,
  ensureDetail,
}: {
  ticket: LegacyTicket;
  detail: LegacyTicket | undefined;
  ensureDetail: (id: number) => void;
}) {
  useEffect(() => {
    ensureDetail(ticket.id);
  }, [ticket.id, ensureDetail]);

  if (!detail) return <DetailSkeleton />;
  return <LegacyTicketDetailBody ticket={detail} />;
}

"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getLegacyTicketByUuid } from "@/lib/api-client";
import type { LegacyTicket, LegacyTicketMessage } from "shared";
import { DescriptionList, InfoField } from "@/components/description-list";
import { StatusBadge } from "@/components/status-badge";
import { PublicPageHeading } from "@/components/public/page-heading";
import { SkeletonRegion, SkeletonText } from "@/components/skeleton";

const MSG_STYLES: Record<string, { border: string; bg: string; label: string; labelColor: string }> = {
  from_user: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "User", labelColor: "bg-blue-500/15 text-blue-400" },
  chat: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "Chat", labelColor: "bg-blue-500/15 text-blue-400" },
  to_user: { border: "border-accent/20", bg: "bg-accent/5", label: "Staff", labelColor: "bg-accent/15 text-accent" },
  command: { border: "border-accent/20", bg: "bg-accent/5", label: "Command", labelColor: "bg-accent/15 text-accent" },
  bot: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
  bot_to_user: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
};

function LegacyMessageItem({ msg }: { msg: LegacyTicketMessage }) {
  const style = MSG_STYLES[msg.type] || MSG_STYLES.bot;
  const isBotType = msg.type === "bot" || msg.type === "bot_to_user";

  return (
    <div className={`rounded-sm border p-4 ${style.border} ${style.bg}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`text-sm font-medium ${isBotType ? "text-text-muted" : "text-text-primary"}`}>
          {msg.author || "System"}
        </span>
        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        <span className="font-mono text-xs text-text-muted">
          {new Date(msg.createdAt).toLocaleString()}
        </span>
      </div>
      {msg.content && (
        <p className={`whitespace-pre-wrap text-sm ${isBotType ? "text-text-muted" : "text-text-secondary"}`}>
          {msg.content}
        </p>
      )}
    </div>
  );
}

export default function LegacyTicketPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = use(params);
  const [ticket, setTicket] = useState<LegacyTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLegacyTicketByUuid(uuid).then((res) => {
      if (res.success && res.data) {
        setTicket(res.data);
      } else {
        setError(res.error || "Ticket not found");
      }
      setLoading(false);
    });
  }, [uuid]);

  return (
    <main className="mx-auto max-w-4xl px-6 pb-16 pt-28">
      {loading && (
        <SkeletonRegion label="Loading ticket…" className="space-y-4">
          <SkeletonText lines={2} />
          <SkeletonText lines={4} />
        </SkeletonRegion>
      )}

      {error && (
        <div className="text-center">
          <h1 className="font-display mb-4 text-3xl font-bold tracking-wide">Ticket Not Found</h1>
          <p className="text-text-secondary">{error}</p>
          <Link href="/" className="mt-6 inline-block text-sm text-accent hover:text-accent-bright">
            Back to Home
          </Link>
        </div>
      )}

      {ticket && (
        <>
          <PublicPageHeading
            title={ticket.threadNumber ? `Thread #${ticket.threadNumber}` : `Ticket #${ticket.id}`}
          />
          <div className="-mt-6 mb-8 flex items-center justify-center gap-3">
            <StatusBadge variant="ticket-legacy" />
          </div>

          {/* Info grid */}
          <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
            <DescriptionList className="lg:grid-cols-4">
              <InfoField label="User">{ticket.nickname || ticket.username}</InfoField>
              <InfoField label="Username">{ticket.username}</InfoField>
              <InfoField label="Started">{new Date(ticket.startedAt).toLocaleString()}</InfoField>
              {ticket.closedAt && (
                <InfoField label="Closed">{new Date(ticket.closedAt).toLocaleString()}</InfoField>
              )}
              {ticket.threadNumber && (
                <InfoField label="Thread Number">#{ticket.threadNumber}</InfoField>
              )}
              {ticket.previousThreads != null && ticket.previousThreads > 0 && (
                <InfoField label="Previous Threads">{ticket.previousThreads}</InfoField>
              )}
              <InfoField label="User ID" mono>{ticket.userId}</InfoField>
            </DescriptionList>
          </div>

          {/* Messages */}
          {ticket.messages && ticket.messages.length > 0 && (
            <div className="facet-border rounded-sm bg-bg-card p-5">
              <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">
                Messages ({ticket.messages.length})
              </h2>
              <div className="space-y-3">
                {ticket.messages.map((msg) => (
                  <LegacyMessageItem key={msg.id} msg={msg} />
                ))}
              </div>
            </div>
          )}

          {!ticket.messages?.length && (
            <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
              No messages recorded for this ticket.
            </div>
          )}
        </>
      )}
    </main>
  );
}

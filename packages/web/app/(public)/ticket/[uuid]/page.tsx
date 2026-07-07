"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getTicketByUuid } from "@/lib/api-client";
import type { Ticket } from "shared";
import { Linkify, MessageAttachments } from "@/components/public/message-parts";
import { DescriptionList, InfoField } from "@/components/description-list";
import { StatusBadge } from "@/components/status-badge";
import { PublicPageHeading } from "@/components/public/page-heading";
import { SkeletonRegion, SkeletonText } from "@/components/skeleton";

const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
  comp_team: "Comp Team",
  whitelist: "Whitelist",
};

export default function TicketPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = use(params);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTicketByUuid(uuid).then((res) => {
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
          <PublicPageHeading title={`Ticket #${ticket.id}`} />
          <div className="-mt-6 mb-8 flex items-center justify-center gap-3">
            <StatusBadge
              variant={ticket.status === "open" ? "ticket-open" : "ticket-closed"}
            />
            <StatusBadge tone="neutral">{TIER_LABELS[ticket.tier] || ticket.tier}</StatusBadge>
          </div>

          {/* Info grid */}
          <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
            <DescriptionList className="lg:grid-cols-4">
              <InfoField label="User ID" mono>{ticket.userId}</InfoField>
              <InfoField label="Created">{new Date(ticket.createdAt).toLocaleString()}</InfoField>
              {ticket.closedAt && (
                <InfoField label="Closed">{new Date(ticket.closedAt).toLocaleString()}</InfoField>
              )}
              {ticket.closedBy && (
                <InfoField label="Closed By">{ticket.closedBy}</InfoField>
              )}
            </DescriptionList>
          </div>

          {/* Events timeline */}
          {ticket.events && ticket.events.length > 0 && (
            <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
              <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Timeline</h2>
              <div className="space-y-3">
                {ticket.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary capitalize">
                          {event.eventType}
                        </span>
                        <span className="text-xs text-text-muted">by {event.actorId}</span>
                      </div>
                      {event.detail && (
                        <p className="text-xs text-text-secondary">{event.detail}</p>
                      )}
                      <span className="font-mono text-xs text-text-muted">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {ticket.messages && ticket.messages.length > 0 && (
            <div className="facet-border rounded-sm bg-bg-card p-5">
              <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Messages</h2>
              <div className="space-y-3">
                {ticket.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-sm border p-4 ${
                      msg.isStaff
                        ? "border-accent/20 bg-accent/5"
                        : "border-border/50 bg-bg-tertiary/30"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {msg.authorTag}
                      </span>
                      {msg.isStaff && (
                        <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
                          Staff
                        </span>
                      )}
                      <span className="font-mono text-xs text-text-muted">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {msg.content && (
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">
                        <Linkify text={msg.content} />
                      </p>
                    )}
                    <MessageAttachments attachments={msg.attachments} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!ticket.events?.length && !ticket.messages?.length && (
            <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
              No events or messages recorded for this ticket.
            </div>
          )}
        </>
      )}
    </main>
  );
}

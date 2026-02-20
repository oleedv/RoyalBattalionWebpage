"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { getTicketByUuid } from "@/lib/api-client";
import type { Ticket } from "shared";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-accent/15 text-accent border-accent/30",
    closed: "bg-text-muted/15 text-text-secondary border-text-muted/30",
  };
  return (
    <span className={`rounded-sm border px-2.5 py-1 text-xs font-medium ${colors[status] || colors.closed}`}>
      {status}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const labels: Record<string, string> = {
    normal: "Normal",
    community_officer: "Community Officer",
    admin_officer: "Admin Officer",
  };
  return (
    <span className="rounded-sm border border-border bg-bg-tertiary px-2.5 py-1 text-xs text-text-secondary">
      {labels[tier] || tier}
    </span>
  );
}

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
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="border-b border-border/50 bg-bg-primary/60 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt="Royal Battalion"
              width={36}
              height={36}
              className="rounded-sm"
            />
            <span className="font-display text-lg font-semibold tracking-[0.15em] text-accent">
              ROYAL BATTALION
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent"
            >
              Home
            </Link>
            <Link
              href="/server"
              className="text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent"
            >
              Server
            </Link>
            <Link
              href="/login"
              className="glow-button rounded-sm border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-16">
        {loading && (
          <div className="text-center text-text-secondary">Loading ticket...</div>
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
            {/* Header */}
            <div className="mb-8">
              <div className="mb-4 flex items-center justify-center gap-3">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
                <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
              </div>
              <h1 className="font-display mb-4 text-center text-3xl font-bold tracking-wide sm:text-4xl">
                Ticket #{ticket.id}
              </h1>
              <div className="flex items-center justify-center gap-3">
                <StatusBadge status={ticket.status} />
                <TierBadge tier={ticket.tier} />
              </div>
            </div>

            {/* Info grid */}
            <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User ID</span>
                  <div className="mt-0.5 text-sm text-text-primary">{ticket.userId}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Created</span>
                  <div className="mt-0.5 text-sm text-text-primary">{new Date(ticket.createdAt).toLocaleString()}</div>
                </div>
                {ticket.closedAt && (
                  <div>
                    <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
                    <div className="mt-0.5 text-sm text-text-primary">{new Date(ticket.closedAt).toLocaleString()}</div>
                  </div>
                )}
                {ticket.closedBy && (
                  <div>
                    <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed By</span>
                    <div className="mt-0.5 text-sm text-text-primary">{ticket.closedBy}</div>
                  </div>
                )}
              </div>
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
                        <span className="text-xs text-text-muted">
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
                        <span className="text-xs text-text-muted">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {msg.content && (
                        <p className="whitespace-pre-wrap text-sm text-text-secondary">
                          {msg.content}
                        </p>
                      )}
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
    </div>
  );
}

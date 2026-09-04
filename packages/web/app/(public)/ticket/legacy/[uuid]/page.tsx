"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { NavAuthButton } from "@/components/nav-auth-button";
import { getLegacyTicketByUuid } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { LegacyTicket, LegacyTicketMessage } from "shared";

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
        <span className="text-xs text-text-muted">
          {formatDateTime(msg.createdAt)}
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
            <NavAuthButton className="glow-button rounded-sm border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60" />
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
                {ticket.threadNumber ? `Thread #${ticket.threadNumber}` : `Ticket #${ticket.id}`}
              </h1>
              <div className="flex items-center justify-center gap-3">
                <span className="rounded-sm border border-text-muted/30 bg-text-muted/15 px-2.5 py-1 text-xs font-medium text-text-secondary">
                  closed
                </span>
                <span className="rounded-sm border border-text-muted/30 bg-text-muted/10 px-2.5 py-1 text-xs font-medium text-text-muted">
                  Legacy
                </span>
              </div>
            </div>

            {/* Info grid */}
            <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User</span>
                  <div className="mt-0.5 text-sm text-text-primary">{ticket.nickname || ticket.username}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Username</span>
                  <div className="mt-0.5 text-sm text-text-primary">{ticket.username}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Started</span>
                  <div className="mt-0.5 text-sm text-text-primary">{formatDateTime(ticket.startedAt)}</div>
                </div>
                {ticket.closedAt && (
                  <div>
                    <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
                    <div className="mt-0.5 text-sm text-text-primary">{formatDateTime(ticket.closedAt)}</div>
                  </div>
                )}
                {ticket.threadNumber && (
                  <div>
                    <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Thread Number</span>
                    <div className="mt-0.5 text-sm text-text-primary">#{ticket.threadNumber}</div>
                  </div>
                )}
                {ticket.previousThreads != null && ticket.previousThreads > 0 && (
                  <div>
                    <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Previous Threads</span>
                    <div className="mt-0.5 text-sm text-text-primary">{ticket.previousThreads}</div>
                  </div>
                )}
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User ID</span>
                  <div className="mt-0.5 text-sm text-text-primary">{ticket.userId}</div>
                </div>
              </div>
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
    </div>
  );
}

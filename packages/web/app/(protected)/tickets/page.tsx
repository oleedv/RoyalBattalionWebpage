"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import {
  syncAuth,
  getTickets,
  getTicket,
  getProspects,
  getProspect,
} from "@/lib/api-client";
import type { Ticket, Prospect, Permission } from "shared";

type Tab = "tickets" | "prospects";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-accent/15 text-accent border-accent/30",
    closed: "bg-text-muted/15 text-text-secondary border-text-muted/30",
    accepted: "bg-success/15 text-success border-success/30",
    denied: "bg-danger/15 text-danger border-danger/30",
  };
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.closed}`}>
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
  const colors: Record<string, string> = {
    normal: "text-text-secondary",
    community_officer: "text-accent",
    admin_officer: "text-danger",
  };
  return (
    <span className={`text-xs ${colors[tier] || "text-text-muted"}`}>
      {labels[tier] || tier}
    </span>
  );
}

function TicketDetail({ ticket }: { ticket: Ticket }) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      {/* Events timeline */}
      {ticket.events && ticket.events.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Timeline
          </h4>
          <div className="space-y-2">
            {ticket.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {event.eventType}
                    </span>
                    <span className="text-xs text-text-muted">
                      by {event.actorId}
                    </span>
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
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Messages
          </h4>
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-sm border p-3 ${
                  msg.isStaff
                    ? "border-accent/20 bg-accent/5"
                    : "border-border/50 bg-bg-tertiary/30"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
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
        <p className="py-4 text-center text-sm text-text-muted">
          No events or messages recorded
        </p>
      )}
    </div>
  );
}

function ProspectDetail({ prospect }: { prospect: Prospect }) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      {/* Application info */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Alias</span>
          <div className="text-sm text-text-primary">{prospect.alias}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Nationality</span>
          <div className="text-sm text-text-primary">{prospect.nationality}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Date of Birth</span>
          <div className="text-sm text-text-primary">{prospect.dateOfBirth}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Squad Hours</span>
          <div className="text-sm text-text-primary">{prospect.squadHours}h</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Preferred Roles</span>
          <div className="text-sm text-text-primary">{prospect.preferredRoles}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Previous Clan</span>
          <div className="text-sm text-text-primary">{prospect.prevClan || "--"}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Active Hours</span>
          <div className="text-sm text-text-primary">{prospect.activeHours}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Competitive</span>
          <div className="text-sm text-text-primary">{prospect.competitive}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Steam ID</span>
          <div className="text-sm"><code className="text-accent">{prospect.steamId}</code></div>
        </div>
        {prospect.mentorId && (
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Mentor</span>
            <div className="text-sm text-text-primary">{prospect.mentorId}</div>
          </div>
        )}
      </div>

      <div className="mb-5">
        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Why Royal Battalion?</span>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{prospect.whyRb}</p>
      </div>

      {/* Votes */}
      {prospect.votes && prospect.votes.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Votes ({prospect.votes.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {prospect.votes.map((v) => {
              const color = v.vote === "yes" ? "text-success border-success/30 bg-success/10"
                : v.vote === "no" ? "text-danger border-danger/30 bg-danger/10"
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

      {/* Events */}
      {prospect.events && prospect.events.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Timeline
          </h4>
          <div className="space-y-2">
            {prospect.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {event.eventType.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-text-muted">
                      by {event.actorId}
                    </span>
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
      {prospect.messages && prospect.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Messages
          </h4>
          <div className="space-y-3">
            {prospect.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-sm border p-3 ${
                  msg.isStaff
                    ? "border-accent/20 bg-accent/5"
                    : "border-border/50 bg-bg-tertiary/30"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
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
    </div>
  );
}

function TicketRow({ ticket, onExpand, expanded, detail }: {
  ticket: Ticket;
  onExpand: () => void;
  expanded: boolean;
  detail: Ticket | null;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card transition-all">
      <button
        onClick={onExpand}
        className="w-full px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                  Ticket #{ticket.id}
                </span>
                <StatusBadge status={ticket.status} />
                <TierBadge tier={ticket.tier} />
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>User: {ticket.userId}</span>
                <span className="h-1 w-1 rounded-full bg-text-muted" />
                <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                {ticket.closedAt && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-text-muted" />
                    <span>Closed: {new Date(ticket.closedAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-5 w-5 text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>
      {expanded && detail && <TicketDetail ticket={detail} />}
      {expanded && !detail && (
        <div className="border-t border-border/50 px-5 py-6 text-center text-sm text-text-muted">
          Loading details...
        </div>
      )}
    </div>
  );
}

function ProspectRow({ prospect, onExpand, expanded, detail }: {
  prospect: Prospect;
  onExpand: () => void;
  expanded: boolean;
  detail: Prospect | null;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card transition-all">
      <button
        onClick={onExpand}
        className="w-full px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                  {prospect.alias}
                </span>
                <StatusBadge status={prospect.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>{prospect.nationality}</span>
                <span className="h-1 w-1 rounded-full bg-text-muted" />
                <span>{prospect.squadHours}h in Squad</span>
                <span className="h-1 w-1 rounded-full bg-text-muted" />
                <span>{new Date(prospect.createdAt).toLocaleDateString()}</span>
                {prospect.closedAt && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-text-muted" />
                    <span>Closed: {new Date(prospect.closedAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-5 w-5 text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>
      {expanded && detail && <ProspectDetail prospect={detail} />}
      {expanded && !detail && (
        <div className="border-t border-border/50 px-5 py-6 text-center text-sm text-text-muted">
          Loading details...
        </div>
      )}
    </div>
  );
}

export default function TicketsPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("tickets");
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tickets state
  const [tickets, setTicketsState] = useState<Ticket[]>([]);
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Record<number, Ticket>>({});

  // Prospects state
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [expandedProspect, setExpandedProspect] = useState<number | null>(null);
  const [prospectDetails, setProspectDetails] = useState<Record<number, Prospect>>({});

  useEffect(() => {
    async function init() {
      if (!session?.accessToken) return;

      try {
        const syncRes = await syncAuth(session.accessToken);
        if (syncRes.success && syncRes.data) {
          setApiToken(syncRes.data.token);
        }
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [session]);

  useEffect(() => {
    if (!apiToken) return;

    if (tab === "tickets" && tickets.length === 0) {
      getTickets(apiToken).then((res) => {
        if (res.success && res.data) setTicketsState(res.data);
        else setError(res.error || "Failed to load tickets");
      });
    }
    if (tab === "prospects" && prospects.length === 0) {
      getProspects(apiToken).then((res) => {
        if (res.success && res.data) setProspects(res.data);
        else setError(res.error || "Failed to load prospects");
      });
    }
  }, [apiToken, tab]);

  async function handleExpandTicket(id: number) {
    if (expandedTicket === id) {
      setExpandedTicket(null);
      return;
    }
    setExpandedTicket(id);
    if (!ticketDetails[id] && apiToken) {
      const res = await getTicket(apiToken, id);
      if (res.success && res.data) {
        setTicketDetails((prev) => ({ ...prev, [id]: res.data! }));
      }
    }
  }

  async function handleExpandProspect(id: number) {
    if (expandedProspect === id) {
      setExpandedProspect(null);
      return;
    }
    setExpandedProspect(id);
    if (!prospectDetails[id] && apiToken) {
      const res = await getProspect(apiToken, id);
      if (res.success && res.data) {
        setProspectDetails((prev) => ({ ...prev, [id]: res.data! }));
      }
    }
  }

  if (loading) {
    return <div className="text-text-secondary">Loading...</div>;
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Tickets
        </h1>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-sm border border-border bg-bg-tertiary/50 p-1">
        <button
          onClick={() => setTab("tickets")}
          className={`flex-1 rounded-sm px-4 py-2 text-sm font-medium tracking-wide transition-colors ${
            tab === "tickets"
              ? "bg-bg-card text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Support Tickets
        </button>
        <button
          onClick={() => setTab("prospects")}
          className={`flex-1 rounded-sm px-4 py-2 text-sm font-medium tracking-wide transition-colors ${
            tab === "prospects"
              ? "bg-bg-card text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Prospect Applications
        </button>
      </div>

      {/* Content */}
      {tab === "tickets" && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
              No tickets found
            </div>
          ) : (
            tickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                expanded={expandedTicket === t.id}
                detail={ticketDetails[t.id] || null}
                onExpand={() => handleExpandTicket(t.id)}
              />
            ))
          )}
        </div>
      )}

      {tab === "prospects" && (
        <div className="space-y-3">
          {prospects.length === 0 ? (
            <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
              No prospect applications found
            </div>
          ) : (
            prospects.map((p) => (
              <ProspectRow
                key={p.id}
                prospect={p}
                expanded={expandedProspect === p.id}
                detail={prospectDetails[p.id] || null}
                onExpand={() => handleExpandProspect(p.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

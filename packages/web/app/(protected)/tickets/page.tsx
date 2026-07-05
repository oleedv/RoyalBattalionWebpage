"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getTickets,
  getTicket,
  getLegacyTickets,
  getLegacyTicket,
  getProspects,
  getProspect,
  resolveDiscordNames,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Skeleton, SkeletonRegion, SkeletonList } from "@/components/skeleton";
import type { Ticket, LegacyTicket, LegacyTicketMessage, Prospect, Permission } from "shared";

type Tab = "tickets" | "prospects";

type UnifiedTicket =
  | { kind: "current"; data: Ticket }
  | { kind: "legacy"; data: LegacyTicket };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function exportTicketText(ticket: Ticket) {
  const lines: string[] = [];
  lines.push(`Ticket #${ticket.id} [${ticket.status}] - ${ticket.tier}`);
  lines.push(`User: ${ticket.userId}`);
  lines.push(`Created: ${fmtDate(ticket.createdAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${fmtDate(ticket.closedAt)}${ticket.closedBy ? ` by ${ticket.closedBy}` : ""}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of ticket.events) {
      lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) {
      const staff = m.isStaff ? " [STAFF]" : "";
      lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${staff}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

function exportLegacyTicketText(ticket: LegacyTicket) {
  const lines: string[] = [];
  lines.push(`Legacy Ticket #${ticket.id} [closed]`);
  lines.push(`User: ${ticket.nickname || ticket.username} (${ticket.userId})`);
  if (ticket.threadNumber) lines.push(`Thread: #${ticket.threadNumber}`);
  lines.push(`Started: ${fmtDate(ticket.startedAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${fmtDate(ticket.closedAt)}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) {
      lines.push(`[${fmtDate(m.createdAt)}] [${m.type}] ${m.author || "System"}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

function exportProspectText(prospect: Prospect) {
  const lines: string[] = [];
  lines.push(`Prospect: ${prospect.alias} [${prospect.status}]`);
  lines.push(`User: ${prospect.userId}`);
  lines.push(`Nationality: ${prospect.nationality}`);
  lines.push(`Date of Birth: ${prospect.dateOfBirth}`);
  lines.push(`Squad Hours: ${prospect.squadHours}h`);
  lines.push(`Preferred Roles: ${prospect.preferredRoles}`);
  lines.push(`Previous Clan: ${prospect.prevClan || "--"}`);
  lines.push(`Active Hours: ${prospect.activeHours}`);
  lines.push(`Competitive: ${prospect.competitive}`);
  lines.push(`Steam ID: ${prospect.steamId}`);
  if (prospect.mentorId) lines.push(`Mentor: ${prospect.mentorId}`);
  lines.push(`Created: ${fmtDate(prospect.createdAt)}`);
  if (prospect.closedAt) lines.push(`Closed: ${fmtDate(prospect.closedAt)}${prospect.closedBy ? ` by ${prospect.closedBy}` : ""}`);
  lines.push(`UUID: ${prospect.uuid}`);
  lines.push("", `--- Why Royal Battalion? ---`, prospect.whyRb);

  if (prospect.votes?.length) {
    lines.push("", "--- Votes ---");
    for (const v of prospect.votes) {
      lines.push(`[${fmtDate(v.createdAt)}] ${v.voterTag || v.voterId}: ${v.vote}${v.reason ? ` -- ${v.reason}` : ""}`);
    }
  }

  if (prospect.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of prospect.events) {
      lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }

  if (prospect.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of prospect.messages) {
      const staff = m.isStaff ? " [STAFF]" : "";
      lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${staff}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

function DownloadButton({ text, filename }: { text: string; filename: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
    >
      Download
    </button>
  );
}

function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((u: unknown) => typeof u === "string");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u: unknown) => typeof u === "string");
  } catch {
    // Not JSON, try comma-separated
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("cdn.discordapp.com");
}

function MessageAttachments({ attachments }: { attachments: string | null }) {
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-accent/15 text-accent border-accent/30",
    closing: "bg-warning/15 text-warning border-warning/30",
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

function LegacyBadge() {
  return (
    <span className="rounded-sm border border-text-muted/30 bg-text-muted/10 px-2 py-0.5 text-xs font-medium text-text-muted">
      Legacy
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const labels: Record<string, string> = {
    normal: "Normal",
    community_officer: "Community Officer",
    admin_officer: "Admin Officer",
    comp_team: "Comp Team",
    whitelist: "Whitelist",
  };
  const colors: Record<string, string> = {
    normal: "text-text-secondary",
    community_officer: "text-accent",
    admin_officer: "text-danger",
    comp_team: "text-blue-400",
    whitelist: "text-emerald-400",
  };
  return (
    <span className={`text-xs ${colors[tier] || "text-text-muted"}`}>
      {labels[tier] || tier}
    </span>
  );
}

const LEGACY_MSG_STYLES: Record<string, { border: string; bg: string; label: string; labelColor: string }> = {
  from_user: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "User", labelColor: "bg-blue-500/15 text-blue-400" },
  chat: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "Chat", labelColor: "bg-blue-500/15 text-blue-400" },
  to_user: { border: "border-accent/20", bg: "bg-accent/5", label: "Staff", labelColor: "bg-accent/15 text-accent" },
  command: { border: "border-accent/20", bg: "bg-accent/5", label: "Command", labelColor: "bg-accent/15 text-accent" },
  bot: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
  bot_to_user: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
};

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
        <span className="text-xs text-text-muted">
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

function LegacyTicketDetail({ ticket }: { ticket: LegacyTicket }) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <div className="mb-4 flex items-start justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User</span>
            <div className="text-sm text-text-primary">{ticket.nickname || ticket.username}</div>
          </div>
          {ticket.threadNumber && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Thread</span>
              <div className="text-sm text-text-primary">#{ticket.threadNumber}</div>
            </div>
          )}
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Started</span>
            <div className="text-sm text-text-primary">{new Date(ticket.startedAt).toLocaleString()}</div>
          </div>
          {ticket.closedAt && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
              <div className="text-sm text-text-primary">{new Date(ticket.closedAt).toLocaleString()}</div>
            </div>
          )}
          {ticket.previousThreads != null && ticket.previousThreads > 0 && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Previous Threads</span>
              <div className="text-sm text-text-primary">{ticket.previousThreads}</div>
            </div>
          )}
        </div>
        <DownloadButton text={exportLegacyTicketText(ticket)} filename={`legacy-ticket-${ticket.id}.txt`} />
      </div>

      {ticket.messages && ticket.messages.length > 0 && (
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
      )}

      {!ticket.messages?.length && (
        <p className="py-4 text-center text-sm text-text-muted">
          No messages recorded
        </p>
      )}
    </div>
  );
}

function TicketDetail({ ticket, displayName }: {
  ticket: Ticket;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <div className="mb-4 flex items-start justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User</span>
            <div className="text-sm text-text-primary">{displayName(ticket.userId)}</div>
          </div>
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Created</span>
            <div className="text-sm text-text-primary">{new Date(ticket.createdAt).toLocaleString()}</div>
          </div>
          {ticket.closedAt && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
              <div className="text-sm text-text-primary">{new Date(ticket.closedAt).toLocaleString()}</div>
            </div>
          )}
          {ticket.closedBy && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed By</span>
              <div className="text-sm text-text-primary">{displayName(ticket.closedBy)}</div>
            </div>
          )}
        </div>
        <DownloadButton text={exportTicketText(ticket)} filename={`ticket-${ticket.id}.txt`} />
      </div>

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
                      by {displayName(event.actorId)}
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
                <MessageAttachments attachments={msg.attachments} />
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

function ProspectDetail({ prospect, displayName }: { prospect: Prospect; displayName: (id: string | null) => string }) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <div className="mb-4 flex justify-end">
        <DownloadButton text={exportProspectText(prospect)} filename={`prospect-${prospect.alias}.txt`} />
      </div>
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
            <div className="text-sm text-text-primary">{displayName(prospect.mentorId)}</div>
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
                      by {displayName(event.actorId)}
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
                <MessageAttachments attachments={msg.attachments} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
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
    </div>
  );
}

function TicketRow({ ticket, onExpand, expanded, detail, displayName }: {
  ticket: Ticket;
  onExpand: () => void;
  expanded: boolean;
  detail: Ticket | null;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card transition-all">
      <div className="flex items-center">
        <button
          onClick={onExpand}
          className="flex-1 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
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
                  <span>{displayName(ticket.userId)}</span>
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
        <a
          href={`/ticket/${ticket.uuid}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
          title="Open in new tab"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
      {expanded && detail && <TicketDetail ticket={detail} displayName={displayName} />}
      {expanded && !detail && <DetailSkeleton />}
    </div>
  );
}

function LegacyTicketRow({ ticket, onExpand, expanded, detail }: {
  ticket: LegacyTicket;
  onExpand: () => void;
  expanded: boolean;
  detail: LegacyTicket | null;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card transition-all">
      <div className="flex items-center">
        <button
          onClick={onExpand}
          className="flex-1 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
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
                    {ticket.threadNumber ? `Thread #${ticket.threadNumber}` : `Ticket #${ticket.id}`}
                  </span>
                  <StatusBadge status="closed" />
                  <LegacyBadge />
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span>{ticket.nickname || ticket.username}</span>
                  <span className="h-1 w-1 rounded-full bg-text-muted" />
                  <span>{new Date(ticket.startedAt).toLocaleDateString()}</span>
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
        <a
          href={`/ticket/legacy/${ticket.uuid}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
          title="Open in new tab"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
      {expanded && detail && <LegacyTicketDetail ticket={detail} />}
      {expanded && !detail && <DetailSkeleton />}
    </div>
  );
}

function ProspectRow({ prospect, onExpand, expanded, detail, displayName }: {
  prospect: Prospect;
  onExpand: () => void;
  expanded: boolean;
  detail: Prospect | null;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card transition-all">
      <div className="flex items-center">
        <button
          onClick={onExpand}
          className="flex-1 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
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
        <a
          href={`/prospect/${prospect.uuid}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
          title="Open in new tab"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
      {expanded && detail && <ProspectDetail prospect={detail} displayName={displayName} />}
      {expanded && !detail && <DetailSkeleton />}
    </div>
  );
}

const ALL_TIERS = ["normal", "community_officer", "admin_officer", "comp_team", "whitelist"] as const;
const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
  comp_team: "Comp Team",
  whitelist: "Whitelist",
};

function getVisibleTiers(permissions: Permission[]): string[] {
  if (
    permissions.includes("developer") ||
    permissions.includes("view:tickets") ||
    permissions.includes("manage:tickets")
  ) {
    return [...ALL_TIERS];
  }
  const tiers: string[] = [];
  if (permissions.includes("view:tickets:normal")) tiers.push("normal");
  if (permissions.includes("view:tickets:community_officer")) tiers.push("community_officer");
  if (permissions.includes("view:tickets:admin_officer")) tiers.push("admin_officer");
  if (permissions.includes("view:tickets:comp_team")) tiers.push("comp_team");
  if (permissions.includes("view:tickets:whitelist")) tiers.push("whitelist");
  return tiers;
}

const PAGE_SIZE_KEY = "rb-tickets-page-size";
const PAGE_SIZES = [10, 20, 50, 100, 500, 1000] as const;

function getStoredPageSize(): number {
  if (typeof window === "undefined") return 10;
  const stored = localStorage.getItem(PAGE_SIZE_KEY);
  const n = Number(stored);
  return PAGE_SIZES.includes(n as any) ? n : 10;
}

export default function TicketsPage() {
  const { apiToken, permissions } = usePermissions();
  const visibleTiers = getVisibleTiers(permissions);
  const [tab, setTab] = useState<Tab>("tickets");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [pageSize, setPageSize] = useState(getStoredPageSize);
  const [page, setPage] = useState(0);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);
  const [prospectsLoaded, setProspectsLoaded] = useState(false);

  // Tickets state
  const [tickets, setTicketsState] = useState<Ticket[]>([]);
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Record<number, Ticket>>({});

  // Legacy tickets state
  const [legacyTickets, setLegacyTickets] = useState<LegacyTicket[]>([]);
  const [expandedLegacy, setExpandedLegacy] = useState<number | null>(null);
  const [legacyDetails, setLegacyDetails] = useState<Record<number, LegacyTicket>>({});

  // Prospects state
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [expandedProspect, setExpandedProspect] = useState<number | null>(null);
  const [prospectDetails, setProspectDetails] = useState<Record<number, Prospect>>({});

  // Discord ID -> display name map
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  async function resolveNames(ids: string[]) {
    if (!apiToken) return;
    const unknown = ids.filter((id) => id && !nameMap[id]);
    if (unknown.length === 0) return;
    const res = await resolveDiscordNames(apiToken, [...new Set(unknown)]);
    if (res.success && res.data) {
      setNameMap((prev) => ({ ...prev, ...res.data }));
    }
  }

  function displayName(id: string | null): string {
    if (!id) return "--";
    return nameMap[id] || id;
  }

  const refreshData = useCallback(async () => {
    if (!apiToken) return;
    try {
      if (tab === "tickets") {
        const [ticketRes, legacyRes] = await Promise.all([
          getTickets(apiToken),
          getLegacyTickets(apiToken),
        ]);
        if (ticketRes.success && ticketRes.data) {
          setTicketsState(ticketRes.data);
          const ids = ticketRes.data.flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]);
          resolveNames(ids);
        }
        if (legacyRes.success && legacyRes.data) {
          setLegacyTickets(legacyRes.data);
        }
      } else {
        const res = await getProspects(apiToken);
        if (res.success && res.data) {
          setProspects(res.data);
          const ids = res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]);
          resolveNames(ids);
        }
      }
    } catch { /* silent */ }
  }, [apiToken, tab]);

  useAutoRefresh(refreshData, 20_000, !!apiToken);

  useEffect(() => {
    if (!apiToken) return;

    if (tab === "tickets" && tickets.length === 0 && legacyTickets.length === 0) {
      Promise.all([
        getTickets(apiToken),
        getLegacyTickets(apiToken),
      ]).then(([ticketRes, legacyRes]) => {
        if (ticketRes.success && ticketRes.data) {
          setTicketsState(ticketRes.data);
          const ids = ticketRes.data.flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]);
          resolveNames(ids);
        } else {
          setError(ticketRes.error || "Failed to load tickets");
        }
        if (legacyRes.success && legacyRes.data) {
          setLegacyTickets(legacyRes.data);
        }
        setTicketsLoaded(true);
      });
    }
    if (tab === "prospects" && prospects.length === 0) {
      getProspects(apiToken).then((res) => {
        if (res.success && res.data) {
          setProspects(res.data);
          const ids = res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]);
          resolveNames(ids);
        } else setError(res.error || "Failed to load prospects");
        setProspectsLoaded(true);
      });
    }
  }, [apiToken, tab]);

  async function handleExpandTicket(id: number) {
    setExpandedLegacy(null);
    if (expandedTicket === id) {
      setExpandedTicket(null);
      return;
    }
    setExpandedTicket(id);
    if (!ticketDetails[id] && apiToken) {
      const res = await getTicket(apiToken, id);
      if (res.success && res.data) {
        setTicketDetails((prev) => ({ ...prev, [id]: res.data! }));
        const ids = (res.data.events || []).map((e) => e.actorId).filter(Boolean);
        resolveNames(ids);
      }
    }
  }

  async function handleExpandLegacy(id: number) {
    setExpandedTicket(null);
    if (expandedLegacy === id) {
      setExpandedLegacy(null);
      return;
    }
    setExpandedLegacy(id);
    if (!legacyDetails[id] && apiToken) {
      const res = await getLegacyTicket(apiToken, id);
      if (res.success && res.data) {
        setLegacyDetails((prev) => ({ ...prev, [id]: res.data! }));
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
        const ids = [
          ...(res.data.events || []).map((e) => e.actorId),
          ...(res.data.votes || []).map((v) => v.voterId),
        ].filter(Boolean);
        resolveNames(ids);
      }
    }
  }

  const filteredUnifiedTickets = useMemo(() => {
    const q = search.toLowerCase();

    const currentFiltered: UnifiedTicket[] = tickets
      .filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (tierFilter !== "all" && tierFilter !== "legacy" && t.tier !== tierFilter) return false;
        if (tierFilter === "legacy") return false;
        if (!visibleTiers.length || !visibleTiers.includes(t.tier)) return false;
        if (!q) return true;
        return (
          String(t.id).includes(q) ||
          t.userId.toLowerCase().includes(q) ||
          t.uuid.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q) ||
          (nameMap[t.userId] || "").toLowerCase().includes(q)
        );
      })
      .map((data): UnifiedTicket => ({ kind: "current", data }));

    const legacyFiltered: UnifiedTicket[] = legacyTickets
      .filter((t) => {
        if (statusFilter !== "all" && statusFilter !== "closed") return false;
        if (tierFilter !== "all" && tierFilter !== "legacy") return false;
        if (!q) return true;
        return (
          String(t.id).includes(q) ||
          (t.threadNumber ? String(t.threadNumber).includes(q) : false) ||
          t.username.toLowerCase().includes(q) ||
          (t.nickname || "").toLowerCase().includes(q) ||
          t.userId.toLowerCase().includes(q) ||
          t.uuid.toLowerCase().includes(q)
        );
      })
      .map((data): UnifiedTicket => ({ kind: "legacy", data }));

    const unified = [...currentFiltered, ...legacyFiltered];
    unified.sort((a, b) => {
      const dateA = a.kind === "current" ? a.data.createdAt : a.data.startedAt;
      const dateB = b.kind === "current" ? b.data.createdAt : b.data.startedAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return unified;
  }, [tickets, legacyTickets, search, statusFilter, tierFilter, visibleTiers, nameMap]);

  const filteredProspects = useMemo(() => {
    const q = search.toLowerCase();
    return prospects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.alias.toLowerCase().includes(q) ||
        p.userId.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        p.steamId.toLowerCase().includes(q) ||
        p.uuid.toLowerCase().includes(q)
      );
    });
  }, [prospects, search, statusFilter]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, statusFilter, tierFilter, tab]);

  const activeList = tab === "tickets" ? filteredUnifiedTickets : filteredProspects;
  const totalPages = Math.max(1, Math.ceil(activeList.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const paginatedTickets = useMemo(
    () => filteredUnifiedTickets.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [filteredUnifiedTickets, safePage, pageSize],
  );
  const paginatedProspects = useMemo(
    () => filteredProspects.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [filteredProspects, safePage, pageSize],
  );

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
    setPage(0);
  }

  const statusOptions = tab === "tickets"
    ? ["all", "open", "closing", "closed"]
    : ["all", "open", "closed", "accepted", "denied"];

  const initialLoading =
    !apiToken || (tab === "tickets" ? !ticketsLoaded : !prospectsLoaded);

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

      {/* Search & Filter */}
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "tickets" ? "Search by ID, user, UUID, username..." : "Search by alias, nationality, steam ID, UUID..."}
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {tab === "tickets" && (
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
          >
            <option value="all">All Types</option>
            {visibleTiers.map((t) => (
              <option key={t} value={t}>{TIER_LABELS[t] || t}</option>
            ))}
            <option value="legacy">Legacy</option>
          </select>
        )}
      </div>

      {/* Content */}
      {tab === "tickets" && (
        <div className="space-y-3">
          {initialLoading ? (
            <SkeletonList rows={6} avatar />
          ) : filteredUnifiedTickets.length === 0 ? (
            <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
              {tickets.length === 0 && legacyTickets.length === 0 ? "No tickets found" : "No tickets match your search"}
            </div>
          ) : (
            paginatedTickets.map((item) =>
              item.kind === "current" ? (
                <TicketRow
                  key={`current-${item.data.id}`}
                  ticket={item.data}
                  expanded={expandedTicket === item.data.id}
                  detail={ticketDetails[item.data.id] || null}
                  onExpand={() => handleExpandTicket(item.data.id)}
                  displayName={displayName}
                />
              ) : (
                <LegacyTicketRow
                  key={`legacy-${item.data.id}`}
                  ticket={item.data}
                  expanded={expandedLegacy === item.data.id}
                  detail={legacyDetails[item.data.id] || null}
                  onExpand={() => handleExpandLegacy(item.data.id)}
                />
              )
            )
          )}
        </div>
      )}

      {tab === "prospects" && (
        <div className="space-y-3">
          {initialLoading ? (
            <SkeletonList rows={6} avatar />
          ) : filteredProspects.length === 0 ? (
            <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
              {prospects.length === 0 ? "No prospect applications found" : "No prospects match your search"}
            </div>
          ) : (
            paginatedProspects.map((p) => (
              <ProspectRow
                key={p.id}
                prospect={p}
                expanded={expandedProspect === p.id}
                detail={prospectDetails[p.id] || null}
                onExpand={() => handleExpandProspect(p.id)}
                displayName={displayName}
              />
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {activeList.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>
              {safePage * pageSize + 1}--{Math.min((safePage + 1) * pageSize, activeList.length)} of {activeList.length}
            </span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s} per page</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              Prev
            </button>
            <span className="px-3 text-xs text-text-muted">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

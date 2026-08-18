"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { NavAuthButton } from "@/components/nav-auth-button";
import { getProspectByUuid } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { ProspectForumEmbed } from "./ProspectForumEmbed";
import type { Prospect, ProspectForumMessage } from "shared";

function extractUrls(arr: unknown[]): string[] {
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "url" in item) return (item as { url: string }).url;
      return null;
    })
    .filter(Boolean) as string[];
}

function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return extractUrls(raw);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return extractUrls(parsed);
  } catch {
    // Not JSON
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("cdn.discordapp.com");
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all hover:text-accent-bright">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
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
    closed: "bg-text-muted/15 text-text-secondary border-text-muted/30",
    accepted: "bg-success/15 text-success border-success/30",
    denied: "bg-danger/15 text-danger border-danger/30",
  };
  return (
    <span className={`rounded-sm border px-2.5 py-1 text-xs font-medium ${colors[status] || colors.closed}`}>
      {status}
    </span>
  );
}

function getDenialEvent(prospect: Prospect) {
  const events = prospect.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].eventType === "denied") return events[i];
  }
  return null;
}

function DenialBanner({ prospect }: { prospect: Prospect }) {
  if (prospect.status !== "denied") return null;

  const deniedEvent = getDenialEvent(prospect);
  const reason = deniedEvent?.detail?.trim() || null;

  return (
    <div
      role="status"
      className="mb-6 rounded-sm border border-danger/40 bg-danger/10 p-5"
    >
      <div className="mb-2 text-[10px] font-semibold tracking-[0.15em] text-danger uppercase">
        Denial reason
      </div>
      <p className="whitespace-pre-wrap text-base font-medium text-text-primary">
        {reason ?? "No reason was recorded."}
      </p>
      {deniedEvent?.createdAt && (
        <p className="mt-2 text-xs text-text-muted">
          Denied {formatDateTime(deniedEvent.createdAt)}
        </p>
      )}
    </div>
  );
}

export default function ProspectPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = use(params);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProspectByUuid(uuid).then((res) => {
      if (res.success && res.data) {
        setProspect(res.data);
      } else {
        setError(res.error || "Prospect not found");
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
          <div className="text-center text-text-secondary">Loading prospect...</div>
        )}

        {error && (
          <div className="text-center">
            <h1 className="font-display mb-4 text-3xl font-bold tracking-wide">Prospect Not Found</h1>
            <p className="text-text-secondary">{error}</p>
            <Link href="/" className="mt-6 inline-block text-sm text-accent hover:text-accent-bright">
              Back to Home
            </Link>
          </div>
        )}

        {prospect && (
          <>
            {/* Header */}
            <div className="mb-8">
              <div className="mb-4 flex items-center justify-center gap-3">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
                <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
              </div>
              <h1 className="font-display mb-4 text-center text-3xl font-bold tracking-wide sm:text-4xl">
                {prospect.alias}
              </h1>
              <div className="flex items-center justify-center gap-3">
                <StatusBadge status={prospect.status} />
              </div>
            </div>

            <DenialBanner prospect={prospect} />

            {/* Application info */}
            <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User ID</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.userId}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Nationality</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.nationality}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Date of Birth</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.dateOfBirth}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Squad Hours</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.squadHours}h</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Preferred Roles</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.preferredRoles}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Previous Clan</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.prevClan || "--"}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Active Hours</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.activeHours}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Competitive</span>
                  <div className="mt-0.5 text-sm text-text-primary">{prospect.competitive}</div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Steam ID</span>
                  <div className="mt-0.5 text-sm"><code className="text-accent">{prospect.steamId}</code></div>
                </div>
                {prospect.mentorId && (
                  <div>
                    <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Mentor</span>
                    <div className="mt-0.5 text-sm text-text-primary">{prospect.mentorId}</div>
                  </div>
                )}
                <div>
                  <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Created</span>
                  <div className="mt-0.5 text-sm text-text-primary">{formatDateTime(prospect.createdAt)}</div>
                </div>
                {prospect.closedAt && (
                  <div>
                    <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
                    <div className="mt-0.5 text-sm text-text-primary">{formatDateTime(prospect.closedAt)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Why RB */}
            <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
              <h2 className="font-display mb-3 text-lg font-semibold tracking-wide">Why Royal Battalion?</h2>
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{prospect.whyRb}</p>
            </div>

            {/* Votes */}
            {prospect.votes && prospect.votes.length > 0 && (
              <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
                <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">
                  Votes ({prospect.votes.length})
                </h2>
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

            {/* Forum Discussion */}
            <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
              <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Forum Discussion</h2>
              {prospect.forumMessages && prospect.forumMessages.length > 0 ? (
                <div className="space-y-3">
                  {prospect.forumMessages.map((msg: ProspectForumMessage) => (
                    <div
                      key={msg.id}
                      className={`rounded-sm border p-4 ${
                        msg.isBot
                          ? "border-accent/20 bg-accent/5"
                          : "border-border/50 bg-bg-tertiary/30"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        {msg.authorAvatar && (
                          <img
                            src={msg.authorAvatar}
                            alt=""
                            className="h-5 w-5 rounded-full"
                            loading="lazy"
                          />
                        )}
                        <span className="text-sm font-medium text-text-primary">
                          {msg.authorTag}
                        </span>
                        {msg.isBot && (
                          <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
                            Bot
                          </span>
                        )}
                        <span className="text-xs text-text-muted">
                          {formatDateTime(msg.createdAt)}
                        </span>
                      </div>
                      {msg.content && (
                        <p className="whitespace-pre-wrap text-sm text-text-secondary">
                          <Linkify text={msg.content} />
                        </p>
                      )}
                      <MessageAttachments attachments={msg.attachments} />
                      {msg.embeds && msg.embeds.length > 0 && (
                        <div className="mt-2">
                          {msg.embeds.map((embed, i) => (
                            <ProspectForumEmbed key={i} embed={embed} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No forum discussion recorded.</p>
              )}
            </div>

            {/* Events timeline */}
            {prospect.events && prospect.events.length > 0 && (
              <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
                <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Timeline</h2>
                <div className="space-y-3">
                  {prospect.events.map((event) => {
                    const isDenied = event.eventType === "denied";
                    return (
                      <div key={event.id} className="flex items-start gap-3">
                        <div className={`mt-1.5 h-2 w-2 rounded-full ${isDenied ? "bg-danger" : "bg-accent/50"}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium capitalize ${isDenied ? "text-danger" : "text-text-primary"}`}>
                              {event.eventType.replace(/_/g, " ")}
                            </span>
                            <span className="text-xs text-text-muted">by {event.actorId}</span>
                          </div>
                          {event.detail && (
                            <p className={isDenied ? "text-sm font-medium text-text-primary" : "text-xs text-text-secondary"}>
                              {event.detail}
                            </p>
                          )}
                          <span className="text-xs text-text-muted">
                            {formatDateTime(event.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="facet-border rounded-sm bg-bg-card p-5">
              <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Messages</h2>
              {prospect.messages && prospect.messages.length > 0 ? (
                <div className="space-y-3">
                  {prospect.messages.map((msg) => (
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
                          {formatDateTime(msg.createdAt)}
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
              ) : (
                <p className="text-sm text-text-muted">No messages recorded.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

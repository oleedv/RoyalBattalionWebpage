"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getProspectByUuid } from "@/lib/api-client";
import type { Prospect, ProspectForumMessage } from "shared";
import { Linkify, MessageAttachments } from "@/components/public/message-parts";
import { DescriptionList, InfoField } from "@/components/description-list";
import { CopyableId } from "@/components/copyable-id";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";
import { PublicPageHeading } from "@/components/public/page-heading";
import { SkeletonRegion, SkeletonText } from "@/components/skeleton";
import { DiscordEmbedCard } from "@/components/discord-embed";

const STATUS_VARIANT: Record<string, StatusVariant> = {
  open: "ticket-open",
  accepted: "ticket-accepted",
  denied: "ticket-denied",
};

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
    <main className="mx-auto max-w-4xl px-6 pb-16 pt-28">
      {loading && (
        <SkeletonRegion label="Loading prospect…" className="space-y-4">
          <SkeletonText lines={2} />
          <SkeletonText lines={4} />
        </SkeletonRegion>
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
          <PublicPageHeading title={prospect.alias} />
          <div className="-mt-6 mb-8 flex items-center justify-center gap-3">
            <StatusBadge variant={STATUS_VARIANT[prospect.status] ?? "ticket-closed"} />
          </div>

          {/* Application info */}
          <div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
            <DescriptionList>
              <InfoField label="User ID" mono>{prospect.userId}</InfoField>
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
              {prospect.mentorId && (
                <InfoField label="Mentor" mono>{prospect.mentorId}</InfoField>
              )}
              <InfoField label="Created">{new Date(prospect.createdAt).toLocaleString()}</InfoField>
              {prospect.closedAt && (
                <InfoField label="Closed">{new Date(prospect.closedAt).toLocaleString()}</InfoField>
              )}
            </DescriptionList>
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
                  const color =
                    v.vote === "yes"
                      ? "text-success border-success/30 bg-success/10"
                      : v.vote === "no"
                        ? "text-danger border-danger/30 bg-danger/10"
                        : "text-accent border-accent/30 bg-accent/10";
                  return (
                    <div key={v.id} className={`rounded-sm border px-3 py-1.5 ${color}`}>
                      <div className="text-xs font-medium">{v.voterTag || v.voterId}</div>
                      <div className="text-[10px] font-semibold uppercase">{v.vote}</div>
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
                    {msg.embeds && msg.embeds.length > 0 && (
                      <div className="mt-2">
                        {msg.embeds.map((embed, i) => (
                          <DiscordEmbedCard key={i} embed={embed} />
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
                {prospect.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary capitalize">
                          {event.eventType.replace(/_/g, " ")}
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
            ) : (
              <p className="text-sm text-text-muted">No messages recorded.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

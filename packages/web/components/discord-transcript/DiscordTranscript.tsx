"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { DiscordEmbedCard } from "./embed-card";
import {
  buildTranscript,
  snippet,
  type ThreadGroup,
  type TranscriptMessage,
} from "./group-transcript";

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

function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(stripQuery(url)) || url.includes("cdn.discordapp.com");
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)$/i.test(stripQuery(url));
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
      {urls.map((url, i) => {
        if (isVideoUrl(url)) {
          return (
            <div key={i} className="flex flex-col gap-1">
              <video
                src={url}
                controls
                preload="metadata"
                className="max-h-64 max-w-96 rounded-sm border border-border/50"
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="self-start text-xs text-accent underline hover:text-accent-bright"
              >
                Download
              </a>
            </div>
          );
        }
        if (isImageUrl(url)) {
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={url}
                alt={`Attachment ${i + 1}`}
                className="max-h-32 max-w-48 rounded-sm border border-border/50 object-cover transition-opacity hover:opacity-80"
                loading="lazy"
              />
            </a>
          );
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-accent transition-colors hover:bg-bg-card-hover"
          >
            Attachment {i + 1}
          </a>
        );
      })}
    </div>
  );
}

function bubbleClass(message: TranscriptMessage): string {
  if (message.isBot) return "border-accent/15 bg-bg-tertiary/40";
  if (message.isStaff) return "border-accent/20 bg-accent/5";
  return "border-border/50 bg-bg-tertiary/30";
}

function MessageBody({ message }: { message: TranscriptMessage }) {
  return (
    <>
      {message.content && (
        <p className="whitespace-pre-wrap text-sm text-text-secondary">
          <Linkify text={message.content} />
        </p>
      )}
      <MessageAttachments attachments={message.attachments} />
      {message.embeds && message.embeds.length > 0 && (
        <div className="mt-1">
          {message.embeds.map((embed, i) => (
            <DiscordEmbedCard key={i} embed={embed} />
          ))}
        </div>
      )}
    </>
  );
}

function ReplyBar({ replyTo }: { replyTo: TranscriptMessage }) {
  return (
    <div className="mb-2 flex items-start gap-0 text-xs text-text-muted">
      <span
        aria-hidden
        className="mt-2 mr-2 h-2.5 w-4 shrink-0 rounded-tl-sm border-l-2 border-t-2 border-text-muted/35"
      />
      <span className="min-w-0 truncate pt-0.5">
        <span className="font-medium text-text-secondary">{replyTo.authorTag}</span>
        {" "}
        {snippet(replyTo.content)}
      </span>
    </div>
  );
}

function ThreadToggle({
  thread,
  expanded,
  onToggle,
}: {
  thread: ThreadGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const count = thread.messages.length;
  const label = count === 1 ? "1 Message" : `${count} Messages`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-2 flex w-full items-center gap-2 rounded-sm px-0 py-1 text-left text-xs font-medium text-accent transition-colors hover:text-accent-bright"
    >
      <span aria-hidden className="h-px w-7 bg-accent/40" />
      <span>{label}</span>
      {thread.threadName && (
        <span className="truncate font-normal text-text-muted">· {thread.threadName}</span>
      )}
      <span aria-hidden className="text-text-muted">{expanded ? "▾" : "▸"}</span>
    </button>
  );
}

function ChatBubble({
  message,
  replyTo,
  compact,
}: {
  message: TranscriptMessage;
  replyTo: TranscriptMessage | null;
  compact: boolean;
}) {
  return (
    <div className={`rounded-sm border ${compact ? "p-3" : "p-4"} ${bubbleClass(message)}`}>
      {replyTo && <ReplyBar replyTo={replyTo} />}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-text-primary">{message.authorTag}</span>
        {message.isStaff && (
          <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
            Staff
          </span>
        )}
        {message.isBot && (
          <span className="rounded-sm bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-semibold text-text-muted uppercase">
            Bot
          </span>
        )}
        <span className="text-xs text-text-muted">{formatDateTime(message.createdAt)}</span>
      </div>
      <MessageBody message={message} />
    </div>
  );
}

function lookupReply(message: TranscriptMessage, all: TranscriptMessage[]): TranscriptMessage | null {
  if (!message.replyToMessageId) return null;
  return all.find((other) => other.discordMessageId === message.replyToMessageId) || null;
}

export function DiscordTranscript({
  messages,
  compact = false,
  emptyLabel = "No messages recorded",
}: {
  messages: TranscriptMessage[] | null | undefined;
  compact?: boolean;
  emptyLabel?: string;
}) {
  const list = messages || [];
  const nodes = useMemo(() => buildTranscript(list), [list]);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});

  if (list.length === 0) {
    return <p className="py-4 text-center text-sm text-text-muted">{emptyLabel}</p>;
  }

  const toggle = (threadId: string) => {
    setOpenThreads((prev) => ({ ...prev, [threadId]: !prev[threadId] }));
  };

  return (
    <div className="space-y-3">
      {nodes.map((node) => {
        if (node.kind === "orphan-thread") {
          const expanded = Boolean(openThreads[node.thread.threadId]);
          return (
            <div key={`thread-${node.thread.threadId}`} className="rounded-sm border border-accent/20 bg-bg-tertiary/20 p-3">
              <ThreadToggle
                thread={node.thread}
                expanded={expanded}
                onToggle={() => toggle(node.thread.threadId)}
              />
              {expanded && (
                <div className="mt-2 space-y-2 border-l-2 border-accent/30 pl-3">
                  {node.thread.messages.map((threadMsg) => (
                    <ChatBubble
                      key={threadMsg.id}
                      message={threadMsg}
                      replyTo={lookupReply(threadMsg, node.thread.messages)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          );
        }

        const expanded = node.thread ? Boolean(openThreads[node.thread.threadId]) : false;
        return (
          <div key={node.message.id}>
            <ChatBubble message={node.message} replyTo={node.replyTo} compact={compact} />
            {node.thread && (
              <div className="ml-2">
                <ThreadToggle
                  thread={node.thread}
                  expanded={expanded}
                  onToggle={() => toggle(node.thread!.threadId)}
                />
                {expanded && (
                  <div className="mt-2 space-y-2 border-l-2 border-accent/30 pl-3">
                    {node.thread.messages.map((threadMsg) => (
                      <ChatBubble
                        key={threadMsg.id}
                        message={threadMsg}
                        replyTo={lookupReply(threadMsg, node.thread!.messages)}
                        compact
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

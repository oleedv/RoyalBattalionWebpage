import type { DiscordEmbed } from "shared";

export interface TranscriptMessage {
  id: number;
  authorId: string;
  authorTag: string;
  content: string | null;
  attachments: string | null;
  isStaff: boolean;
  isBot?: boolean;
  createdAt: string;
  discordMessageId?: string | null;
  channelMessageId?: string | null;
  replyToMessageId?: string | null;
  threadId?: string | null;
  threadName?: string | null;
  embeds?: DiscordEmbed[] | null;
}

export interface ThreadGroup {
  threadId: string;
  threadName: string | null;
  messages: TranscriptMessage[];
}

export type TranscriptNode =
  | { kind: "message"; message: TranscriptMessage; replyTo: TranscriptMessage | null; thread: ThreadGroup | null }
  | { kind: "orphan-thread"; thread: ThreadGroup };

function byDiscordId(messages: TranscriptMessage[]): Map<string, TranscriptMessage> {
  const map = new Map<string, TranscriptMessage>();
  for (const msg of messages) {
    if (msg.discordMessageId) map.set(msg.discordMessageId, msg);
  }
  return map;
}

export function isRelayMirror(message: TranscriptMessage, messages: TranscriptMessage[]): boolean {
  if (!message.discordMessageId) return false;
  return messages.some(
    (other) => other.id !== message.id && other.channelMessageId === message.discordMessageId,
  );
}

export function formatTranscriptLine(
  message: TranscriptMessage,
  formatDateTime: (iso: string) => string,
): string {
  const flags = [
    message.isStaff ? "STAFF" : null,
    message.isBot ? "BOT" : null,
  ].filter(Boolean);
  const flag = flags.length ? ` [${flags.join(" ")}]` : "";
  const reply = message.replyToMessageId ? " (reply)" : "";
  return `[${formatDateTime(message.createdAt)}] ${message.authorTag}${flag}${reply}: ${message.content || ""}`;
}

export function exportTranscriptLines(
  messages: TranscriptMessage[],
  formatDateTime: (iso: string) => string,
): string[] {
  const nodes = buildTranscript(messages);
  const lines: string[] = [];
  for (const node of nodes) {
    if (node.kind === "message") {
      lines.push(formatTranscriptLine(node.message, formatDateTime));
      if (node.thread) {
        const label = node.thread.threadName || "Thread";
        lines.push(`  --- ${label} (${node.thread.messages.length}) ---`);
        for (const threadMsg of node.thread.messages) {
          lines.push(`  ${formatTranscriptLine(threadMsg, formatDateTime)}`);
        }
      }
      continue;
    }
    const label = node.thread.threadName || "Thread";
    lines.push(`--- ${label} (${node.thread.messages.length}) ---`);
    for (const threadMsg of node.thread.messages) {
      lines.push(`  ${formatTranscriptLine(threadMsg, formatDateTime)}`);
    }
  }
  return lines;
}

export function snippet(text: string | null | undefined, max = 80): string {
  const trimmed = (text || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "Attachment";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildTranscript(messages: TranscriptMessage[]): TranscriptNode[] {
  const visible = messages.filter((m) => !isRelayMirror(m, messages));
  const index = byDiscordId(visible);

  const threadMessages = new Map<string, TranscriptMessage[]>();
  const channelMessages: TranscriptMessage[] = [];

  for (const msg of visible) {
    if (msg.threadId) {
      const list = threadMessages.get(msg.threadId) || [];
      list.push(msg);
      threadMessages.set(msg.threadId, list);
    } else {
      channelMessages.push(msg);
    }
  }

  for (const list of threadMessages.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  }

  const attachedThreadIds = new Set<string>();
  const nodes: TranscriptNode[] = [];

  const lookupReply = (msg: TranscriptMessage): TranscriptMessage | null => {
    if (!msg.replyToMessageId) return null;
    return index.get(msg.replyToMessageId) || null;
  };

  const takeThread = (starterId: string | null | undefined): ThreadGroup | null => {
    if (!starterId) return null;
    const list = threadMessages.get(starterId);
    if (!list || list.length === 0) return null;
    attachedThreadIds.add(starterId);
    return {
      threadId: starterId,
      threadName: list[0]?.threadName || null,
      messages: list,
    };
  };

  for (const msg of channelMessages) {
    nodes.push({
      kind: "message",
      message: msg,
      replyTo: lookupReply(msg),
      thread: takeThread(msg.discordMessageId),
    });
  }

  const orphans: ThreadGroup[] = [];
  for (const [threadId, list] of threadMessages) {
    if (attachedThreadIds.has(threadId) || list.length === 0) continue;
    orphans.push({
      threadId,
      threadName: list[0]?.threadName || null,
      messages: list,
    });
  }

  if (orphans.length === 0) return nodes;

  const interleaved: TranscriptNode[] = [...nodes];
  for (const thread of orphans) {
    const firstAt = thread.messages[0]?.createdAt || "";
    const insertAt = interleaved.findIndex((node) => {
      const at = node.kind === "message" ? node.message.createdAt : node.thread.messages[0]?.createdAt || "";
      return at > firstAt;
    });
    const orphanNode: TranscriptNode = { kind: "orphan-thread", thread };
    if (insertAt === -1) interleaved.push(orphanNode);
    else interleaved.splice(insertAt, 0, orphanNode);
  }
  return interleaved;
}

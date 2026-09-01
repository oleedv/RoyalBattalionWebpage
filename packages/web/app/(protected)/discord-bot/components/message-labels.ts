import type { BotMessage } from "shared";

/** `Name (id)` when a distinct name exists; otherwise the id alone. */
export function formatNamedId(name: string | null | undefined, id: string): string {
  const trimmed = name?.trim();
  if (!id) return trimmed || "";
  if (!trimmed || trimmed === id) return id;
  return `${trimmed} (${id})`;
}

export function authorLabel(m: Pick<BotMessage, "authorTag" | "authorId">): string {
  return formatNamedId(m.authorTag, m.authorId);
}

export function channelLabel(m: BotMessage): string {
  if (m.isDm) return formatNamedId("DM", m.channelId);

  if (m.threadName) {
    const threadId = m.threadId || m.channelId;
    const thread = formatNamedId(m.threadName, threadId);
    const parentId = m.parentChannelId || "";
    if (m.parentChannelName || parentId) {
      const parent = formatNamedId(m.parentChannelName, parentId);
      return parent ? `${parent} › ${thread}` : thread;
    }
    return thread;
  }

  return formatNamedId(m.channelName, m.channelId);
}

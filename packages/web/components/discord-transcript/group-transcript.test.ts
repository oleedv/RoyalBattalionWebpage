import { expect, test } from "bun:test";
import { buildTranscript, exportTranscriptLines, isRelayMirror, snippet, type TranscriptMessage } from "./group-transcript";

function msg(partial: Partial<TranscriptMessage> & { id: number }): TranscriptMessage {
  return {
    authorId: "u",
    authorTag: "user#1",
    content: "hello",
    attachments: null,
    isStaff: false,
    createdAt: "2026-08-21T10:00:00.000Z",
    ...partial,
  };
}

test("hides the bot relay embed when a user DM row already points at it", () => {
  const userDm = msg({
    id: 1,
    discordMessageId: "dm-1",
    channelMessageId: "embed-1",
    content: "I need help",
  });
  const botEmbed = msg({
    id: 2,
    discordMessageId: "embed-1",
    isBot: true,
    authorTag: "Royal Secretary#0000",
    content: "I need help",
  });
  expect(isRelayMirror(botEmbed, [userDm, botEmbed])).toBe(true);
  expect(isRelayMirror(userDm, [userDm, botEmbed])).toBe(false);
  const nodes = buildTranscript([userDm, botEmbed]);
  expect(nodes).toHaveLength(1);
  expect(nodes[0].kind).toBe("message");
  if (nodes[0].kind === "message") expect(nodes[0].message.id).toBe(1);
});

test("attaches a Discord reply to its parent in the main stream", () => {
  const parent = msg({ id: 1, discordMessageId: "m1", content: "Can you join?" });
  const reply = msg({
    id: 2,
    discordMessageId: "m2",
    replyToMessageId: "m1",
    content: "Yes",
    createdAt: "2026-08-21T10:01:00.000Z",
  });
  const nodes = buildTranscript([parent, reply]);
  expect(nodes).toHaveLength(2);
  expect(nodes[1].kind).toBe("message");
  if (nodes[1].kind === "message") {
    expect(nodes[1].replyTo?.id).toBe(1);
    expect(nodes[1].message.content).toBe("Yes");
  }
});

test("nests thread messages under the starter when thread id equals starter message id", () => {
  const starter = msg({ id: 1, discordMessageId: "thread-1", content: "Check this steam id" });
  const t1 = msg({
    id: 2,
    discordMessageId: "t-a",
    threadId: "thread-1",
    threadName: "steam check",
    content: "Looks banned",
    isStaff: true,
    createdAt: "2026-08-21T10:02:00.000Z",
  });
  const t2 = msg({
    id: 3,
    discordMessageId: "t-b",
    threadId: "thread-1",
    threadName: "steam check",
    content: "Yeah CBL hit",
    isStaff: true,
    createdAt: "2026-08-21T10:03:00.000Z",
  });
  const nodes = buildTranscript([starter, t1, t2]);
  expect(nodes).toHaveLength(1);
  expect(nodes[0].kind).toBe("message");
  if (nodes[0].kind === "message") {
    expect(nodes[0].thread?.threadName).toBe("steam check");
    expect(nodes[0].thread?.messages.map((m) => m.content)).toEqual(["Looks banned", "Yeah CBL hit"]);
  }
});

test("orphan threads without a starter sit at their first message time", () => {
  const before = msg({ id: 1, discordMessageId: "a", createdAt: "2026-08-21T10:00:00.000Z", content: "hi" });
  const after = msg({ id: 2, discordMessageId: "c", createdAt: "2026-08-21T10:10:00.000Z", content: "bye" });
  const threadMsg = msg({
    id: 3,
    discordMessageId: "b",
    threadId: "loose-thread",
    threadName: "side chat",
    createdAt: "2026-08-21T10:05:00.000Z",
    content: "in thread",
    isStaff: true,
  });
  const nodes = buildTranscript([before, after, threadMsg]);
  expect(nodes.map((n) => n.kind)).toEqual(["message", "orphan-thread", "message"]);
  expect(nodes[1].kind).toBe("orphan-thread");
  if (nodes[1].kind === "orphan-thread") {
    expect(nodes[1].thread.threadName).toBe("side chat");
  }
});

test("export lists thread messages under a thread header", () => {
  const starter = msg({ id: 1, discordMessageId: "thread-1", content: "parent" });
  const nested = msg({
    id: 2,
    discordMessageId: "t-a",
    threadId: "thread-1",
    threadName: "steam check",
    content: "banned",
    createdAt: "2026-08-21T10:02:00.000Z",
  });
  const lines = exportTranscriptLines([starter, nested], () => "time");
  expect(lines.some((line) => line.includes("steam check"))).toBe(true);
  expect(lines.some((line) => line.includes("banned"))).toBe(true);
});

test("snippet truncates and falls back for empty content", () => {
  expect(snippet("short")).toBe("short");
  expect(snippet("x".repeat(90)).endsWith("…")).toBe(true);
  expect(snippet("")).toBe("Attachment");
  expect(snippet(null)).toBe("Attachment");
});

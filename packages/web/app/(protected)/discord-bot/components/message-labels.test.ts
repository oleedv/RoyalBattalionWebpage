import { expect, test } from "bun:test";
import type { BotMessage } from "shared";
import { authorLabel, channelLabel, formatNamedId } from "./message-labels";

function msg(overrides: Partial<BotMessage> = {}): BotMessage {
  return {
    id: 1,
    messageId: "m1",
    channelId: "chan-1",
    channelName: "general",
    guildId: "guild-1",
    authorId: "auth-1",
    authorTag: "alice",
    content: "hello",
    attachments: null,
    isDm: false,
    direction: "incoming",
    createdAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

test("formatNamedId appends id after a distinct name", () => {
  expect(formatNamedId("general", "123")).toBe("general (123)");
});

test("formatNamedId omits duplicate name when it equals the id", () => {
  expect(formatNamedId("123", "123")).toBe("123");
});

test("formatNamedId falls back to id when name is missing", () => {
  expect(formatNamedId(null, "123")).toBe("123");
  expect(formatNamedId("  ", "123")).toBe("123");
});

test("authorLabel is tag (authorId)", () => {
  expect(authorLabel(msg())).toBe("alice (auth-1)");
});

test("channelLabel is name (channelId) for guild channels", () => {
  expect(channelLabel(msg())).toBe("general (chan-1)");
});

test("channelLabel for DMs includes the channel id", () => {
  expect(channelLabel(msg({ isDm: true, channelName: null }))).toBe("DM (chan-1)");
});

test("channelLabel for threads includes parent and thread ids", () => {
  expect(
    channelLabel(
      msg({
        channelId: "thread-9",
        channelName: null,
        parentChannelId: "chan-1",
        parentChannelName: "tickets",
        threadId: "thread-9",
        threadName: "help-ole",
      }),
    ),
  ).toBe("tickets (chan-1) › help-ole (thread-9)");
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { DiscordTranscript } from "./DiscordTranscript";
import type { TranscriptMessage } from "./group-transcript";

afterEach(() => {
  cleanup();
});

function msg(partial: Partial<TranscriptMessage> & { id: number }): TranscriptMessage {
  return {
    authorId: "u",
    authorTag: "Staff#1",
    content: "hello",
    attachments: null,
    isStaff: true,
    createdAt: "2026-08-21T10:00:00.000Z",
    ...partial,
  };
}

test("shows a reply bar and keeps thread messages collapsed until opened", () => {
  const parent = msg({ id: 1, authorTag: "User#1", discordMessageId: "thread-1", content: "steam?", isStaff: false });
  const reply = msg({
    id: 2,
    discordMessageId: "m2",
    replyToMessageId: "thread-1",
    content: "checking",
    createdAt: "2026-08-21T10:01:00.000Z",
  });
  const threadMsg = msg({
    id: 3,
    discordMessageId: "t-a",
    threadId: "thread-1",
    threadName: "steam check",
    content: "CBL hit",
    createdAt: "2026-08-21T10:02:00.000Z",
  });

  const { queryByText, getByRole, getByText } = render(
    <DiscordTranscript messages={[parent, reply, threadMsg]} />,
  );

  expect(queryByText("CBL hit")).toBeNull();
  fireEvent.click(getByRole("button", { name: /1 Message/i }));
  expect(getByText("CBL hit")).toBeTruthy();
});

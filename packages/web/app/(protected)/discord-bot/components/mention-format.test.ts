import { expect, test } from "bun:test";
import { extractUserMentionIds, formatUserMentions } from "./mention-format";

test("extractUserMentionIds finds <@id> and <@!id>", () => {
  expect(
    extractUserMentionIds("<@353223201913962496> are you able to do that?"),
  ).toEqual(["353223201913962496"]);
  expect(extractUserMentionIds("hey <@!111222333444555666> and <@222333444555666777>")).toEqual([
    "111222333444555666",
    "222333444555666777",
  ]);
});

test("extractUserMentionIds ignores roles and channels", () => {
  expect(extractUserMentionIds("<@&role> <#chan> plain")).toEqual([]);
});

test("formatUserMentions puts the display name in front of the mention", () => {
  expect(
    formatUserMentions("<@353223201913962496> are you able to do that?", {
      "353223201913962496": "OleEd",
    }),
  ).toBe("OleEd <@353223201913962496> are you able to do that?");
});

test("formatUserMentions leaves unknown mentions unchanged", () => {
  const raw = "<@353223201913962496> are you able to do that?";
  expect(formatUserMentions(raw, {})).toBe(raw);
});

test("formatUserMentions does not double-prefix an already named mention", () => {
  expect(
    formatUserMentions("OleEd <@353223201913962496>", {
      "353223201913962496": "OleEd",
    }),
  ).toBe("OleEd <@353223201913962496>");
});

import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  Linkify,
  MessageAttachments,
  parseAttachments,
  isImageUrl,
  isVideoUrl,
} from "@/components/public/message-parts";

test("parseAttachments handles JSON arrays, object urls, csv and null", () => {
  expect(parseAttachments(null)).toEqual([]);
  expect(parseAttachments('["https://a/x.png"]')).toEqual(["https://a/x.png"]);
  expect(parseAttachments('[{"url":"https://a/y.jpg"}]')).toEqual(["https://a/y.jpg"]);
  expect(parseAttachments("https://a/1.png, https://a/2.png")).toEqual([
    "https://a/1.png",
    "https://a/2.png",
  ]);
});

test("url type detection ignores query strings and trusts discord cdn", () => {
  expect(isImageUrl("https://x/y.webp?w=1")).toBe(true);
  expect(isVideoUrl("https://x/y.mp4?t=2")).toBe(true);
  expect(isImageUrl("https://cdn.discordapp.com/attachments/1/2/blob")).toBe(true);
  expect(isVideoUrl("https://cdn.discordapp.com/attachments/1/2/c.mov")).toBe(true);
});

test("Linkify turns bare urls into anchors", () => {
  render(<p><Linkify text="see https://example.com/x now" /></p>);
  const a = screen.getByRole("link");
  expect(a.getAttribute("href")).toBe("https://example.com/x");
});

test("MessageAttachments renders video for video urls", () => {
  const { container } = render(
    <MessageAttachments attachments='["https://x/clip.mp4"]' />,
  );
  expect(container.querySelector("video")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Download" })).toBeDefined();
});

test("Linkify handles multiple urls with long interstitial text", () => {
  const text =
    "first https://a.example/one then a much longer stretch of plain prose between the links https://b.example/two end";
  render(<p><Linkify text={text} /></p>);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(2);
  expect(links[0].getAttribute("href")).toBe("https://a.example/one");
  expect(links[1].getAttribute("href")).toBe("https://b.example/two");
});

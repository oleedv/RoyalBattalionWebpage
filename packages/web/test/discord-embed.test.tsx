import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DiscordEmbedCard } from "@/components/discord-embed";

test("uses the discord token for the stripe when no color is set", () => {
  const { container } = render(
    <DiscordEmbedCard embed={{ description: "hello" }} />,
  );
  const card = container.firstElementChild as HTMLElement;
  expect(card.style.borderLeft).toContain("var(--color-discord)");
});

test("renders author, linked title and fields grid", () => {
  render(
    <DiscordEmbedCard
      embed={{
        color: 0xff0000,
        author: { name: "Royal Secretary" },
        title: "Application",
        url: "https://example.com",
        fields: [
          { name: "Steam", value: "7656119...", inline: true },
          { name: "Why RB", value: "Because.", inline: false },
        ],
      }}
    />,
  );
  expect(screen.getByText("Royal Secretary")).toBeDefined();
  expect(screen.getByRole("link", { name: "Application" }).getAttribute("href")).toBe("https://example.com");
  expect(screen.getByText("Why RB")).toBeDefined();
});

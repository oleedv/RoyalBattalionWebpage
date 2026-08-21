"use client";

import type { DiscordEmbed } from "shared";
import { DiscordEmbedCard } from "@/components/discord-transcript/embed-card";

export function ProspectForumEmbed({ embed }: { embed: DiscordEmbed }) {
  return <DiscordEmbedCard embed={embed} />;
}

"use client";

import type { DiscordEmbed } from "shared";

function colorToHex(color?: number): string {
  if (color == null) return "#5865f2";
  return "#" + color.toString(16).padStart(6, "0");
}

export function ProspectForumEmbed({ embed }: { embed: DiscordEmbed }) {
  const stripe = colorToHex(embed.color);

  return (
    <div
      className="my-2 flex overflow-hidden rounded-sm border border-border/40 bg-bg-tertiary/40"
      style={{ borderLeft: `4px solid ${stripe}` }}
    >
      <div className="flex-1 p-3">
        {embed.author?.name && (
          <div className="mb-1 flex items-center gap-2">
            {embed.author.icon_url && (
              <img
                src={embed.author.icon_url}
                alt=""
                className="h-5 w-5 rounded-full"
                loading="lazy"
              />
            )}
            <span className="text-xs font-medium text-text-secondary">
              {embed.author.name}
            </span>
          </div>
        )}

        {embed.title && (
          <div className="mb-1 text-sm font-semibold text-text-primary">
            {embed.url ? (
              <a
                href={embed.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline hover:text-accent-bright"
              >
                {embed.title}
              </a>
            ) : (
              embed.title
            )}
          </div>
        )}

        {embed.description && (
          <div className="mb-2 whitespace-pre-wrap text-sm text-text-secondary">
            {embed.description}
          </div>
        )}

        {embed.fields && embed.fields.length > 0 && (
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            {embed.fields.map((f, i) => (
              <div key={i} className={f.inline === false ? "sm:col-span-2" : undefined}>
                <div className="text-xs font-semibold text-text-primary">{f.name}</div>
                <div className="whitespace-pre-wrap text-xs text-text-secondary">{f.value}</div>
              </div>
            ))}
          </div>
        )}

        {embed.image?.url && (
          <a href={embed.image.url} target="_blank" rel="noopener noreferrer">
            <img
              src={embed.image.url}
              alt=""
              className="mt-1 max-h-64 max-w-full rounded-sm border border-border/30"
              loading="lazy"
            />
          </a>
        )}

        {embed.footer?.text && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-text-muted">
            {embed.footer.icon_url && (
              <img src={embed.footer.icon_url} alt="" className="h-3 w-3 rounded-full" />
            )}
            <span>{embed.footer.text}</span>
          </div>
        )}
      </div>

      {embed.thumbnail?.url && (
        <a
          href={embed.thumbnail.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-3"
        >
          <img
            src={embed.thumbnail.url}
            alt=""
            className="max-h-20 max-w-20 rounded-sm border border-border/30"
            loading="lazy"
          />
        </a>
      )}
    </div>
  );
}

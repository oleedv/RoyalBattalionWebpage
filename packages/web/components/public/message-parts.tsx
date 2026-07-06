"use client";

function extractUrls(arr: unknown[]): string[] {
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "url" in item)
        return (item as { url: string }).url;
      return null;
    })
    .filter(Boolean) as string[];
}

export function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return extractUrls(raw);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return extractUrls(parsed);
  } catch {
    // Not JSON
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)$/i.test(stripQuery(url));
}

export function isImageUrl(url: string): boolean {
  if (isVideoUrl(url)) return false;
  return (
    /\.(png|jpe?g|gif|webp)$/i.test(stripQuery(url)) ||
    url.includes("cdn.discordapp.com")
  );
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline break-all hover:text-accent-bright"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function MessageAttachments({
  attachments,
}: {
  attachments: string | string[] | null;
}) {
  const urls = parseAttachments(attachments);
  if (urls.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url, i) => {
        if (isVideoUrl(url)) {
          return (
            <div key={i} className="flex flex-col gap-1">
              <video
                src={url}
                controls
                preload="metadata"
                className="max-h-64 max-w-96 rounded-sm border border-border/50"
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="self-start text-xs text-accent underline hover:text-accent-bright"
              >
                Download
              </a>
            </div>
          );
        }
        if (isImageUrl(url)) {
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={url}
                alt={`Attachment ${i + 1}`}
                className="max-h-32 max-w-48 rounded-sm border border-border/50 object-cover transition-opacity hover:opacity-80"
                loading="lazy"
              />
            </a>
          );
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-accent transition-colors hover:bg-bg-card-hover"
          >
            Attachment {i + 1}
          </a>
        );
      })}
    </div>
  );
}

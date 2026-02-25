"use client";

import { useState } from "react";

const THUMBNAILS_BASE =
  "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/maps/thumbnails";

export function getMapThumbnailUrls(layer: string): string[] {
  const cleaned = layer
    .replace(/^SEC_?\d*_?/, "")
    .replace(/\s+/g, "_");

  const m = cleaned.match(/^(.+_v)(\d+)$/);
  if (m) {
    const prefix = m[1];
    const num = m[2];
    const padded = num.padStart(2, "0");
    if (padded !== num) {
      return [
        `${THUMBNAILS_BASE}/${prefix}${num}.jpg`,
        `${THUMBNAILS_BASE}/${prefix}${padded}.jpg`,
      ];
    }
  }
  return [`${THUMBNAILS_BASE}/${cleaned}.jpg`];
}

interface MapImgProps {
  urls: string[];
  alt: string;
  className?: string;
}

export function MapImg({ urls, alt, className }: MapImgProps) {
  const [idx, setIdx] = useState(0);
  if (idx >= urls.length) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt}
      className={className}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

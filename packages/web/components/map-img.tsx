"use client";

import { useState } from "react";

interface MapImgProps {
  urls: string[];
  alt: string;
  className?: string;
}

/** Tries each URL in order until one loads (hybrid wiki / v2 / legacy sources). */
export function MapImg({ urls, alt, className }: MapImgProps) {
  const [idx, setIdx] = useState(0);
  if (!urls.length || idx >= urls.length) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt}
      className={className}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

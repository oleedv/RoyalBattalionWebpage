"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Downloads `text` as a text/plain artifact named `filename`. Used for the
 * staff-facing .txt exports (tickets, prospects, discord-bot prospects). */
export function DownloadButton({
  text,
  filename,
  label = "Download",
  className,
}: {
  text: string;
  filename: string;
  label?: string;
  className?: string;
}) {
  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDownload}
      className={className}
    >
      <Download className="size-3.5" />
      {label}
    </Button>
  );
}

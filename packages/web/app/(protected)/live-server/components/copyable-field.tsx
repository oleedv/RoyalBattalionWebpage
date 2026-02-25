"use client";

import { useState } from "react";

interface CopyableFieldProps {
  label: string;
  value: string;
}

export function CopyableField({ label, value }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);
  const truncated = value.length > 20 ? value.slice(0, 12) + "..." : value;

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-text-muted">{label}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent"
        title={value}
      >
        <code>{truncated}</code>
        <span className="text-[9px] text-text-muted">{copied ? "Copied!" : "Copy"}</span>
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { SquadJSPluginOptionValue } from "shared";

interface JsonEditorFieldProps {
  value: SquadJSPluginOptionValue;
  onChange: (parsed: SquadJSPluginOptionValue) => void;
  label?: string;
  description?: string | null;
  readOnly?: boolean;
  rows?: number;
  className?: string;
}

export function JsonEditorField({
  value,
  onChange,
  label,
  description,
  readOnly,
  rows,
  className,
}: JsonEditorFieldProps) {
  const [jsonText, setJsonText] = useState(JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  function handleJsonChange(text: string) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      onChange(parsed);
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  const computedRows =
    rows ?? Math.min(10, Math.max(3, jsonText.split("\n").length + 1));

  return (
    <div className={className}>
      {label && (
        <label className="mb-0.5 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
          {label}
        </label>
      )}
      {description && (
        <p className="mb-1.5 text-[11px] text-text-muted/70">{description}</p>
      )}
      <textarea
        value={jsonText}
        readOnly={readOnly}
        onChange={(e) => handleJsonChange(e.target.value)}
        rows={computedRows}
        className={`w-full rounded-sm border bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-primary focus:outline-none ${
          jsonError
            ? "border-danger focus:border-danger"
            : "border-border focus:border-accent"
        } ${readOnly ? "opacity-60" : ""}`}
      />
      {jsonError && <p className="mt-1 text-xs text-danger">{jsonError}</p>}
    </div>
  );
}

"use client";

import { JsonEditorField } from "@/components/json-editor-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { SquadJSPluginOptionValue } from "shared";

/**
 * Renders a single SquadJS plugin option value as the appropriate control:
 *  - object/array -> JsonEditorField (live-validated JSON textarea)
 *  - number       -> numeric Input
 *  - string/null  -> text Input
 *  - boolean      -> Switch
 */
export function PluginField({
  fieldKey,
  value,
  description,
  readOnly,
  onChange,
}: {
  fieldKey: string;
  value: SquadJSPluginOptionValue;
  description?: string | null;
  readOnly?: boolean;
  onChange: (value: SquadJSPluginOptionValue) => void;
}) {
  const isComplex = typeof value === "object" && value !== null;

  // Object / array: reuse the shared JSON editor composite (it renders its own
  // label + description).
  if (isComplex) {
    return (
      <JsonEditorField
        value={value}
        onChange={onChange}
        label={fieldKey}
        description={description}
        readOnly={readOnly}
      />
    );
  }

  return (
    <div>
      <label className="mb-0.5 block text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
        {fieldKey}
      </label>
      {description && (
        <p className="mb-1.5 text-[11px] text-text-muted/70">{description}</p>
      )}
      {typeof value === "boolean" ? (
        <Switch
          aria-label={fieldKey}
          checked={value}
          onCheckedChange={(checked) => onChange(checked)}
          disabled={readOnly}
        />
      ) : typeof value === "number" ? (
        <Input
          type="number"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(Number(e.target.value))}
          className="max-w-xs"
        />
      ) : (
        <Input
          type="text"
          value={value === null ? "" : String(value)}
          readOnly={readOnly}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value)
          }
          placeholder={value === null ? "null" : undefined}
        />
      )}
    </div>
  );
}

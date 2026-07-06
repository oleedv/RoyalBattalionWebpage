"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  onSearch,
  value,
  onChange,
  placeholder = "Search...",
  debounceMs = 250,
  className,
}: {
  /** Debounced callback, fires after debounceMs of typing inactivity. */
  onSearch?: (value: string) => void;
  /** Controlled value. When set, the parent owns the input state. */
  value?: string;
  /** Immediate per-keystroke callback for controlled usage. */
  onChange?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}) {
  const [internal, setInternal] = useState("");
  const isControlled = value !== undefined;
  const shown = isControlled ? value : internal;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onSearch);
  latest.current = onSearch;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function handleChange(next: string) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
    if (timer.current) clearTimeout(timer.current);
    if (latest.current) {
      timer.current = setTimeout(() => latest.current?.(next), debounceMs);
    }
  }

  function handleClear() {
    if (timer.current) clearTimeout(timer.current);
    if (!isControlled) setInternal("");
    onChange?.("");
    latest.current?.("");
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      <Input
        value={shown}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8"
      />
      {shown && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

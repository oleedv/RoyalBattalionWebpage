"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SquadCommand } from "shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface TerminalLine {
  id: number | string;
  command: string;
  output: string;
  success: boolean;
  error?: string;
}

/**
 * RCON terminal: mono scrollback, prompt input with up/down history + first-token
 * autocomplete (Command primitive), and a data-driven destructive-confirm via
 * AlertDialog. Presentational — data and side effects arrive via props.
 */
export function TerminalPane({
  lines,
  onSubmit,
  onClear,
  commands,
  isDestructive,
  status,
  actions,
  emptyHint = "Type a command and press Enter.",
  placeholder,
  className,
}: {
  lines: TerminalLine[];
  onSubmit: (command: string) => void;
  onClear: () => void;
  commands: SquadCommand[];
  isDestructive: (input: string) => boolean;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  emptyHint?: string;
  placeholder?: string;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showSuggest, setShowSuggest] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // happy-dom does not implement scrollTo; guard the optional call.
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const suggestions: SquadCommand[] = useMemo(() => {
    const first = input.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!first || input.includes(" ")) return [];
    return commands.filter((c) => c.name.toLowerCase().startsWith(first)).slice(0, 8);
  }, [input, commands]);

  function run(command: string) {
    onSubmit(command);
    setHistory((h) => [...h, command]);
    setHistIdx(-1);
    setInput("");
    setShowSuggest(false);
  }

  function submit(raw: string) {
    const command = raw.trim();
    if (!command) return;
    if (isDestructive(command)) {
      setPending(command);
      return;
    }
    run(command);
  }

  function acceptSuggestion(c: SquadCommand) {
    setInput(c.name + " ");
    setShowSuggest(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(history[next]);
      }
    } else if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      acceptSuggestion(suggestions[0]);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-sm border border-border bg-bg-secondary",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">{status}</div>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <EmptyState variant="hint" message={emptyHint} />
        ) : (
          lines.map((l) => (
            <div key={l.id} className="mb-2">
              <div className="text-accent">&gt; {l.command}</div>
              {l.success ? (
                <pre className="whitespace-pre-wrap break-words text-text-secondary">
                  {l.output || "(no output)"}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-danger">
                  {l.error || "Command failed"}
                </pre>
              )}
            </div>
          ))
        )}
      </div>

      <div className="relative border-t border-border p-2">
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1">
            <Command
              shouldFilter={false}
              className="max-h-56 overflow-y-auto border border-border bg-bg-tertiary"
            >
              <CommandList>
                <CommandGroup>
                  {suggestions.map((c) => (
                    <CommandItem
                      key={c.name}
                      value={c.name}
                      onSelect={() => acceptSuggestion(c)}
                      className="flex items-start justify-between gap-2 text-[11px]"
                    >
                      <span className="font-mono text-text-primary">
                        {c.name}{" "}
                        {c.args && <span className="text-text-muted">{c.args}</span>}
                        {c.destructive && <span className="ml-1 text-danger">&#9679;</span>}
                      </span>
                      <span className="ml-auto text-text-muted">{c.description}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggest(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          placeholder={placeholder}
          className="w-full rounded-sm border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
          autoFocus
          spellCheck={false}
        />
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run destructive command?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to run{" "}
              <span className="font-mono text-text-primary">{pending}</span>. This affects
              the live server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pending) run(pending);
                setPending(null);
              }}
            >
              Run command
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

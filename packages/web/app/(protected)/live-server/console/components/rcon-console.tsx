"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SQUAD_COMMANDS, isDestructiveCommand, type SquadCommand } from "shared";
import { useRconSocket, type RconLine } from "../../lib/use-rcon-socket";

export function RconConsole({ apiToken }: { apiToken: string | null }) {
  const { connected, lines, serverKeys, activeServer, switchServer, send, runListDisconnected, clear } =
    useRconSocket(apiToken);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const [showSuggest, setShowSuggest] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const suggestions: SquadCommand[] = useMemo(() => {
    const first = input.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!first || input.includes(" ")) return [];
    return SQUAD_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(first)).slice(0, 8);
  }, [input]);

  function submit(raw: string) {
    const command = raw.trim();
    if (!command) return;
    if (isDestructiveCommand(command)) {
      const ok = window.confirm(`This is a destructive command:\n\n${command}\n\nRun it?`);
      if (!ok) return;
    }
    send(command);
    setHistory((h) => [...h, command]);
    setHistIdx(-1);
    setInput("");
    setShowSuggest(false);
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
      setInput(suggestions[0].name + " ");
      setShowSuggest(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-sm border border-border bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-danger"}`} />
          <span className="text-text-muted">
            {connected ? "Connected" : "Disconnected"}
            {activeServer ? ` · ${activeServer}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {serverKeys.length > 1 && (
            <select
              value={activeServer}
              onChange={(e) => switchServer(e.target.value)}
              className="rounded-sm border border-border bg-bg-primary px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent"
            >
              {serverKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={runListDisconnected}
            className="rounded-sm border border-accent/20 px-2 py-1 text-[11px] text-accent hover:bg-accent/10"
          >
            List Disconnected
          </button>
          <button
            onClick={clear}
            className="rounded-sm border border-border px-2 py-1 text-[11px] text-text-muted hover:bg-bg-tertiary"
          >
            Clear
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 && (
          <div className="text-text-muted">
            Type an RCON command and press Enter. Use the up and down arrows for history, Tab to autocomplete.
          </div>
        )}
        {lines.map((l: RconLine) => (
          <div key={l.id} className="mb-2">
            <div className="text-accent">&gt; {l.command}</div>
            {l.success ? (
              <pre className="whitespace-pre-wrap break-words text-text-secondary">{l.output || "(no output)"}</pre>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-danger">{l.error || "Command failed"}</pre>
            )}
          </div>
        ))}
      </div>

      <div className="relative border-t border-border p-2">
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 max-h-56 overflow-y-auto rounded-sm border border-border bg-bg-tertiary">
            {suggestions.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  setInput(c.name + " ");
                  setShowSuggest(false);
                }}
                className="flex w-full items-start justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-bg-secondary"
              >
                <span className="font-mono text-text-primary">
                  {c.name} {c.args && <span className="text-text-muted">{c.args}</span>}
                  {c.destructive && <span className="ml-1 text-danger">&#9679;</span>}
                </span>
                <span className="text-text-muted">{c.description}</span>
              </button>
            ))}
          </div>
        )}
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggest(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          placeholder="AdminBroadcast Hello world"
          className="w-full rounded-sm border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
          autoFocus
          spellCheck={false}
        />
      </div>
    </div>
  );
}

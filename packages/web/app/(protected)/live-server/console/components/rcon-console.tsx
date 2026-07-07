"use client";

import { SQUAD_COMMANDS, isDestructiveCommand } from "shared";
import { Button } from "@/components/ui/button";
import { TerminalPane } from "@/components/terminal-pane";
import { ConnectionStatus, ServerScope } from "@/components/connection-status";
import { useRconSocket } from "../../lib/use-rcon-socket";

export function RconConsole({ apiToken }: { apiToken: string | null }) {
  const {
    connected,
    lines,
    serverKeys,
    activeServer,
    switchServer,
    send,
    runListDisconnected,
    clear,
  } = useRconSocket(apiToken);

  return (
    <TerminalPane
      lines={lines}
      onSubmit={send}
      onClear={clear}
      commands={SQUAD_COMMANDS}
      isDestructive={isDestructiveCommand}
      className="h-[70vh]"
      placeholder="AdminBroadcast Hello world"
      emptyHint="Type an RCON command and press Enter. Up/Down for history, Tab to autocomplete."
      status={
        <>
          <ConnectionStatus
            tone={connected ? "success" : "danger"}
            label={
              connected
                ? `Connected${activeServer ? ` · ${activeServer}` : ""}`
                : "Disconnected"
            }
          />
          <ServerScope
            servers={serverKeys}
            active={activeServer}
            onSwitch={switchServer}
            variant="select"
          />
        </>
      }
      actions={
        <Button variant="outline" size="sm" onClick={runListDisconnected}>
          List Disconnected
        </Button>
      }
    />
  );
}

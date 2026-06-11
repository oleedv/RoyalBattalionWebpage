"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WSMessage } from "./types";

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/^http/, "ws");

export interface RconLine {
  id: number;
  command: string;
  output: string;
  success: boolean;
  error?: string;
  time: string;
}

export function useRconSocket(apiToken: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<RconLine[]>([]);
  const [serverKeys, setServerKeys] = useState<string[]>([]);
  const [activeServer, setActiveServer] = useState<string>("");
  const activeServerRef = useRef(activeServer);
  activeServerRef.current = activeServer;

  useEffect(() => {
    if (!apiToken) return;
    let closed = false;

    function connect() {
      const ws = new WebSocket(`${WS_BASE}/live-server/ws`, [`auth-${apiToken}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Re-subscribe to the previously active server on reconnect.
        const current = activeServerRef.current;
        if (current) {
          ws.send(JSON.stringify({ action: "switch_server", server: current }));
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) reconnectRef.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onmessage = (ev) => {
        let msg: WSMessage;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as WSMessage;
        } catch {
          return;
        }
        if (msg.type === "servers") {
          setServerKeys(msg.data);
          // Pick a default server the same way the monitor does:
          // stored preference, else the first available server.
          setActiveServer((current) => {
            if (current && msg.data.includes(current)) {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ action: "switch_server", server: current }));
              }
              return current;
            }
            const stored = typeof window !== "undefined" ? localStorage.getItem("rb-default-server") : null;
            const initial = stored && msg.data.includes(stored) ? stored : msg.data[0];
            if (initial && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ action: "switch_server", server: initial }));
            }
            return initial ?? "";
          });
        } else if (msg.type === "rcon_response") {
          setLines((prev) => [
            ...prev,
            {
              id: idRef.current++,
              command: msg.command,
              output: msg.output,
              success: msg.success,
              error: msg.error,
              time: new Date().toISOString(),
            },
          ]);
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }
    };
  }, [apiToken]);

  const switchServer = useCallback((key: string) => {
    setActiveServer(key);
    setLines([]);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "switch_server", server: key }));
    }
  }, []);

  const send = useCallback((command: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "rcon_console", command }));
    }
  }, []);

  const runListDisconnected = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "listdisconnected" }));
    }
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { connected, lines, serverKeys, activeServer, switchServer, send, runListDisconnected, clear };
}

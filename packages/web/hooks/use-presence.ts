"use client";

import { useEffect, useRef, useState } from "react";
import { getHidePresence, HIDE_PRESENCE_EVENT } from "@/lib/hide-presence";

export type PresenceUser = {
  userId: string;
  userName: string;
  displayName: string | null;
  avatarUrl: string | null;
  currentPage: string;
};

export function formatPageName(path: string): string {
  const name = path.replace(/^\//, "") || "dashboard";
  return name
    .split(/[-/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Presence roster over the /presence/ws WebSocket. Connects once when the
 * first token arrives (token re-read from a ref on reconnect), reconnects
 * after 5s on close, and pushes the current page on route changes. */
export function usePresence(
  apiToken: string | null,
  pathname: string,
): PresenceUser[] {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const presenceWsRef = useRef<WebSocket | null>(null);
  const apiTokenRef = useRef(apiToken);
  apiTokenRef.current = apiToken;
  const hasConnectedPresence = useRef(false);

  useEffect(() => {
    if (!apiToken || hasConnectedPresence.current) return;
    hasConnectedPresence.current = true;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;
      const token = apiTokenRef.current;
      if (!token) return;
      const wsBase = (
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      ).replace(/^http/, "ws");
      const hidden = getHidePresence() ? "&hidden=1" : "";
      const ws = new WebSocket(
        `${wsBase}/presence/ws?page=${encodeURIComponent(pathname)}${hidden}`,
        [`auth-${token}`],
      );
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "presence") {
            setOnlineUsers(msg.users);
          }
        } catch {}
      };
      ws.onclose = () => {
        presenceWsRef.current = null;
        if (!cancelled) reconnectTimer = setTimeout(connect, 5000);
      };
      presenceWsRef.current = ws;
    }

    connect();
    return () => {
      cancelled = true;
      hasConnectedPresence.current = false;
      clearTimeout(reconnectTimer);
      const ws = presenceWsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
        presenceWsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiToken]);

  useEffect(() => {
    const ws = presenceWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ page: pathname }));
    }
  }, [pathname]);

  useEffect(() => {
    function sendHidden(hidden: boolean) {
      const ws = presenceWsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ hidden }));
      }
    }

    function onChange(e: Event) {
      const hidden = e instanceof CustomEvent ? Boolean(e.detail) : getHidePresence();
      sendHidden(hidden);
    }

    window.addEventListener(HIDE_PRESENCE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(HIDE_PRESENCE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return onlineUsers;
}

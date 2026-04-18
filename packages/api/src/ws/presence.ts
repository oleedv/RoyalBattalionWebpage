import { logger } from "../lib/logger";
import type { ServerWebSocket } from "bun";
import type { WSData } from "./types";

export const presenceClients = new Set<ServerWebSocket<WSData>>();

function broadcastPresence() {
  const users = Array.from(presenceClients).map((ws) => ({
    userId: ws.data.userId,
    userName: ws.data.userName,
    avatarUrl: ws.data.avatarUrl,
    currentPage: ws.data.currentPage,
  }));
  // Deduplicate by userId (keep latest)
  const seen = new Map<string, typeof users[0]>();
  for (const u of users) seen.set(u.userId, u);
  const payload = JSON.stringify({ type: "presence", users: Array.from(seen.values()) });
  for (const ws of presenceClients) {
    try { ws.send(payload); } catch (err) {
      logger.debug("presence", "Failed to send presence payload", { userId: ws.data.userId, err });
    }
  }
}

export function handlePresenceOpen(ws: ServerWebSocket<WSData>) {
  presenceClients.add(ws);
  logger.info("presence", `Connected (${presenceClients.size} clients)`);
  broadcastPresence();
}

export function handlePresenceMessage(ws: ServerWebSocket<WSData>, message: string | Buffer) {
  try {
    const text = typeof message === "string" ? message : message.toString();
    const msg = JSON.parse(text) as { page?: string };
    if (msg.page) {
      ws.data.currentPage = msg.page;
      broadcastPresence();
    }
  } catch (err) {
    logger.warn("presence", "Failed to parse presence message", { userId: ws.data.userId, err });
  }
}

export function handlePresenceClose(ws: ServerWebSocket<WSData>) {
  presenceClients.delete(ws);
  logger.info("presence", `Disconnected (${presenceClients.size} clients)`);
  broadcastPresence();
}

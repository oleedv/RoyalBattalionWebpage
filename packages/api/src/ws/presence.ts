import { logger } from "../lib/logger";
import type { ServerWebSocket } from "bun";
import type { WSData } from "./types";

export const presenceClients = new Set<ServerWebSocket<WSData>>();

/** Only developers can hide. Returns the resulting hidden state. */
export function setHidePresence(
  data: Pick<WSData, "permissions" | "hidePresence">,
  hidden: unknown,
): boolean {
  data.hidePresence = hidden === true && data.permissions.includes("developer");
  return data.hidePresence;
}

export function visiblePresenceUsers(
  clients: Iterable<{ data: WSData }>,
  viewer?: Pick<WSData, "permissions">,
): Array<{
  userId: string;
  userName: string;
  displayName: string | null;
  avatarUrl: string | null;
  currentPage: string;
}> {
  const includeHidden = viewer?.permissions.includes("developer") === true;
  const users = Array.from(clients)
    .filter((ws) => includeHidden || !ws.data.hidePresence)
    .map((ws) => ({
      userId: ws.data.userId,
      userName: ws.data.userName,
      displayName: ws.data.displayName,
      avatarUrl: ws.data.avatarUrl,
      currentPage: ws.data.currentPage,
    }));
  const seen = new Map<string, (typeof users)[0]>();
  for (const u of users) seen.set(u.userId, u);
  return Array.from(seen.values());
}

function broadcastPresence() {
  for (const ws of presenceClients) {
    const payload = JSON.stringify({
      type: "presence",
      users: visiblePresenceUsers(presenceClients, ws.data),
    });
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
    const msg = JSON.parse(text) as { page?: string; hidden?: boolean };
    let changed = false;
    if (typeof msg.page === "string" && msg.page) {
      ws.data.currentPage = msg.page;
      changed = true;
    }
    if (typeof msg.hidden === "boolean") {
      setHidePresence(ws.data, msg.hidden);
      changed = true;
    }
    if (changed) broadcastPresence();
  } catch (err) {
    logger.warn("presence", "Failed to parse presence message", { userId: ws.data.userId, err });
  }
}

export function handlePresenceClose(ws: ServerWebSocket<WSData>) {
  presenceClients.delete(ws);
  logger.info("presence", `Disconnected (${presenceClients.size} clients)`);
  broadcastPresence();
}

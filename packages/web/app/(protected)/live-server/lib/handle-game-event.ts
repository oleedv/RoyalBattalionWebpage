import type { Player, ServerInfo, ChatMessage, ConsoleEntry } from "./types";

export type GameEventAction =
  | { type: "setPlayers"; players: Player[] }
  | { type: "setServerInfo"; updater: (prev: ServerInfo | null) => ServerInfo | null }
  | { type: "setSquadjsConnected"; connected: boolean }
  | { type: "appendChat"; message: ChatMessage }
  | { type: "setTickRate"; tickRate: number }
  | { type: "appendConsole"; entry: Omit<ConsoleEntry, "time"> }
  | { type: "requestClanRefresh" };

export function handleGameEvent(event: string, data: unknown): GameEventAction[] {
  const actions: GameEventAction[] = [];

  function addConsole(type: ConsoleEntry["type"], message: string) {
    actions.push({ type: "appendConsole", entry: { type, message } });
  }

  switch (event) {
    case "UPDATED_PLAYER_INFORMATION":
    case "SNAPSHOT_PLAYERS":
      if (Array.isArray(data)) {
        actions.push({ type: "setPlayers", players: data });
        actions.push({ type: "requestClanRefresh" });
      }
      break;
    case "SNAPSHOT_SERVER_INFO":
      if (data) actions.push({ type: "setServerInfo", updater: () => data as ServerInfo });
      break;
    case "CONNECTION_STATUS":
      if (data && typeof data === "object" && "connected" in data) {
        actions.push({ type: "setSquadjsConnected", connected: (data as { connected: boolean }).connected });
      }
      break;
    case "UPDATED_A2S_INFORMATION":
      if (data && typeof data === "object") {
        const a2s = data as Record<string, unknown>;
        actions.push({
          type: "setServerInfo",
          updater: (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              playerCount: (a2s.a2sPlayerCount as number) ?? prev.playerCount,
              currentLayer: (a2s.currentLayer as ServerInfo["currentLayer"]) ?? prev.currentLayer,
              ...(a2s.nextLayer !== undefined ? { nextLayer: a2s.nextLayer as ServerInfo["nextLayer"] } : {}),
              ...(typeof a2s.publicQueue === "number" ? { publicQueue: a2s.publicQueue } : {}),
              ...(typeof a2s.reserveQueue === "number" ? { reserveQueue: a2s.reserveQueue } : {}),
            };
          },
        });
      }
      break;
    case "CHAT_MESSAGE":
      if (data && typeof data === "object") {
        actions.push({ type: "appendChat", message: data as ChatMessage });
      }
      break;
    case "TICK_RATE":
      if (typeof data === "number") {
        actions.push({ type: "setTickRate", tickRate: data });
      } else if (data && typeof data === "object" && "tickRate" in data) {
        actions.push({ type: "setTickRate", tickRate: (data as { tickRate: number }).tickRate });
      }
      break;
    case "NEW_GAME": {
      const layer = (data as { layerClassname?: string })?.layerClassname || "Unknown";
      const divider: ChatMessage = { chat: "__DIVIDER__", steamID: "", eosID: "", name: "", message: layer, time: new Date().toISOString() };
      actions.push({ type: "appendChat", message: divider });
      addConsole("newgame", `New game started${layer !== "Unknown" ? `: ${layer}` : ""}`);
      break;
    }
    case "PLAYER_CONNECTED": {
      const pc = data as { player?: { name?: string } };
      if (pc?.player?.name) addConsole("connect", `${pc.player.name} connected`);
      break;
    }
    case "PLAYER_DISCONNECTED": {
      const pd = data as { player?: { name?: string } };
      if (pd?.player?.name) addConsole("disconnect", `${pd.player.name} disconnected`);
      break;
    }
    case "PLAYER_WARNED": {
      const pw = data as { player?: { name?: string }; reason?: string };
      addConsole("warn", `${pw?.player?.name || "Unknown"} warned: ${pw?.reason || "No reason"}`);
      break;
    }
    case "PLAYER_KICKED": {
      const pk = data as { player?: { name?: string }; reason?: string };
      addConsole("kick", `${pk?.player?.name || "Unknown"} kicked: ${pk?.reason || "No reason"}`);
      break;
    }
    case "PLAYER_BANNED": {
      const pb = data as { player?: { name?: string }; reason?: string };
      addConsole("ban", `${pb?.player?.name || "Unknown"} banned: ${pb?.reason || "No reason"}`);
      break;
    }
    case "ADMIN_BROADCAST": {
      const ab = data as { message?: string };
      if (ab?.message) addConsole("broadcast", `Broadcast: ${ab.message}`);
      break;
    }
    case "TEAMKILL": {
      const tk = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
      addConsole("teamkill", `${tk?.attacker?.name || "Unknown"} teamkilled ${tk?.victim?.name || "Unknown"}${tk?.weapon ? ` (${tk.weapon})` : ""}`);
      break;
    }
    case "PLAYER_WOUNDED": {
      const pw2 = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
      if (pw2?.attacker?.name && pw2?.victim?.name) {
        addConsole("wound", `${pw2.attacker.name} wounded ${pw2.victim.name}${pw2.weapon ? ` (${pw2.weapon})` : ""}`);
      }
      break;
    }
    case "PLAYER_DIED": {
      const pd2 = data as { attacker?: { name?: string }; victim?: { name?: string }; weapon?: string };
      if (pd2?.attacker?.name && pd2?.victim?.name) {
        addConsole("kill", `${pd2.attacker.name} killed ${pd2.victim.name}${pd2.weapon ? ` (${pd2.weapon})` : ""}`);
      }
      break;
    }
    case "PLAYER_REVIVED": {
      const pr = data as { reviver?: { name?: string }; victim?: { name?: string } };
      if (pr?.reviver?.name && pr?.victim?.name) {
        addConsole("revive", `${pr.reviver.name} revived ${pr.victim.name}`);
      }
      break;
    }
    case "SQUAD_CREATED": {
      const sc = data as { player?: { name?: string }; squad?: { squadName?: string } };
      if (sc?.squad?.squadName) {
        addConsole("squad", `Squad "${sc.squad.squadName}" created${sc.player?.name ? ` by ${sc.player.name}` : ""}`);
      }
      break;
    }
    case "POSSESSED_ADMIN_CAMERA": {
      const pac = data as { player?: { name?: string } };
      if (pac?.player?.name) addConsole("admincam", `${pac.player.name} entered admin cam`);
      break;
    }
    case "UNPOSSESSED_ADMIN_CAMERA": {
      const uac = data as { player?: { name?: string } };
      if (uac?.player?.name) addConsole("admincam", `${uac.player.name} left admin cam`);
      break;
    }
    case "RCON_ERROR": {
      const re = data as { error?: string; message?: string };
      addConsole("rconerror", `RCON error: ${re?.error || re?.message || "Unknown error"}`);
      break;
    }
    case "PLAYER_TEAM_CHANGE": {
      const ptc = data as { player?: { name?: string }; newTeamID?: string };
      if (ptc?.player?.name) addConsole("teamchange", `${ptc.player.name} switched to Team ${ptc.newTeamID || "?"}`);
      break;
    }
    case "PLAYER_SQUAD_CHANGE": {
      const psc = data as { player?: { name?: string }; newSquad?: { squadName?: string }; newSquadID?: string };
      if (psc?.player?.name) {
        const squadName = psc.newSquad?.squadName || (psc.newSquadID ? `Squad ${psc.newSquadID}` : "Unassigned");
        addConsole("squadchange", `${psc.player.name} moved to ${squadName}`);
      }
      break;
    }
    case "UPDATED_LAYER_INFORMATION": {
      if (data && typeof data === "object") {
        const li = data as Record<string, unknown>;
        actions.push({
          type: "setServerInfo",
          updater: (prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (li.currentLayer != null) {
              updated.currentLayer = li.currentLayer as ServerInfo["currentLayer"];
            }
            if (li.nextLayer !== undefined) {
              updated.nextLayer = li.nextLayer as ServerInfo["nextLayer"];
            }
            return updated;
          },
        });
      }
      break;
    }
    case "PLAYER_AUTO_KICKED": {
      const pak = data as { player?: { name?: string }; reason?: string };
      addConsole("autokick", `${pak?.player?.name || "Unknown"} auto-kicked: ${pak?.reason || "Unassigned"}`);
      break;
    }
    case "ROUND_ENDED": {
      const rnd = data as { winner?: string; loser?: string; message?: string };
      const msg = rnd?.message || (rnd?.winner ? `Winner: ${rnd.winner}` : "Round ended");
      addConsole("roundend", msg);
      const divider: ChatMessage = { chat: "__DIVIDER__", steamID: "", eosID: "", name: "", message: msg, time: new Date().toISOString() };
      actions.push({ type: "appendChat", message: divider });
      break;
    }
  }

  return actions;
}

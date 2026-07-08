type Tone = "success" | "warning" | "danger" | "accent" | "neutral";

export function formatAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_TONES: Record<string, Tone> = {
  whitelist: "success",
  member: "success",
  role: "accent",
  discord_bot: "accent",
  match: "accent",
  admin_group: "warning",
  clan: "warning",
  squadjs: "warning",
  server_config: "danger",
  rcon: "danger",
};

export function actionTone(action: string): Tone {
  return ACTION_TONES[action.split(".")[0]] ?? "neutral";
}

export function formatDetailSummary(action: string, detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const name = detail.playerName as string | undefined;
  const names = detail.playerNames as string[] | undefined;
  switch (action) {
    case "rcon.warn":
      return name ? `Warned ${name}${detail.message ? ` -- "${detail.message}"` : ""}` : null;
    case "rcon.kick":
      return name ? `Kicked ${name}${detail.reason ? ` -- ${detail.reason}` : ""}` : null;
    case "rcon.switchteam":
      return name ? `Moved ${name} to other team` : null;
    case "rcon.switchsquad":
      return names?.length
        ? `Moved ${detail.count} players (${names.join(", ")})`
        : detail.count
          ? `Moved ${detail.count} players`
          : null;
    case "rcon.switchclan":
      return `Moved ${detail.count || 0} clan members${detail.clanTag ? ` [${detail.clanTag}]` : ""}${names?.length ? ` (${names.join(", ")})` : ""} to Team ${detail.targetTeam || "?"}`;
    case "rcon.demotecommander":
      return name ? `Demoted ${name}` : null;
    case "rcon.broadcast":
      return detail.message ? `"${detail.message}"` : null;
    case "rcon.disband":
      return `Disbanded squad ${detail.squadID || "?"} on team ${detail.teamID || "?"}`;
    case "rcon.setnextlayer":
      return detail.layer ? `Set next layer: ${detail.layer}` : null;
    case "rcon.endmatch":
      return "Ended current match";
    case "whitelist.add":
      return detail.name ? `Added ${detail.name}${detail.server ? ` on ${detail.server}` : ""}` : null;
    case "whitelist.delete":
      return detail.name ? `Removed ${detail.name}` : null;
    default:
      return null;
  }
}

export function toAuditDetail(detail: Record<string, unknown> | null): {
  fields: { label: string; value: string }[];
  raw: unknown;
} {
  if (!detail) return { fields: [], raw: detail };
  const fields = Object.entries(detail).map(([label, value]) => ({
    label,
    value: typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? ""),
  }));
  return { fields, raw: detail };
}

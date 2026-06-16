export interface SquadCommand {
  name: string;
  args?: string;
  description: string;
  destructive?: boolean;
}

// Source: Squad Wiki (Server_Administration), holy.gg console reference, Nitrado.
export const SQUAD_COMMANDS: SquadCommand[] = [
  // Info / read-only
  { name: "ListPlayers", description: "List all connected players with IDs, team and squad." },
  { name: "ListSquads", description: "List all squads per team with sizes and creators." },
  { name: "ShowNextMap", description: "Show the next level and layer in rotation." },
  { name: "ShowCurrentMap", description: "Show the current level and layer." },
  { name: "AdminListDisconnectedPlayers", description: "List recently disconnected players with their IDs." },
  // Messaging
  { name: "AdminBroadcast", args: "<Message>", description: "Broadcast a system message to all players." },
  { name: "ChatToAdmin", args: "<Message>", description: "Send a message visible to admins only." },
  // Player moderation
  { name: "AdminWarn", args: "<NameOrId> <Reason>", description: "Warn a player by name or online ID." },
  { name: "AdminWarnById", args: "<PlayerId> <Reason>", description: "Warn a player by in-game player ID." },
  { name: "AdminKick", args: "<NameOrId> <Reason>", description: "Kick a player by name or online ID.", destructive: true },
  { name: "AdminKickById", args: "<PlayerId> <Reason>", description: "Kick a player by in-game player ID.", destructive: true },
  { name: "AdminBan", args: "<NameOrId> <Length> <Reason>", description: "Ban a player. Length: 0=perm, 1m/1d/1M.", destructive: true },
  { name: "AdminBanById", args: "<PlayerId> <Length> <Reason>", description: "Ban a player by in-game player ID.", destructive: true },
  // Teams / squads / roles
  { name: "AdminForceTeamChange", args: "<NameOrId>", description: "Force a player to switch teams.", destructive: true },
  { name: "AdminForceTeamChangeById", args: "<PlayerId>", description: "Force a player to switch teams by player ID.", destructive: true },
  { name: "AdminDisbandSquad", args: "<TeamNumber 1|2> <SquadIndex>", description: "Disband a squad on a team.", destructive: true },
  { name: "AdminRemovePlayerFromSquad", args: "<PlayerName>", description: "Remove a player from their squad.", destructive: true },
  { name: "AdminRemovePlayerFromSquadById", args: "<PlayerId>", description: "Remove a player from their squad by ID.", destructive: true },
  { name: "AdminDemoteCommander", args: "<PlayerName>", description: "Remove commander status from a player.", destructive: true },
  { name: "AdminDemoteCommanderById", args: "<PlayerId>", description: "Remove commander status by player ID.", destructive: true },
  // Match control
  { name: "AdminEndMatch", description: "End the current match immediately.", destructive: true },
  { name: "AdminRestartMatch", description: "Restart the current match.", destructive: true },
  { name: "AdminPauseMatch", description: "Pause the current match.", destructive: true },
  { name: "AdminUnpauseMatch", description: "Resume a paused match." },
  { name: "AdminChangeLayer", args: "<LayerName>", description: "Change the active layer immediately.", destructive: true },
  { name: "AdminSetNextLayer", args: "<LayerName>", description: "Queue the next layer to load." },
  // Server config
  { name: "AdminSetMaxNumPlayers", args: "<NumPlayers>", description: "Change the player cap.", destructive: true },
  { name: "AdminSetServerPassword", args: "<Password>", description: "Set (or clear) the server password.", destructive: true },
  { name: "AdminSetPublicQueueLimit", args: "<Value>", description: "Cap the public queue size." },
  { name: "AdminSlomo", args: "<TimeDilation>", description: "Change server clock speed (1 = normal).", destructive: true },
  // Gameplay / deployables
  { name: "AdminForceAllRoleAvailability", args: "<0|1>", description: "Ignore kit/role restrictions when enabled." },
  { name: "AdminForceAllDeployableAvailability", args: "<0|1>", description: "Bypass deployable placement rules." },
  { name: "AdminDisableVehicleClaiming", args: "<0|1>", description: "Prevent vehicle claiming." },
  { name: "AdminCreateVehicle", args: "<VehicleLink>", description: "Spawn a vehicle.", destructive: true },
  { name: "AdminNoRespawnTimer", args: "<0|1>", description: "Disable the respawn timer (layer setting)." },
  { name: "AdminNoTeamChangeTimer", args: "<0|1>", description: "Disable the team-change timer (layer setting)." },
  // Diagnostics
  { name: "AdminNetTestStart", description: "Start a network test (writes to client logs)." },
  { name: "AdminNetTestStop", description: "Stop the network test." },
  { name: "AdminProfileServer", args: "<Seconds> <0|1>", description: "Profile the server for N seconds." },
];

/** Lowercased command-name set for fast destructive lookup. */
const DESTRUCTIVE = new Set(
  SQUAD_COMMANDS.filter((c) => c.destructive).map((c) => c.name.toLowerCase())
);

/** True if the first token of `input` matches a known destructive command. */
export function isDestructiveCommand(input: string): boolean {
  const first = input.trim().split(/\s+/)[0]?.toLowerCase();
  return first ? DESTRUCTIVE.has(first) : false;
}

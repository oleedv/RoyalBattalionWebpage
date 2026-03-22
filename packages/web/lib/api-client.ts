import type {
  ApiResponse,
  AuthSyncResponse,
  AuthMeResponse,
  WhitelistEntry,
  WhitelistEntryWithComments,
  WhitelistComment,
  WhitelistCandidate,
  AdminGroup,
  Clan,
  ServerConfig,
  UserWithRoles,
  UserWithRolesAndComments,
  MemberComment,
  Ticket,
  Prospect,
  LegacyTicket,
  DiscordRole,
  Permission,
  Match,
  SquadJSPlugin,
  DiscordBotOverview,
  SeedingConfig,
  SeedingSession,
  SeedingRapport,
  BotMessage,
  BotLog,
  BotStatus,
  AuditLogEntry,
  Paginated,
  TicketTimeout,
  PlaytimeStats,
} from "shared";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const data: ApiResponse<T> = await res.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    };
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function createCrudClient<T>(basePath: string) {
  return {
    getAll(token: string, query?: string) {
      const qs = query ? `?${query}` : "";
      return request<T[]>(`${basePath}${qs}`, { headers: authHeaders(token) });
    },
    getOne(token: string, id: string) {
      return request<T>(`${basePath}/${id}`, { headers: authHeaders(token) });
    },
    create(token: string, data: Record<string, unknown>) {
      return request<T>(basePath, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(data),
      });
    },
    update(token: string, id: string, data: Record<string, unknown>) {
      return request<T>(`${basePath}/${id}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(data),
      });
    },
    remove(token: string, id: string) {
      return request<{ deleted: true }>(`${basePath}/${id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
    },
  };
}

// Auth
export function syncAuth(
  accessToken: string
): Promise<ApiResponse<AuthSyncResponse>> {
  return request<AuthSyncResponse>("/auth/sync", {
    method: "POST",
    body: JSON.stringify({ accessToken }),
  });
}

export function getMe(token: string): Promise<ApiResponse<AuthMeResponse>> {
  return request<AuthMeResponse>("/auth/me", {
    headers: authHeaders(token),
  });
}

// Whitelist
const whitelistClient = createCrudClient<WhitelistEntry>("/whitelist");
export const getWhitelist = (token: string, server?: string) =>
  whitelistClient.getAll(token, server ? `server=${encodeURIComponent(server)}` : undefined);
export const addWhitelistEntry = (
  token: string,
  steamId: string,
  opts?: { name?: string; clan?: string; clanId?: string; role?: string; groupId?: string; reason?: string; expiresAt?: string; server?: string }
) => whitelistClient.create(token, { steamId, ...opts });
export const updateWhitelistEntry = (
  token: string,
  id: string,
  data: { steamId?: string; name?: string; clan?: string; clanId?: string | null; role?: string; groupId?: string | null; reason?: string; expiresAt?: string | null }
) => whitelistClient.update(token, id, data as Record<string, unknown>);
export const deleteWhitelistEntry = whitelistClient.remove;

export function bulkAddWhitelist(
  token: string,
  entries: { steamId: string; name?: string; clanId?: string; clan?: string; role?: string; groupId?: string; reason?: string }[],
  server?: string
): Promise<ApiResponse<{ created: number; skipped: number }>> {
  return request<{ created: number; skipped: number }>("/whitelist/bulk", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ entries, server: server || "main" }),
  });
}

export function getWhitelistCandidates(
  token: string,
  server?: string
): Promise<ApiResponse<WhitelistCandidate[]>> {
  const qs = server ? `?server=${encodeURIComponent(server)}` : "";
  return request<WhitelistCandidate[]>(`/whitelist/candidates${qs}`, {
    headers: authHeaders(token),
  });
}

export function getWhitelistEntry(
  token: string,
  id: string,
): Promise<ApiResponse<WhitelistEntryWithComments>> {
  return request<WhitelistEntryWithComments>(`/whitelist/${id}`, {
    headers: authHeaders(token),
  });
}

export function addWhitelistComment(
  token: string,
  entryId: string,
  text: string,
): Promise<ApiResponse<WhitelistComment>> {
  return request<WhitelistComment>(`/whitelist/${entryId}/comments`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ text }),
  });
}

export function deleteWhitelistComment(
  token: string,
  entryId: string,
  commentId: string,
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/whitelist/${entryId}/comments/${commentId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function bulkUpdateWhitelist(
  token: string,
  ids: string[],
  data: { clanId?: string | null; groupId?: string | null; expiresAt?: string | null },
): Promise<ApiResponse<{ updated: number }>> {
  return request<{ updated: number }>("/whitelist/bulk-update", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ids, data }),
  });
}

export function bulkDeleteWhitelist(
  token: string,
  ids: string[],
): Promise<ApiResponse<{ deleted: number }>> {
  return request<{ deleted: number }>("/whitelist/bulk-delete", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ids }),
  });
}

// Admin Groups
const adminGroupsClient = createCrudClient<AdminGroup>("/admin-groups");
export const getAdminGroups = adminGroupsClient.getAll;
export const createAdminGroup = (token: string, data: { name: string; permissions: string; sortOrder?: number }) => adminGroupsClient.create(token, data);
export const updateAdminGroup = (token: string, id: string, data: { name?: string; permissions?: string; sortOrder?: number }) => adminGroupsClient.update(token, id, data);
export const deleteAdminGroup = adminGroupsClient.remove;

// Clans
const clansClient = createCrudClient<Clan>("/clans");
export const getClans = clansClient.getAll;
export const createClan = (token: string, data: { name: string; tag: string }) => clansClient.create(token, data);
export const updateClan = (token: string, id: string, data: { name?: string; tag?: string }) => clansClient.update(token, id, data);
export const deleteClan = clansClient.remove;

export function updateRoleWhitelistGrant(
  token: string,
  id: string,
  grantsWhitelist: boolean
): Promise<ApiResponse<{ updated: true }>> {
  return request<{ updated: true }>(`/roles/${id}/whitelist-grant`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ grantsWhitelist }),
  });
}

export function updateRoleMemberRole(
  token: string,
  id: string,
  isMemberRole: boolean,
): Promise<ApiResponse<{ updated: true }>> {
  return request<{ updated: true }>(`/roles/${id}/member-role`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ isMemberRole }),
  });
}

// Users
const usersClient = createCrudClient<UserWithRolesAndComments>("/users");
export const getUsers = usersClient.getAll;
export const updateUser = (
  token: string,
  id: string,
  data: {
    steamId?: string;
    eosId?: string;
    country?: string;
    membershipDate?: string | null;
    dateOfBirth?: string | null;
  },
) => usersClient.update(token, id, data as Record<string, unknown>);
export const deleteUser = usersClient.remove;

// Member Comments
export function addMemberComment(
  token: string,
  userId: string,
  text: string,
): Promise<ApiResponse<MemberComment>> {
  return request<MemberComment>(`/users/${userId}/comments`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ text }),
  });
}

export function deleteMemberComment(
  token: string,
  userId: string,
  commentId: string,
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/users/${userId}/comments/${commentId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function syncUserRoles(
  token: string
): Promise<ApiResponse<{ updated: number; created: number }>> {
  return request<{ updated: number; created: number }>("/users/sync-roles", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function bulkUpdateMembers(
  token: string,
  ids: string[],
  data: { country?: string; membershipDate?: string | null },
): Promise<ApiResponse<{ updated: number }>> {
  return request<{ updated: number }>("/users/bulk-update", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ids, data }),
  });
}

export function bulkDeleteMembers(
  token: string,
  ids: string[],
): Promise<ApiResponse<{ deleted: number }>> {
  return request<{ deleted: number }>("/users/bulk-delete", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ids }),
  });
}

export function bulkCommentMembers(
  token: string,
  ids: string[],
  text: string,
): Promise<ApiResponse<{ commented: number }>> {
  return request<{ commented: number }>("/users/bulk-comment", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ids, text }),
  });
}

export function resolveDiscordNames(
  token: string,
  discordIds: string[]
): Promise<ApiResponse<Record<string, string>>> {
  return request<Record<string, string>>("/users/resolve-ids", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ discordIds }),
  });
}

export function linkSteam(
  token: string,
  steamId: string
): Promise<ApiResponse<UserWithRoles>> {
  return request<UserWithRoles>("/users/link-steam", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ steamId }),
  });
}

// Roles
const rolesClient = createCrudClient<DiscordRole>("/roles");
export const getRoles = rolesClient.getAll;
export const createRole = (token: string, data: { discordRoleId: string; name: string; permissions?: Permission[] }) => rolesClient.create(token, data);
export const deleteRole = rolesClient.remove;

export function updateRolePermissions(
  token: string,
  id: string,
  permissions: Permission[]
): Promise<ApiResponse<DiscordRole>> {
  return request<DiscordRole>(`/roles/${id}/permissions`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ permissions }),
  });
}

// Tickets
export function getTickets(
  token: string
): Promise<ApiResponse<Ticket[]>> {
  return request<Ticket[]>("/tickets", {
    headers: authHeaders(token),
  });
}

export function getTicket(
  token: string,
  id: number
): Promise<ApiResponse<Ticket>> {
  return request<Ticket>(`/tickets/${id}`, {
    headers: authHeaders(token),
  });
}

export function getTicketByUuid(
  uuid: string
): Promise<ApiResponse<Ticket>> {
  return request<Ticket>(`/tickets/by-uuid/${uuid}`);
}

export function getProspectByUuid(
  uuid: string
): Promise<ApiResponse<Prospect>> {
  return request<Prospect>(`/tickets/by-uuid/prospect/${uuid}`);
}

// Legacy Tickets
export function getLegacyTickets(
  token: string
): Promise<ApiResponse<LegacyTicket[]>> {
  return request<LegacyTicket[]>("/tickets/legacy", {
    headers: authHeaders(token),
  });
}

export function getLegacyTicket(
  token: string,
  id: number
): Promise<ApiResponse<LegacyTicket>> {
  return request<LegacyTicket>(`/tickets/legacy/${id}`, {
    headers: authHeaders(token),
  });
}

export function getLegacyTicketByUuid(
  uuid: string
): Promise<ApiResponse<LegacyTicket>> {
  return request<LegacyTicket>(`/tickets/by-uuid/legacy/${uuid}`);
}

export function getProspects(
  token: string
): Promise<ApiResponse<Prospect[]>> {
  return request<Prospect[]>("/tickets/prospects/list", {
    headers: authHeaders(token),
  });
}

export function getProspect(
  token: string,
  id: number
): Promise<ApiResponse<Prospect>> {
  return request<Prospect>(`/tickets/prospects/${id}`, {
    headers: authHeaders(token),
  });
}

// Matches
const matchesClient = createCrudClient<Match>("/matches");
export const getMatches = matchesClient.getAll;
export const updateMatch = (
  token: string,
  id: string,
  data: { date?: string; map?: string; layer?: string; result?: string; vodUrl?: string | null; hidden?: boolean; server?: string }
) => matchesClient.update(token, id, data as Record<string, unknown>);

export function getPublicMatches(): Promise<ApiResponse<Match[]>> {
  return request<Match[]>("/matches/public");
}

// Dashboard Stats
export interface MetricSample {
  time: number;
  tickRate: number | null;
  playerCount: number;
  publicQueue: number;
  reserveQueue: number;
}

export interface DashboardStats {
  servers?: ServerStatus[];
  serverMetrics?: Record<string, { serverName: string; metricHistory: MetricSample[]; playerCount: number; publicQueue: number; reserveQueue: number; maxPlayers: number }>;
  tickets?: { open: number; closed: number };
  prospects?: { open: number; accepted: number; denied: number };
  members?: { total: number; withSteam: number };
  whitelist?: { total: number };
  matches?: { total: number; wins: number; losses: number; draws: number };
  recentMatches?: Match[];
}

export function getDashboardStats(
  token: string
): Promise<ApiResponse<DashboardStats>> {
  return request<DashboardStats>("/stats/summary", {
    headers: authHeaders(token),
  });
}

// Servers
export interface ServerStatus {
  id: string;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  map: string;
  status: "online" | "offline";
  playerList: { name: string; duration: number }[];
  publicQueue: number;
  reserveQueue: number;
  metricHistory: MetricSample[];
}

export function getServerStatus(): Promise<ApiResponse<ServerStatus[]>> {
  return request<ServerStatus[]>("/servers/status");
}

export const deleteMatch = matchesClient.remove;

// Server Config
export function getServerConfigs(
  token: string
): Promise<ApiResponse<ServerConfig[]>> {
  return request<ServerConfig[]>("/server-config", {
    headers: authHeaders(token),
  });
}

export function toggleServerSync(
  token: string,
  server: string
): Promise<ApiResponse<ServerConfig>> {
  return request<ServerConfig>(`/server-config/${encodeURIComponent(server)}/sync`, {
    method: "PUT",
    headers: authHeaders(token),
  });
}

// SquadJS Config
export function getSquadJSEnvironments(
  token: string
): Promise<ApiResponse<{ environments: string[] }>> {
  return request<{ environments: string[] }>("/squadjs-config", {
    headers: authHeaders(token),
  });
}

export function getSquadJSPlugins(
  token: string,
  env: string
): Promise<ApiResponse<{ plugins: SquadJSPlugin[]; environment: string }>> {
  return request<{ plugins: SquadJSPlugin[]; environment: string }>(
    `/squadjs-config/${env}`,
    { headers: authHeaders(token) }
  );
}

export function updateSquadJSPlugins(
  token: string,
  env: string,
  plugins: SquadJSPlugin[]
): Promise<ApiResponse<{ saved: true }>> {
  return request<{ saved: true }>(`/squadjs-config/${env}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ plugins }),
  });
}

export function getSquadJSDescriptions(
  token: string
): Promise<ApiResponse<{ descriptions: Record<string, string>; fieldDescriptions: Record<string, Record<string, string>> }>> {
  return request<{ descriptions: Record<string, string>; fieldDescriptions: Record<string, Record<string, string>> }>(
    "/squadjs-config/descriptions",
    { headers: authHeaders(token) }
  );
}

// Discord Bot
export function getDiscordBotOverview(
  token: string
): Promise<ApiResponse<DiscordBotOverview>> {
  return request<DiscordBotOverview>("/discord-bot/overview", {
    headers: authHeaders(token),
  });
}

export function getSeedingConfig(
  token: string
): Promise<ApiResponse<SeedingConfig>> {
  return request<SeedingConfig>("/discord-bot/seeding/config", {
    headers: authHeaders(token),
  });
}

export function updateSeedingConfig(
  token: string,
  data: Partial<SeedingConfig>
): Promise<ApiResponse<{ updated: true }>> {
  return request<{ updated: true }>("/discord-bot/seeding/config", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function getSeedingSessions(
  token: string,
  limit?: number
): Promise<ApiResponse<SeedingSession[]>> {
  const qs = limit ? `?limit=${limit}` : "";
  return request<SeedingSession[]>(`/discord-bot/seeding/sessions${qs}`, {
    headers: authHeaders(token),
  });
}

export function sendSeedingNow(
  token: string
): Promise<ApiResponse<{ queued: true }>> {
  return request<{ queued: true }>("/discord-bot/seeding/send-now", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function getSeedingRapport(
  token: string,
  date: string
): Promise<ApiResponse<SeedingRapport>> {
  return request<SeedingRapport>(
    `/discord-bot/seeding/rapport?date=${encodeURIComponent(date)}`,
    { headers: authHeaders(token) }
  );
}

export function sendSeedingRapport(
  token: string,
  date: string
): Promise<ApiResponse<{ queued: true }>> {
  return request<{ queued: true }>("/discord-bot/seeding/rapport/send", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ date }),
  });
}

export function pauseProspect(
  token: string,
  id: number
): Promise<ApiResponse<{ updated: true }>> {
  return request<{ updated: true }>(`/discord-bot/prospects/${id}/pause`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function unpauseProspect(
  token: string,
  id: number
): Promise<ApiResponse<{ updated: true }>> {
  return request<{ updated: true }>(`/discord-bot/prospects/${id}/unpause`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function extendProspect(
  token: string,
  id: number,
  days: number
): Promise<ApiResponse<{ updated: true }>> {
  return request<{ updated: true }>(`/discord-bot/prospects/${id}/extend`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ days }),
  });
}

export function getBotStatus(
  token: string
): Promise<ApiResponse<BotStatus | null>> {
  return request<BotStatus | null>("/discord-bot/status", {
    headers: authHeaders(token),
  });
}

export function getBotMessages(
  token: string,
  params: { limit?: number; offset?: number; author?: string; channel?: string; dm?: boolean; search?: string; from?: string; to?: string } = {}
): Promise<ApiResponse<Paginated<BotMessage>>> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.author) qs.set("author", params.author);
  if (params.channel) qs.set("channel", params.channel);
  if (params.dm) qs.set("dm", "1");
  if (params.search) qs.set("search", params.search);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const q = qs.toString();
  return request<Paginated<BotMessage>>(`/discord-bot/messages${q ? `?${q}` : ""}`, {
    headers: authHeaders(token),
  });
}

export function getBotLogs(
  token: string,
  params: { limit?: number; offset?: number; level?: number; module?: string; search?: string; from?: string; to?: string } = {}
): Promise<ApiResponse<Paginated<BotLog>>> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.level) qs.set("level", String(params.level));
  if (params.module) qs.set("module", params.module);
  if (params.search) qs.set("search", params.search);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const q = qs.toString();
  return request<Paginated<BotLog>>(`/discord-bot/logs${q ? `?${q}` : ""}`, {
    headers: authHeaders(token),
  });
}

// Ticket Timeouts
export function getTicketTimeouts(
  token: string
): Promise<ApiResponse<TicketTimeout[]>> {
  return request<TicketTimeout[]>("/discord-bot/timeouts", {
    headers: authHeaders(token),
  });
}

export function createTicketTimeout(
  token: string,
  data: { userId: string; hours: number }
): Promise<ApiResponse<{ created: true }>> {
  return request<{ created: true }>("/discord-bot/timeouts", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function expireTicketTimeout(
  token: string,
  id: number
): Promise<ApiResponse<{ updated: true }>> {
  return request<{ updated: true }>(`/discord-bot/timeouts/${id}/expire`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

// Ticket Actions (queued for bot)
export function closeTicket(
  token: string,
  id: number
): Promise<ApiResponse<{ queued: true }>> {
  return request<{ queued: true }>(`/discord-bot/ticket-actions/${id}/close`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function escalateTicket(
  token: string,
  id: number,
  tier: string
): Promise<ApiResponse<{ queued: true }>> {
  return request<{ queued: true }>(`/discord-bot/ticket-actions/${id}/escalate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ tier }),
  });
}

export function reopenTicket(
  token: string,
  id: number
): Promise<ApiResponse<{ queued: true }>> {
  return request<{ queued: true }>(`/discord-bot/ticket-actions/${id}/reopen`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function forceCloseTicket(
  token: string,
  id: number
): Promise<ApiResponse<{ queued: true }>> {
  return request<{ queued: true }>(`/discord-bot/ticket-actions/${id}/force-close`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

// Prospect Mentor Management
export function reassignMentor(
  token: string,
  prospectId: number,
  mentorId: string
): Promise<ApiResponse<{ queued: true }>> {
  return request<{ queued: true }>(`/discord-bot/prospects/${prospectId}/reassign-mentor`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ mentorId }),
  });
}

export function getMentorGroups(
  token: string
): Promise<ApiResponse<import("shared").MentorGroup[]>> {
  return request<import("shared").MentorGroup[]>("/discord-bot/prospects/mentors", {
    headers: authHeaders(token),
  });
}

// Audit Logs
export function getAuditLogs(
  token: string,
  params: { page?: number; limit?: number; action?: string; resource?: string; resourceId?: string; userId?: string; from?: string; to?: string } = {}
): Promise<ApiResponse<Paginated<AuditLogEntry>>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.action) qs.set("action", params.action);
  if (params.resource) qs.set("resource", params.resource);
  if (params.resourceId) qs.set("resourceId", params.resourceId);
  if (params.userId) qs.set("userId", params.userId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const q = qs.toString();
  return request<Paginated<AuditLogEntry>>(`/audit-logs${q ? `?${q}` : ""}`, {
    headers: authHeaders(token),
  });
}

// Observability
export function getGracePeriodHistory(
  token: string,
  params: { from?: string; to?: string; limit?: number; player?: string } = {}
): Promise<ApiResponse<{ data: import("shared").GracePeriodEventRow[] }>> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.player) qs.set("player", params.player);
  const q = qs.toString();
  return request(`/observability/grace-period${q ? `?${q}` : ""}`, {
    headers: authHeaders(token),
  });
}

export function getSwapQueueHistory(
  token: string,
  params: { from?: string; to?: string; limit?: number; player?: string } = {}
): Promise<ApiResponse<{ data: import("shared").SwapQueueActionRow[] }>> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.player) qs.set("player", params.player);
  const q = qs.toString();
  return request(`/observability/swap-queue${q ? `?${q}` : ""}`, {
    headers: authHeaders(token),
  });
}

// Lobby Service (proxied through API to avoid CORS)
export function createLobby(
  serverName: string
): Promise<ApiResponse<{ url: string; serverId: string; serverName: string }>> {
  return request<{ url: string; serverId: string; serverName: string }>(
    `/lobby/create/${encodeURIComponent(serverName)}`,
    { method: "POST" }
  );
}

// Lobby Monitoring (proxied through API)
export interface LobbyStats {
  stats: {
    callsThisMinute: number;
    callsThisHour: number;
    callsToday: number;
    totalCalls: number;
    totalErrors: number;
    rateLimitHits: number;
    errorRate: number;
    avgLatencyMs: number;
  };
  recentCalls: {
    timestamp: number;
    endpoint: string;
    callerIp: string;
    serverRequested: string;
    status: number;
    latencyMs: number;
    error?: string;
  }[];
}

export interface LobbyHealth {
  steam: { connected: boolean };
  eos: { tokenValid: boolean; tokenTTLSeconds: number };
  discovery: {
    serverCount: number;
    lastRefresh: string | null;
  };
  service: { uptime: number; buildId: string };
}

export function getLobbyStats(
  token: string
): Promise<ApiResponse<LobbyStats>> {
  return request<LobbyStats>("/lobby/stats", {
    headers: authHeaders(token),
  });
}

export function getLobbyHealth(
  token: string
): Promise<ApiResponse<LobbyHealth>> {
  return request<LobbyHealth>("/lobby/health", {
    headers: authHeaders(token),
  });
}

export function reconnectLobbyServiceSteam(
  token: string
): Promise<ApiResponse<void>> {
  return request<void>("/lobby/steam/reconnect", {
    method: "POST",
    headers: authHeaders(token),
  });
}

// Playtime
export function getPlaytime(
  token: string,
  steamId: string,
): Promise<ApiResponse<PlaytimeStats>> {
  return request<PlaytimeStats>(`/playtime?steamId=${encodeURIComponent(steamId)}`, {
    headers: authHeaders(token),
  });
}

import type {
  ApiResponse,
  AuthSyncResponse,
  AuthMeResponse,
  WhitelistEntry,
  WhitelistCandidate,
  AdminGroup,
  Clan,
  ServerConfig,
  UserWithRoles,
  Ticket,
  Prospect,
  DiscordRole,
  Permission,
  Match,
  SquadJSPlugin,
  DiscordBotOverview,
  SeedingConfig,
  SeedingSession,
  BotMessage,
  BotLog,
  BotStatus,
  AuditLogEntry,
  Paginated,
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
export function getWhitelist(
  token: string,
  server?: string
): Promise<ApiResponse<WhitelistEntry[]>> {
  const qs = server ? `?server=${encodeURIComponent(server)}` : "";
  return request<WhitelistEntry[]>(`/whitelist${qs}`, {
    headers: authHeaders(token),
  });
}

export function addWhitelistEntry(
  token: string,
  steamId: string,
  opts?: { name?: string; clan?: string; clanId?: string; role?: string; groupId?: string; reason?: string; expiresAt?: string; server?: string }
): Promise<ApiResponse<WhitelistEntry>> {
  return request<WhitelistEntry>("/whitelist", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ steamId, ...opts }),
  });
}

export function updateWhitelistEntry(
  token: string,
  id: string,
  data: { steamId?: string; name?: string; clan?: string; clanId?: string | null; role?: string; groupId?: string | null; reason?: string; expiresAt?: string | null }
): Promise<ApiResponse<WhitelistEntry>> {
  return request<WhitelistEntry>(`/whitelist/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function deleteWhitelistEntry(
  token: string,
  id: string
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/whitelist/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function bulkAddWhitelist(
  token: string,
  entries: { steamId: string; name?: string; clan?: string; role?: string; groupId?: string; reason?: string }[],
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

// Admin Groups
export function getAdminGroups(
  token: string
): Promise<ApiResponse<AdminGroup[]>> {
  return request<AdminGroup[]>("/admin-groups", {
    headers: authHeaders(token),
  });
}

export function createAdminGroup(
  token: string,
  data: { name: string; permissions: string; sortOrder?: number }
): Promise<ApiResponse<AdminGroup>> {
  return request<AdminGroup>("/admin-groups", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function updateAdminGroup(
  token: string,
  id: string,
  data: { name?: string; permissions?: string; sortOrder?: number }
): Promise<ApiResponse<AdminGroup>> {
  return request<AdminGroup>(`/admin-groups/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function deleteAdminGroup(
  token: string,
  id: string
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/admin-groups/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// Clans
export function getClans(
  token: string
): Promise<ApiResponse<Clan[]>> {
  return request<Clan[]>("/clans", {
    headers: authHeaders(token),
  });
}

export function createClan(
  token: string,
  data: { name: string; tag: string }
): Promise<ApiResponse<Clan>> {
  return request<Clan>("/clans", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function updateClan(
  token: string,
  id: string,
  data: { name?: string; tag?: string }
): Promise<ApiResponse<Clan>> {
  return request<Clan>(`/clans/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function deleteClan(
  token: string,
  id: string
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/clans/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

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

// Users
export function syncUserRoles(
  token: string
): Promise<ApiResponse<{ updated: number }>> {
  return request<{ updated: number }>("/users/sync-roles", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function getUsers(
  token: string
): Promise<ApiResponse<UserWithRoles[]>> {
  return request<UserWithRoles[]>("/users", {
    headers: authHeaders(token),
  });
}

export function updateUser(
  token: string,
  id: string,
  data: { steamId?: string; eosId?: string }
): Promise<ApiResponse<UserWithRoles>> {
  return request<UserWithRoles>(`/users/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export function deleteUser(
  token: string,
  id: string
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/users/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
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
export function getRoles(
  token: string
): Promise<ApiResponse<DiscordRole[]>> {
  return request<DiscordRole[]>("/roles", {
    headers: authHeaders(token),
  });
}

export function createRole(
  token: string,
  data: { discordRoleId: string; name: string; permissions?: Permission[] }
): Promise<ApiResponse<DiscordRole>> {
  return request<DiscordRole>("/roles", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

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

export function deleteRole(
  token: string,
  id: string
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/roles/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
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
export function getPublicMatches(): Promise<ApiResponse<Match[]>> {
  return request<Match[]>("/matches/public");
}

export function getMatches(
  token: string
): Promise<ApiResponse<Match[]>> {
  return request<Match[]>("/matches", {
    headers: authHeaders(token),
  });
}

export function updateMatch(
  token: string,
  id: string,
  data: { date?: string; map?: string; layer?: string; result?: string; vodUrl?: string | null; hidden?: boolean; server?: string }
): Promise<ApiResponse<Match>> {
  return request<Match>(`/matches/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
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

export function deleteMatch(
  token: string,
  id: string
): Promise<ApiResponse<{ deleted: true }>> {
  return request<{ deleted: true }>(`/matches/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

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

// Audit Logs
export function getAuditLogs(
  token: string,
  params: { page?: number; limit?: number; action?: string; resource?: string; userId?: string; from?: string; to?: string } = {}
): Promise<ApiResponse<Paginated<AuditLogEntry>>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.action) qs.set("action", params.action);
  if (params.resource) qs.set("resource", params.resource);
  if (params.userId) qs.set("userId", params.userId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const q = qs.toString();
  return request<Paginated<AuditLogEntry>>(`/audit-logs${q ? `?${q}` : ""}`, {
    headers: authHeaders(token),
  });
}

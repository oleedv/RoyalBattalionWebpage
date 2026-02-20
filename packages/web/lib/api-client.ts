import type {
  ApiResponse,
  AuthSyncResponse,
  AuthMeResponse,
  WhitelistEntry,
  UserWithRoles,
  Ticket,
  Prospect,
  DiscordRole,
  Permission,
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
  token: string
): Promise<ApiResponse<WhitelistEntry[]>> {
  return request<WhitelistEntry[]>("/whitelist", {
    headers: authHeaders(token),
  });
}

export function addWhitelistEntry(
  token: string,
  steamId: string,
  reason?: string
): Promise<ApiResponse<WhitelistEntry>> {
  return request<WhitelistEntry>("/whitelist", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ steamId, reason }),
  });
}

export function updateWhitelistEntry(
  token: string,
  id: string,
  data: { steamId?: string; reason?: string }
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
  entries: { steamId: string; reason?: string }[]
): Promise<ApiResponse<{ created: number; skipped: number }>> {
  return request<{ created: number; skipped: number }>("/whitelist/bulk", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ entries }),
  });
}

// Users
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

import type {
  ApiResponse,
  AuthSyncResponse,
  AuthMeResponse,
  WhitelistEntry,
  UserWithRoles,
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

export function getWhitelist(
  token: string
): Promise<ApiResponse<WhitelistEntry[]>> {
  return request<WhitelistEntry[]>("/whitelist", {
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

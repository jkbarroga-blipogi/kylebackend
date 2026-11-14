// Single connection point to the live backend.
// Every HTTP request in this app goes through requestJson().
//
// Base URL comes from .env.local (NEXT_PUBLIC_API_URL).

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "https://kylebackend.onrender.com").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Bearer token. Omit it for public endpoints such as login and register. */
  token?: string;
};

export async function requestJson<T>(path: string, { method = "GET", body, token }: RequestOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${path.replace(/^\/+/, "")}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and retry.", 0);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = data && typeof data === "object" ? (data as { message?: unknown }) : null;
    const raw = record?.message;
    const text = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string").join(" ") : raw;
    const message = typeof text === "string" && text.length > 0 ? text : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

// POST /auth/login with { username, password } -> { accessToken, refreshToken }
export function loginRequest(username: string, password: string): Promise<TokenPair> {
  return requestJson<TokenPair>("auth/login", { method: "POST", body: { username, password } });
}

// POST /auth/refresh with { refreshToken } -> { accessToken, refreshToken }
export function refreshRequest(refreshToken: string): Promise<TokenPair> {
  return requestJson<TokenPair>("auth/refresh", { method: "POST", body: { refreshToken } });
}

// POST /auth/logout with a Bearer access token -> clears the refresh token server side.
export function logoutRequest(accessToken: string): Promise<unknown> {
  return requestJson("auth/logout", { method: "POST", token: accessToken });
}

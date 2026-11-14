"use client";

// Session state for the whole app.
// Tokens persist in localStorage under "admin-session".
// authed() attaches the Bearer token and refreshes once on a 401 response.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, loginRequest, logoutRequest, refreshRequest, requestJson, type TokenPair } from "./api";

const STORAGE_KEY = "admin-session";

export type Session = TokenPair;

/** Type of the authed() helper: a fetch wrapper that already carries the token. */
export type AuthedRequest = <T>(
  path: string,
  options?: { method?: string; body?: unknown },
) => Promise<T>;

type AuthValue = {
  session: Session | null;
  checked: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authed: AuthedRequest;
};

const AuthContext = createContext<AuthValue | null>(null);

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

function store(session: Session | null) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSession(readStored());
    setChecked(true);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // POST /auth/login -> { accessToken, refreshToken }
    const pair = await loginRequest(username.trim(), password);
    store(pair);
    setSession(pair);
  }, []);

  const logout = useCallback(async () => {
    const current = readStored();
    store(null);
    setSession(null);
    if (current) await logoutRequest(current.accessToken).catch(() => null);
  }, []);

  const authed = useCallback<AuthedRequest>(async (path, options = {}) => {
    let current = readStored();
    if (!current) throw new ApiError("Sign in to continue.", 401);
    try {
      return await requestJson(path, { ...options, token: current.accessToken });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // Access token expired: exchange the refresh token, then retry once.
      try {
        const pair = await refreshRequest(current.refreshToken);
        current = pair;
        store(pair);
        setSession(pair);
      } catch {
        store(null);
        setSession(null);
        throw new ApiError("Your session expired. Sign in again.", 401);
      }
      return requestJson(path, { ...options, token: current.accessToken });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ session, checked, login, logout, authed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, type ApiClient, type Session } from "./api";
import { clearSession, loadSession, saveSession } from "./session-storage";

type AuthContextValue = {
  session: Session | null;
  checked: boolean;
  login: (identifier: string, password: string) => Promise<Session>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  request: (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const clientRef = useRef<ApiClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = createClient({
      onExpired: () => {
        clearSession();
        setSession(null);
      },
    });
  }
  const client = clientRef.current;

  useEffect(() => {
    let cancelled = false;
    const cached = loadSession();
    if (cached) {
      setSession(cached);
      setChecked(true);
      client
        .refresh()
        .then((restored) => {
          if (cancelled) return;
          saveSession(restored);
          setSession(restored);
        })
        .catch(() => {
          if (cancelled) return;
          clearSession();
          setSession(null);
        });
      return () => {
        cancelled = true;
      };
    }
    client
      .refresh()
      .then((restored) => {
        if (cancelled) return;
        saveSession(restored);
        setSession(restored);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(identifier: string, password: string): Promise<Session> {
    const next = await client.login(identifier, password);
    saveSession(next);
    setSession(next);
    return next;
  }

  async function register(username: string, email: string, password: string): Promise<void> {
    await client.register(username, email, password);
  }

  async function logout(): Promise<void> {
    clearSession();
    try {
      await client.logout();
    } finally {
      clearSession();
      setSession(null);
    }
  }

  async function request(path: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
    return client.request(path, options);
  }

  return (
    <AuthContext.Provider value={{ session, checked, login, register, logout, request }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

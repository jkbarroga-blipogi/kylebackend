"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { createClient, type ApiClient, type Session } from "./api";

type AuthContextValue = {
  session: Session | null;
  login: (identifier: string, password: string) => Promise<Session>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  request: (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const clientRef = useRef<ApiClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = createClient({
      onExpired: () => setSession(null),
    });
  }
  const client = clientRef.current;

  async function login(identifier: string, password: string): Promise<Session> {
    const next = await client.login(identifier, password);
    setSession(next);
    return next;
  }

  async function register(username: string, email: string, password: string): Promise<void> {
    await client.register(username, email, password);
  }

  async function logout(): Promise<void> {
    try {
      await client.logout();
    } finally {
      setSession(null);
    }
  }

  async function request(path: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
    return client.request(path, options);
  }

  return (
    <AuthContext.Provider value={{ session, login, register, logout, request }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

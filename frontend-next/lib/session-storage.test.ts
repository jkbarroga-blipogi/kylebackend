import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession } from "./session-storage";
import type { Session } from "./api";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  },
  configurable: true,
});

beforeEach(() => {
  store.clear();
});

function tokenWithExpiry(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: 7, username: "Alex", role: "user", exp: expSeconds }));
  return `${header}.${payload}.signature`;
}

const session = (expSeconds: number): Session => ({
  id: 7,
  username: "Alex",
  role: "user",
  accessToken: tokenWithExpiry(expSeconds),
});

describe("session storage cache", () => {
  it("restores a valid session instantly from storage", () => {
    const cached = session(Math.floor(Date.now() / 1000) + 3600);
    saveSession(cached);
    expect(loadSession()).toEqual(cached);
  });

  it("rejects an expired access token", () => {
    saveSession(session(Math.floor(Date.now() / 1000) - 10));
    expect(loadSession()).toBeNull();
  });

  it("clears the cache on logout", () => {
    saveSession(session(Math.floor(Date.now() / 1000) + 3600));
    clearSession();
    expect(loadSession()).toBeNull();
  });
});

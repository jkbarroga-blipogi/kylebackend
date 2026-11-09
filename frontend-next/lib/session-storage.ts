import type { Session } from "./api";

const KEY = "barroga_session";

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage may be blocked. The in-memory session still works for this tab.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Storage may be blocked. Nothing to clear.
  }
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (
      !Number.isSafeInteger(parsed.id) ||
      parsed.id <= 0 ||
      typeof parsed.username !== "string" ||
      !parsed.username.trim() ||
      typeof parsed.role !== "string" ||
      typeof parsed.accessToken !== "string" ||
      !parsed.accessToken
    ) {
      clearSession();
      return null;
    }
    const part = parsed.accessToken.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!part) {
      clearSession();
      return null;
    }
    const bytes = Uint8Array.from(atob(part), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown; sub?: unknown };
    if (claims.sub !== parsed.id || typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

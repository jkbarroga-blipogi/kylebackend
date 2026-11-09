export const DEFAULT_API = "https://kylebackend.onrender.com";

export type Session = {
  id: number;
  username: string;
  role: string;
  accessToken: string;
};

export class ApiError extends Error {
  status: number;
  uncertain: boolean;
  constructor(message: string, status = 0, uncertain = false) {
    super(message);
    this.status = status;
    this.uncertain = uncertain;
  }
}

function validatedBase(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use an HTTPS API URL, or HTTP on localhost.");
  }
  return url.href.replace(/\/+$/, "") + "/";
}

function readSession(data: unknown): Session {
  const record = data as { accessToken?: unknown } | null;
  if (typeof record?.accessToken !== "string" || !record.accessToken) {
    throw new Error("Unexpected sign-in response. Please try again.");
  }
  try {
    const part = record.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(part), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      sub?: unknown;
      username?: unknown;
      role?: unknown;
    };
    if (
      !Number.isSafeInteger(claims.sub) ||
      (claims.sub as number) <= 0 ||
      typeof claims.username !== "string" ||
      !claims.username.trim() ||
      typeof claims.role !== "string"
    ) {
      throw new Error("Invalid claims");
    }
    return {
      id: claims.sub as number,
      username: claims.username,
      role: claims.role,
      accessToken: record.accessToken,
    };
  } catch (cause) {
    throw new Error("Unexpected sign-in response. Please try again.", { cause });
  }
}

function errorMessage(data: unknown, status: number): string {
  if (status >= 500) return "The server could not complete this request. Reload the records and try again.";
  if (status === 403) return "Your account does not have access to this action.";
  const record = data && typeof data === "object" ? (data as { message?: unknown; error?: unknown }) : null;
  const message = record?.message ?? record?.error;
  const text = Array.isArray(message) ? message.filter((item) => typeof item === "string").join(" ") : message;
  if (typeof text === "string" && text.length <= 400 && !/[<>]|\bSELECT\b|\bINSERT INTO\b/i.test(text)) return text;
  return `Request failed (${status}). Please reload and try again.`;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

export function createClient({
  base = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API,
  fetchImpl = globalThis.fetch.bind(globalThis),
  onExpired = () => {},
}: {
  base?: string;
  fetchImpl?: typeof fetch;
  onExpired?: (owner: Session) => void;
} = {}) {
  let apiBase = validatedBase(base);
  let session: Session | null = null;

  async function request(path: string, { method = "GET", body, auth = true }: RequestOptions = {}): Promise<unknown> {
    const owner = session;
    if (auth && !owner) throw new ApiError("Sign in to continue.", 401);
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (auth) headers.set("Authorization", `Bearer ${owner?.accessToken ?? ""}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 95000);
    let response: Response;
    let text: string;
    try {
      response = await fetchImpl(new URL(path, apiBase), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
      });
      text = await response.text();
    } catch (cause) {
      const write = method !== "GET";
      throw new ApiError(
        write
          ? "The response was lost. Your change may have saved. Reload the records before submitting again."
          : "Cannot reach the server. Check your connection and retry.",
        0,
        write,
      );
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401 && auth) {
      if (session === owner && owner) {
        session = null;
        onExpired(owner);
      }
      throw new ApiError("Your session expired. Sign in to continue.", 401);
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (cause) {
      throw new ApiError(
        "Unexpected server response. Reload the records before trying again.",
        response.status,
        method !== "GET",
      );
    }
    if (!response.ok) {
      throw new ApiError(errorMessage(data, response.status), response.status, response.status >= 500 && method !== "GET");
    }
    return data;
  }

  return {
    get session() {
      return session;
    },
    get base() {
      return apiBase;
    },
    request,
    async login(username: string, password: string): Promise<Session> {
      const response = await fetchImpl("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; accessToken?: string } | null;
      if (!response.ok || data?.error || !data?.accessToken) {
        throw new Error(errorMessage(data, response.status || 401));
      }
      session = readSession(data);
      return session;
    },
    async register(username: string, email: string, password: string): Promise<unknown> {
      const response = await fetchImpl("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: username.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(errorMessage(data, response.status), response.status, response.status >= 500);
      return data;
    },
    async refresh(): Promise<Session> {
      const response = await fetchImpl("/api/auth/refresh", {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !(data as { accessToken?: unknown } | null)?.accessToken) {
        session = null;
        throw new ApiError("Your session expired. Sign in to continue.", 401);
      }
      session = readSession(data);
      return session;
    },
    async logout(): Promise<void> {
      try {
        const headers = new Headers({ Accept: "application/json" });
        if (session) headers.set("Authorization", `Bearer ${session.accessToken}`);
        await fetchImpl("/api/auth/logout", {
          method: "POST",
          headers,
          credentials: "same-origin",
        }).catch(() => null);
      } finally {
        session = null;
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;

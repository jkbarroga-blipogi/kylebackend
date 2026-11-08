export const DEFAULT_API = "https://kylebackend.onrender.com";

export class ApiError extends Error {
  constructor(message, status = 0, uncertain = false) {
    super(message);
    this.status = status;
    this.uncertain = uncertain;
  }
}

function validatedBase(value) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash) {
    throw new Error("Use an HTTPS API URL, or HTTP on localhost.");
  }
  return url.href.replace(/\/+$/, "") + "/";
}

function readSession(data) {
  if (typeof data?.accessToken !== "string" || typeof data?.refreshToken !== "string" || !data.refreshToken) {
    throw new Error("Unexpected sign-in response. Please try again.");
  }
  try {
    const part = data.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(part), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    if (!Number.isSafeInteger(claims.sub) || claims.sub <= 0 || typeof claims.username !== "string" || !claims.username.trim() || typeof claims.role !== "string") {
      throw new Error("Invalid claims");
    }
    // Decoding supports presentation only. The API verifies signatures and access.
    return { id: claims.sub, username: claims.username, role: claims.role, accessToken: data.accessToken };
  } catch (cause) {
    throw new Error("Unexpected sign-in response. Please try again.", { cause });
  }
}

function errorMessage(data, status) {
  if (status >= 500) return "The server could not complete this request. Reload the records and try again.";
  if (status === 403) return "Your account does not have access to this action.";
  const message = data && typeof data === "object" ? data.message || data.error : null;
  const text = Array.isArray(message) ? message.filter((item) => typeof item === "string").join(" ") : message;
  if (typeof text === "string" && text.length <= 400 && !/[<>]|\bSELECT\b|\bINSERT INTO\b/i.test(text)) return text;
  return `Request failed (${status}). Please reload and try again.`;
}

export function createClient({ base = DEFAULT_API, fetchImpl = globalThis.fetch.bind(globalThis), onExpired = () => {} } = {}) {
  let apiBase = validatedBase(base);
  let session = null;

  async function request(path, { method = "GET", body, auth = true } = {}) {
    const owner = session;
    if (auth && !owner) throw new ApiError("Sign in to continue.", 401);
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (auth) headers.set("Authorization", `Bearer ${owner.accessToken}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 95000);
    let response;
    let text;
    try {
      response = await fetchImpl(new URL(path, apiBase), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: "omit" });
      text = await response.text();
    } catch (cause) {
      const write = method !== "GET";
      throw new ApiError(write ? "The response was lost. Your change may have saved. Reload the records before submitting again." : "Cannot reach the server. Check your connection and retry.", 0, write);
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401 && auth) {
      if (session === owner) {
        session = null;
        onExpired(owner);
      }
      throw new ApiError("Your session expired. Sign in to continue.", 401);
    }
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (cause) {
      throw new ApiError("Unexpected server response. Reload the records before trying again.", response.status, method !== "GET");
    }
    if (!response.ok) throw new ApiError(errorMessage(data, response.status), response.status, response.status >= 500 && method !== "GET");
    return data;
  }

  return {
    get session() { return session; },
    get base() { return apiBase; },
    setBase(value) {
      if (session) throw new Error("Sign out before changing the API connection.");
      apiBase = validatedBase(value);
    },
    request,
    async login(username, password) {
      const data = await request("auth/login", { method: "POST", auth: false, body: { username: username.trim(), password } });
      if (data?.error) throw new Error(errorMessage(data, 401));
      session = readSession(data);
      return session;
    },
    async logout() {
      try {
        if (session) await request("auth/logout", { method: "POST" });
      } finally {
        session = null;
      }
    },
  };
}

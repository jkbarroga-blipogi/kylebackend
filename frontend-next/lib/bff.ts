export const REFRESH_COOKIE = "barroga_refresh";
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function nestApiBase(): string {
  const value = process.env.NEST_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://kylebackend.onrender.com";
  return value.replace(/\/+$/, "");
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

export function clearRefreshCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  };
}

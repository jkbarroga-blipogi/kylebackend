import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearRefreshCookieOptions, nestApiBase, REFRESH_COOKIE, refreshCookieOptions } from "@/lib/bff";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const upstream = await fetch(`${nestApiBase()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const data = (await upstream.json().catch(() => null)) as {
    accessToken?: unknown;
    refreshToken?: unknown;
  } | null;
  if (!upstream.ok || typeof data?.accessToken !== "string" || typeof data?.refreshToken !== "string" || !data.refreshToken) {
    store.set(REFRESH_COOKIE, "", clearRefreshCookieOptions());
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  store.set(REFRESH_COOKIE, data.refreshToken, refreshCookieOptions());
  return NextResponse.json({ accessToken: data.accessToken });
}

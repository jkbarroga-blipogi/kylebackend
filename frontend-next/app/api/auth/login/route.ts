import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { nestApiBase, REFRESH_COOKIE, refreshCookieOptions } from "@/lib/bff";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const upstream = await fetch(`${nestApiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await upstream.json().catch(() => null);
  if (!upstream.ok || !data || typeof data !== "object" || "error" in data) {
    return NextResponse.json(data ?? { error: "Invalid credentials" }, { status: upstream.status });
  }
  const record = data as { accessToken?: unknown; refreshToken?: unknown };
  if (typeof record.accessToken !== "string" || typeof record.refreshToken !== "string" || !record.refreshToken) {
    return NextResponse.json({ error: "Unexpected sign-in response. Please try again." }, { status: 502 });
  }
  const store = await cookies();
  store.set(REFRESH_COOKIE, record.refreshToken, refreshCookieOptions());
  return NextResponse.json({ accessToken: record.accessToken }, { status: upstream.status });
}

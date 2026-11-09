import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearRefreshCookieOptions, nestApiBase, REFRESH_COOKIE } from "@/lib/bff";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    await fetch(`${nestApiBase()}/auth/logout`, {
      method: "POST",
      headers: { Authorization: authorization, Accept: "application/json" },
    }).catch(() => null);
  }
  const store = await cookies();
  store.set(REFRESH_COOKIE, "", clearRefreshCookieOptions());
  return NextResponse.json({ ok: true });
}

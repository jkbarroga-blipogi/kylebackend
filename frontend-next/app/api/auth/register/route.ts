import { NextResponse } from "next/server";
import { nestApiBase } from "@/lib/bff";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const upstream = await fetch(`${nestApiBase()}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data ?? { message: "Registration failed. Please try again." }, { status: upstream.status });
}

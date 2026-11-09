import { describe, expect, it, vi } from "vitest";
import { createClient } from "./api";

const token = (role = "admin") =>
  `header.${btoa(JSON.stringify({ sub: 7, username: "Alex", role }))}.signature`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("Next.js BFF API client contracts", () => {
  it("rejects the successful HTTP response used for invalid credentials", async () => {
    const client = createClient({
      fetchImpl: vi.fn().mockResolvedValue(json({ error: "Invalid credentials" })),
    });
    await expect(client.login("Alex", "wrong")).rejects.toThrow("Invalid credentials");
    expect(client.session).toBeNull();
  });

  it("validates token claims before creating an in-memory session", async () => {
    const client = createClient({
      fetchImpl: vi.fn().mockResolvedValue(json({ accessToken: "broken" })),
    });
    await expect(client.login("Alex", "password")).rejects.toThrow("sign-in response");
    expect(client.session).toBeNull();
  });

  it("logs in through the BFF without ever receiving a refresh token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: token() }))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ ok: true }));
    const client = createClient({ fetchImpl });
    await client.login(" Alex ", " password ");
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/auth/login");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      username: "Alex",
      password: " password ",
    });
    expect(client.session?.accessToken).toBe(token());
    await client.request("animal");
    expect(fetchImpl.mock.calls[1][1].headers.get("Authorization")).toBe(`Bearer ${token()}`);
    await client.logout();
    expect(fetchImpl.mock.calls[2][0]).toBe("/api/auth/logout");
    expect(fetchImpl.mock.calls[2][1].headers.get("Authorization")).toBe(`Bearer ${token()}`);
    expect(client.session).toBeNull();
  });

  it("registers through the BFF with username, email, and password and never submits a role", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 8, username: "Ana", email: "ana@example.com", role: "user" }, 201));
    const client = createClient({ fetchImpl });
    await client.register("Ana", "Ana@Example.com", "password123");
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/auth/register");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      username: "Ana",
      email: "ana@example.com",
      password: "password123",
    });
    expect(fetchImpl.mock.calls[0][1].body).not.toContain("role");
  });

  it("silently refreshes the access token from the httpOnly cookie on reload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ accessToken: token("user") }));
    const client = createClient({ fetchImpl });
    const session = await client.refresh();
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/auth/refresh");
    expect(session.role).toBe("user");
    expect(client.session?.accessToken).toBe(token("user"));
  });

  it("clears the session when refresh is rejected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ message: "Unauthorized" }, 401));
    const client = createClient({ fetchImpl });
    await expect(client.refresh()).rejects.toThrow("session expired");
    expect(client.session).toBeNull();
  });
});

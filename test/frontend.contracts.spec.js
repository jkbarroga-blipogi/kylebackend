import { describe, expect, it, vi } from "vitest";
import { createClient } from "../frontend/js/api.js";
import { resources, canAccess, canWrite } from "../frontend/js/resources.js";
import { buildPayload, readRows, deleteOutcome, eligibleAnimals, recordName, fieldValue } from "../frontend/js/records.js";

const resource = (key) => resources.find((item) => item.key === key);
const token = (role = "admin") => `header.${btoa(JSON.stringify({ sub: 7, username: "Alex", role }))}.signature`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

describe("frontend API and session contracts", () => {
  it("rejects the successful HTTP response used for invalid credentials", async () => {
    const client = createClient({ fetchImpl: vi.fn().mockResolvedValue(json({ error: "Invalid credentials" })) });
    await expect(client.login("Alex", "wrong")).rejects.toThrow("Invalid credentials");
    expect(client.session).toBeNull();
  });

  it("validates token claims before creating an in-memory session", async () => {
    const client = createClient({ fetchImpl: vi.fn().mockResolvedValue(json({ accessToken: "broken", refreshToken: "refresh" })) });
    await expect(client.login("Alex", "password")).rejects.toThrow("sign-in response");
    expect(client.session).toBeNull();
  });

  it("preserves password bytes, sends a bearer token, and logs out without a user ID", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ accessToken: token(), refreshToken: "refresh" }))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ ok: true }));
    const client = createClient({ fetchImpl });
    await client.login(" Alex ", " password ");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ username: "Alex", password: " password " });
    await client.request("animal");
    expect(fetchImpl.mock.calls[1][1].headers.get("Authorization")).toBe(`Bearer ${token()}`);
    await client.logout();
    expect(new URL(fetchImpl.mock.calls[2][0]).pathname).toBe("/auth/logout");
    expect(fetchImpl.mock.calls[2][1].body).toBeUndefined();
    expect(client.session).toBeNull();
  });

  it("expires once on concurrent 401s and never refreshes or replays a write", async () => {
    const onExpired = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ accessToken: token(), refreshToken: "refresh" }))
      .mockImplementation(() => Promise.resolve(json({ message: "Unauthorized" }, 401)));
    const client = createClient({ fetchImpl, onExpired });
    await client.login("Alex", "password");
    await Promise.allSettled([client.request("animal", { method: "POST", body: {} }), client.request("breed")]);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(client.session).toBeNull();
  });

  it("keeps the session on 403 and hides raw server failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ accessToken: token(), refreshToken: "refresh" }))
      .mockResolvedValueOnce(json({ message: "Forbidden" }, 403))
      .mockResolvedValueOnce(json({ message: "SELECT private FROM secrets" }, 500));
    const client = createClient({ fetchImpl });
    await client.login("Alex", "password");
    await expect(client.request("users")).rejects.toMatchObject({ status: 403 });
    expect(client.session).not.toBeNull();
    await expect(client.request("animal")).rejects.toThrow("server could not complete");
  });

  it("marks a lost write response as uncertain without retrying", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const client = createClient({ fetchImpl });
    await expect(client.request("auth/register", { method: "POST", body: {}, auth: false })).rejects.toMatchObject({ uncertain: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("frontend resource boundaries", () => {
  it("excludes Categories from the frontend", () => {
    expect(resources.some((item) => item.key === "category")).toBe(false);
    expect(canAccess("admin", "category")).toBe(false);
  });
  it("limits volunteers to animals and leaves unknown roles unprovisioned", () => {
    expect(resources.filter((r) => canAccess("volunteer", r.key)).map((r) => r.key)).toEqual(["animal"]);
    expect(resources.some((r) => canAccess("user", r.key))).toBe(false);
    expect(canAccess("staff", "staff")).toBe(true);
    expect(canWrite("staff", "staff")).toBe(false);
    expect(canWrite("volunteer", "animal")).toBe(false);
    expect(canWrite("admin", "users")).toBe(true);
  });

  it("creates users through registration and never submits a role", () => {
    expect(resource("users").createPath).toBe("auth/register");
    const result = buildPayload(resource("users"), { username: "Alex", password: " keep spaces ", role: "admin" });
    expect(result).toEqual({ body: { username: "Alex", password: " keep spaces " }, errors: {} });
    expect(buildPayload(resource("users"), { username: "Alex", password: "" }).errors.password).toBeTruthy();
    expect(buildPayload(resource("users"), { username: "Alex", password: "" }, { id: 1, username: "Alex" }).body).not.toHaveProperty("password");
  });

  it("distinguishes nullable clears, omitted fields, and a birth date that cannot clear", () => {
    const values = { breed_id: "2", animal_name: "Luna", sex: "Female", arrival_date: "2026-11-08", birth_date: "", color: "", adoption_status: "Available" };
    expect(buildPayload(resource("animal"), values).body).not.toHaveProperty("birth_date");
    const edited = buildPayload(resource("animal"), values, { animal_id: 3, birth_date: "2024-01-01", color: "Black" });
    expect(edited.errors.birth_date).toContain("cannot be cleared");
    expect(edited.body.color).toBeNull();
  });

  it("validates real calendar dates, IDs and email without altering telephone values", () => {
    const invalid = buildPayload(resource("medical-record"), { animal_id: "0", staff_id: "2.5", record_date: "2026-02-30" });
    expect(Object.keys(invalid.errors)).toEqual(["animal_id", "staff_id", "record_date"]);
    const adopter = buildPayload(resource("adopter"), { first_name: " Alex ", last_name: "Cruz", phone: "+63 0912", address: "One\nTwo", email: "invalid" });
    expect(adopter.errors.email).toBeTruthy();
    expect(adopter.body.phone).toBe("+63 0912");
    expect(adopter.body.address).toBe("One\nTwo");
  });

  it("rejects malformed collections and strips private and unknown columns", () => {
    expect(() => readRows(resource("animal"), { message: "not an array" })).toThrow();
    expect(() => readRows(resource("animal"), [{ animal_id: -1 }])).toThrow();
    const rows = readRows(resource("users"), [{ id: 2, username: "Alex", role: "admin", password: "hash", refresh_token: "private" }]);
    expect(rows).toEqual([{ id: 2, username: "Alex", role: "admin" }]);
  });

  it("understands each deletion contract including already-missing records", () => {
    expect(deleteOutcome(resource("animal"), { animal_id: 2 }, 2)).toBe("deleted");
    expect(deleteOutcome(resource("species"), { deleted: true, species_id: 2 }, 2)).toBe("deleted");
    expect(deleteOutcome(resource("adopter"), { deleted: true, id: 2 }, 2)).toBe("deleted");
    expect(deleteOutcome(resource("users"), { affectedRows: 0 }, 2)).toBe("missing");
    expect(() => deleteOutcome(resource("species"), { deleted: true, species_id: 3 }, 2)).toThrow();
  });

  it("requires at least 8 characters for a new user password", () => {
    expect(buildPayload(resource("users"), { username: "Alex", email: "alex@example.com", password: "short" }).errors.password).toContain("at least 8");
    expect(buildPayload(resource("users"), { username: "Alex", email: "alex@example.com", password: "password123" })).toEqual({ body: { username: "Alex", email: "alex@example.com", password: "password123" }, errors: {} });
  });

  it("shows record numbers without a hashtag sign", () => {
    expect(recordName(resource("species"), { species_id: 5 })).toBe("species 5");
    expect(fieldValue(resource("animal"), { breed_id: 2 }, "breed_id", { breed: [{ breed_id: 2, breed_name: "Aspin" }] })).toBe("Aspin 2");
    expect(fieldValue(resource("animal"), { breed_id: 9 }, "breed_id", {})).toBe("9");
  });

  it("excludes adopted animals but retains the current relationship while editing", () => {
    const animals = [{ animal_id: 1, adoption_status: "Available" }, { animal_id: 2, adoption_status: "Adopted" }, { animal_id: 3, adoption_status: "Available" }, { animal_id: 4, adoption_status: "Available" }];
    const adoptions = [{ animal_id: 3 }];
    const applications = [{ animal_id: 4, application_status: " Completed " }];
    expect(eligibleAnimals(animals, adoptions, applications).map((row) => row.animal_id)).toEqual([1]);
    expect(eligibleAnimals(animals, adoptions, applications, "2").map((row) => row.animal_id)).toEqual([1, 2]);
  });
});

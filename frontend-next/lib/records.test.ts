import { describe, expect, it } from "vitest";
import { buildPayload, fieldValue, readRows, recordName } from "./records";
import { getResource } from "./resources";

const resource = (key: string) => {
  const found = getResource(key);
  if (!found) throw new Error(`Missing resource ${key}`);
  return found;
};

describe("Next.js record contracts", () => {
  it("requires at least 8 characters for a new user password", () => {
    expect(
      buildPayload(resource("users"), { username: "Alex", email: "alex@example.com", password: "short" }).errors.password,
    ).toContain("at least 8");
    expect(
      buildPayload(resource("users"), { username: "Alex", email: "alex@example.com", password: "password123" }),
    ).toEqual({
      body: { username: "Alex", email: "alex@example.com", password: "password123" },
      errors: {},
    });
  });

  it("never submits a role on registration, but submits role when editing an existing user", () => {
    expect(resource("users").createPath).toBe("auth/register");
    const created = buildPayload(resource("users"), { username: "Alex", password: " keep spaces ", role: "admin" });
    expect(created).toEqual({ body: { username: "Alex", password: " keep spaces " }, errors: {} });

    const edited = buildPayload(
      resource("users"),
      { username: "Alex", email: "alex@example.com", role: "staff", password: "" },
      { id: 15, username: "Alex", email: "alex@example.com", role: "user" },
    );
    expect(edited).toEqual({
      body: { username: "Alex", email: "alex@example.com", role: "staff" },
      errors: {},
    });
  });

  it("shows record numbers without a hashtag sign", () => {
    expect(recordName(resource("species"), { species_id: 5 })).toBe("species 5");
    expect(
      fieldValue(resource("animal"), { breed_id: 2 }, "breed_id", { breed: [{ breed_id: 2, breed_name: "Aspin" }] }),
    ).toBe("Aspin 2");
    expect(fieldValue(resource("animal"), { breed_id: 9 }, "breed_id", {})).toBe("9");
  });

  it("strips private columns from user rows", () => {
    const rows = readRows(resource("users"), [
      { id: 2, username: "Alex", role: "admin", password: "hash", refresh_token: "private" },
    ]);
    expect(rows).toEqual([{ id: 2, username: "Alex", role: "admin" }]);
  });

  it("keeps species and breeds under the animal page tabs", () => {
    expect(resource("species").group).toBe("Animal care");
    expect(resource("breed").group).toBe("Animal care");
    expect(resource("species").path).toBe("species");
    expect(resource("breed").path).toBe("breed");
  });
});

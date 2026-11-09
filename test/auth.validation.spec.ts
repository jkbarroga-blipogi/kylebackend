import { describe, expect, it } from "vitest";

import { parseLogin, parseRegistration } from "../src/auth/auth.validation";

describe("auth validation: email login and strong passwords", () => {
  it("accepts registration with username, email, and a password of at least 8 characters", () => {
    const parsed = parseRegistration({
      username: "ana",
      email: "Ana@Example.com",
      password: "password123",
    });
    expect(parsed).toEqual({
      username: "ana",
      email: "ana@example.com",
      password: "password123",
    });
  });

  it("rejects registration with a password shorter than 8 characters", () => {
    expect(() =>
      parseRegistration({
        username: "ana",
        email: "ana@example.com",
        password: "short12",
      }),
    ).toThrow();
  });

  it("rejects registration with an invalid email", () => {
    expect(() =>
      parseRegistration({
        username: "ana",
        email: "not-an-email",
        password: "password123",
      }),
    ).toThrow();
  });

  it("accepts login with a username or an email as the identifier", () => {
    expect(
      parseLogin({ username: "ana", password: "old-password" }),
    ).toEqual({ username: "ana", password: "old-password" });
    expect(
      parseLogin({ username: "ana@example.com", password: "old-password" }),
    ).toEqual({ username: "ana@example.com", password: "old-password" });
  });

  it("still accepts an existing short password at login", () => {
    expect(parseLogin({ username: "ana", password: "x" })).toEqual({
      username: "ana",
      password: "x",
    });
  });
});

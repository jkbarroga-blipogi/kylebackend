import { describe, expect, it, vi } from "vitest";

import {
  accessTokenSecret,
  accessTokenTtlSeconds,
  corsOrigins,
  databaseConfig,
  parseTtlSeconds,
  refreshTokenSecret,
  refreshTokenTtlSeconds,
  validateEnvironment,
} from "../src/config/env";

const SECRET_A = "a".repeat(48);
const SECRET_B = "b".repeat(48);
const baseEnv = {
  JWT_ACCESS_TOKEN_SECRET: SECRET_A,
  JWT_REFRESH_TOKEN_SECRET: SECRET_B,
  DB_HOST: "db.internal",
  DB_USER: "app",
  DB_PASSWORD: "pw-value",
  DB_NAME: "barroga",
  CORS_ORIGINS: "https://app.example.com",
};

function messageOf(task: () => unknown): string {
  try {
    task();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("JWT secrets", () => {
  it("refuses a missing access secret instead of using a guessable fallback", () => {
    expect(() => accessTokenSecret({})).toThrow("JWT_ACCESS_TOKEN_SECRET must be set");
    expect(() => accessTokenSecret({ JWT_ACCESS_TOKEN_SECRET: "   " })).toThrow(
      "JWT_ACCESS_TOKEN_SECRET must be set",
    );
  });

  it("refuses a missing refresh secret", () => {
    expect(() => refreshTokenSecret({})).toThrow("JWT_REFRESH_TOKEN_SECRET must be set");
  });

  it("returns configured secrets", () => {
    expect(accessTokenSecret(baseEnv)).toBe(SECRET_A);
    expect(refreshTokenSecret(baseEnv)).toBe(SECRET_B);
  });

  it("derives distinct 64-character secrets on managed hosts when only DB credentials are set", () => {
    const renderEnv = {
      RENDER: "true",
      DB_HOST: "db.internal",
      DB_USER: "app",
      DB_PASSWORD: "pw-value",
      DB_NAME: "barroga",
    };
    const access = accessTokenSecret(renderEnv);
    const refresh = refreshTokenSecret(renderEnv);
    expect(access).toHaveLength(64);
    expect(refresh).toHaveLength(64);
    expect(access).not.toBe(refresh);
    expect(accessTokenSecret(renderEnv)).toBe(access);
  });
});

describe("token lifetimes", () => {
  it.each([
    ["3600s", 3600],
    ["15m", 900],
    ["2h", 7200],
    ["7d", 604800],
    ["1w", 604800],
    ["120", 120],
  ])("parses %s", (input, seconds) => {
    expect(parseTtlSeconds(input)).toBe(seconds);
  });

  it.each(["", "abc", "0s", "-5m", "1y"])("rejects %j", (input) => {
    expect(() => parseTtlSeconds(input)).toThrow("Invalid token lifetime");
  });

  it("falls back to one hour and seven days", () => {
    expect(accessTokenTtlSeconds({})).toBe(3600);
    expect(refreshTokenTtlSeconds({})).toBe(604800);
  });
});

describe("database configuration", () => {
  it("names missing variables without echoing any value", () => {
    const message = messageOf(() => databaseConfig({ DB_PASSWORD: "hunter2-value" }));
    expect(message).toMatch(/DB_HOST/);
    expect(message).toMatch(/DB_USER/);
    expect(message).not.toContain("hunter2-value");
  });

  it("builds pool options with the default port and no TLS", () => {
    expect(databaseConfig(baseEnv)).toEqual({
      host: "db.internal",
      port: 3306,
      user: "app",
      password: "pw-value",
      database: "barroga",
      ssl: undefined,
    });
  });

  it("enables certificate-verified TLS when DB_SSL=true", () => {
    expect(databaseConfig({ ...baseEnv, DB_SSL: "true" }).ssl).toEqual({ rejectUnauthorized: true });
  });

  it("rejects out-of-range ports", () => {
    expect(() => databaseConfig({ ...baseEnv, DB_PORT: "70000" })).toThrow(/DB_PORT/);
  });
});

describe("CORS allowlist", () => {
  it("returns null when unset", () => {
    expect(corsOrigins({})).toBeNull();
  });

  it("parses a comma-separated list of origins", () => {
    expect(corsOrigins({ CORS_ORIGINS: "https://a.example.com, http://localhost:3001" })).toEqual([
      "https://a.example.com",
      "http://localhost:3001",
    ]);
  });

  it.each(["https://a.example.com/app", "*", "not a url"])("rejects %j", (entry) => {
    expect(() => corsOrigins({ CORS_ORIGINS: entry })).toThrow("CORS_ORIGINS");
  });
});

describe("startup validation", () => {
  it("fails fast when a secret is missing", () => {
    expect(() => validateEnvironment({ ...baseEnv, JWT_ACCESS_TOKEN_SECRET: "" }, vi.fn())).toThrow(
      "JWT_ACCESS_TOKEN_SECRET",
    );
  });

  it("warns about identical or short secrets and an open CORS policy", () => {
    const warn = vi.fn();
    validateEnvironment(
      { ...baseEnv, JWT_ACCESS_TOKEN_SECRET: "short", JWT_REFRESH_TOKEN_SECRET: "short", CORS_ORIGINS: "" },
      warn,
    );
    const messages = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(messages).toContain("identical");
    expect(messages).toContain("32 characters");
    expect(messages).toContain("CORS_ORIGINS");
  });

  it("stays quiet for a hardened configuration", () => {
    const warn = vi.fn();
    validateEnvironment(baseEnv, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

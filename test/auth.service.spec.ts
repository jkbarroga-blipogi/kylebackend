import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

import { AuthService } from "../src/auth/auth.service";
import { JwtStrategy } from "../src/auth/jwt-strategy";
import { LoginThrottle } from "../src/auth/login-throttle";

const ACCESS = "access-".padEnd(48, "x");
const REFRESH = "refresh-".padEnd(48, "y");
const PASSWORD = "correct-password";
const passwordHash = bcrypt.hashSync(PASSWORD, 4);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function setup() {
  const clock = { now: 0 };
  const stored = new Map<number, string | null>();
  const users = {
    findByIdentifier: vi.fn(async (identifier: string) =>
      identifier === "ana" ? { id: 4, username: "ana", role: "user", password: passwordHash } : undefined,
    ),
    setRefreshToken: vi.fn(async (id: number, token: string | null) => {
      stored.set(id, token);
    }),
    findByRefreshToken: vi.fn(async (digest: string) =>
      stored.get(4) === digest ? { id: 4, username: "ana", role: "user" } : undefined,
    ),
  };
  const jwt = new JwtService({ secret: ACCESS, signOptions: { expiresIn: 3600 } });
  const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 60_000, maxEntries: 100 }, () => clock.now);
  const service = new AuthService(users as never, jwt, throttle);
  return { service, users, jwt, stored, clock };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", ACCESS);
  vi.stubEnv("JWT_REFRESH_TOKEN_SECRET", REFRESH);
  vi.stubEnv("REFRESH_TOKEN_EXPIRES_IN", "7d");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("refresh token storage", () => {
  it("stores only a SHA-256 digest of the refresh token", async () => {
    const { service, stored } = setup();
    const tokens = await service.authenticate("ana", PASSWORD);
    expect(stored.get(4)).toBe(sha256(tokens.refreshToken));
    expect(stored.get(4)).not.toBe(tokens.refreshToken);
  });

  it("rotates a refresh token and rejects reuse of the old one", async () => {
    const { service } = setup();
    const first = await service.authenticate("ana", PASSWORD);
    const second = await service.refreshTokens(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refreshTokens(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an access token presented as a refresh token", async () => {
    const { service } = setup();
    const { accessToken } = await service.authenticate("ana", PASSWORD);
    await expect(service.refreshTokens(accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects refresh-secret tokens that lack the refresh claim", async () => {
    const { service, jwt, stored } = setup();
    const forged = jwt.sign({ sub: 4, username: "ana", role: "user" }, { secret: REFRESH });
    stored.set(4, sha256(forged));
    await expect(service.refreshTokens(forged)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("sign-in", () => {
  it("rejects a wrong password with 401 instead of a 200 error body", async () => {
    await expect(setup().service.authenticate("ana", "wrong-password")).rejects.toThrow(
      new UnauthorizedException("Invalid credentials"),
    );
  });

  it("rejects an unknown account with the same response", async () => {
    await expect(setup().service.authenticate("ghost", "wrong-password")).rejects.toThrow(
      new UnauthorizedException("Invalid credentials"),
    );
  });

  it("locks an identifier after repeated failures, even for the right password", async () => {
    const { service, clock } = setup();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await statusOf(service.authenticate("ana", "wrong-password"))).toBe(401);
    }
    expect(await statusOf(service.authenticate("ANA ", PASSWORD))).toBe(429);
    clock.now = 60_000;
    expect(await statusOf(service.authenticate("ana", PASSWORD))).toBe(200);
  });

  it("clears the failure count after a successful sign-in", async () => {
    const { service } = setup();
    for (let round = 0; round < 2; round += 1) {
      expect(await statusOf(service.authenticate("ana", "wrong-password"))).toBe(401);
      expect(await statusOf(service.authenticate("ana", "wrong-password"))).toBe(401);
      expect(await statusOf(service.authenticate("ana", PASSWORD))).toBe(200);
    }
  });
});

describe("login throttle memory bound", () => {
  it("caps the number of tracked identifiers", () => {
    const throttle = new LoginThrottle({ maxFailures: 1, windowMs: 60_000, maxEntries: 2 }, () => 0);
    throttle.recordFailure("a");
    throttle.recordFailure("b");
    throttle.recordFailure("c");
    expect(() => throttle.assertAllowed("a")).not.toThrow();
    expect(() => throttle.assertAllowed("c")).toThrow(HttpException);
  });
});

describe("access token strategy", () => {
  it("rejects refresh tokens used as access tokens", async () => {
    const users = { findById: vi.fn(async () => ({ id: 4, username: "ana", role: "user" })) };
    const strategy = new JwtStrategy(users as never);
    await expect(strategy.validate({ sub: 4, token_use: "refresh" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(strategy.validate({ sub: 4 })).resolves.toEqual({ userId: 4, username: "ana", role: "user" });
  });

  it("refuses to start without an access secret", () => {
    vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", "");
    expect(() => new JwtStrategy({} as never)).toThrow("JWT_ACCESS_TOKEN_SECRET must be set");
  });
});

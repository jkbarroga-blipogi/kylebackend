import { describe, expect, it, vi } from "vitest";

import { AuthController } from "../src/auth/auth.controller";

function mkController(authService: object, usersService: object) {
  return new AuthController(authService as never, usersService as never);
}

describe("AuthController boundary (V6)", () => {
  it("derives logout identity from the token, never from the body", async () => {
    const authService = { logout: vi.fn(async () => ({ ok: true })) };
    const controllerInstance = mkController(authService, {});
    const req = { user: { userId: 5, username: "ana", role: "user" } };

    const out = await (
      controllerInstance as unknown as {
        logout: (request: unknown) => Promise<unknown>;
      }
    ).logout(req);

    expect(authService.logout).toHaveBeenCalledWith(5);
    expect(out).toEqual({ ok: true });
  });
});

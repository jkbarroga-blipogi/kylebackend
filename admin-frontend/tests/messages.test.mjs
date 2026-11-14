import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Node strips TypeScript. Resolve the extensionless local import used by Next.js.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      const source = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(source)) return nextResolve(source.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { ApiError } = await import("../lib/api.ts");
const { actionErrorMessage, loginErrorMessage } = await import("../lib/messages.ts");
const { formatDate } = await import("../lib/display.ts");

test("invalid credentials use the agreed wording regardless of backend diagnostics", () => {
  for (const status of [400, 401]) {
    assert.equal(loginErrorMessage(new ApiError("Internal authentication error", status)), "Wrong username or password.");
  }
});

test("network failures do not claim the password is wrong", () => {
  const message = loginErrorMessage(new ApiError("fetch failed", 0));
  assert.match(message, /connection/);
  assert.doesNotMatch(message, /password/);
});

test("permissions, expired sessions, conflicts, and rate limits have actionable wording", () => {
  for (const [status, expected] of [[401, /Sign in again/], [403, /permission/], [404, /Refresh/], [409, /already in use/], [429, /Wait a moment/]]) {
    assert.match(actionErrorMessage(new ApiError("Internal server diagnostic", status)), expected);
  }
});

test("unexpected failures never expose raw exceptions or status codes", () => {
  for (const error of [new Error("Private server trace"), new ApiError("Private server trace", 500), new ApiError("Private server trace", 502), null]) {
    assert.doesNotMatch(actionErrorMessage(error), /Private|500|502|trace/);
  }
});

test("dates use readable output and handle missing or invalid timestamps", () => {
  assert.equal(formatDate("not-a-date"), "Not available");
  assert.equal(formatDate(""), "Not available");
  assert.match(formatDate("2026-11-14T09:00:00Z"), /2026/);
});

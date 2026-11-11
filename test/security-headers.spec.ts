import { describe, expect, it, vi } from "vitest";

import { securityHeaders } from "../src/common/http/security-headers";

describe("security headers middleware", () => {
  it("sets hardened response headers and continues the chain", () => {
    const headers = new Map<string, string>();
    const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
    const next = vi.fn();

    securityHeaders({} as never, response as never, next);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(next).toHaveBeenCalledOnce();
  });
});

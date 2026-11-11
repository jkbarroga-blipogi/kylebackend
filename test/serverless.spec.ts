import { describe, expect, it, vi } from "vitest";

import { createServerlessHandler } from "../src/serverless";

describe("Vercel serverless adapter", () => {
  it("initializes the Nest Express handler once and reuses it across requests", async () => {
    const expressInstance = vi.fn((_req: unknown, res: { ended?: boolean }) => {
      res.ended = true;
    });
    const bootstrap = vi.fn(async () => expressInstance);

    const handler = createServerlessHandler(bootstrap);
    const firstRes: { ended?: boolean } = {};
    const secondRes: { ended?: boolean } = {};

    await handler({ url: "/" }, firstRes);
    await handler({ url: "/animal" }, secondRes);

    expect(bootstrap).toHaveBeenCalledOnce();
    expect(expressInstance).toHaveBeenCalledTimes(2);
    expect(firstRes.ended).toBe(true);
    expect(secondRes.ended).toBe(true);
  });
});

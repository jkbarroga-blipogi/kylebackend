import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("frontend Vercel deployment", () => {
  it("includes frontend source when deploying from the repository root", () => {
    const rules = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim());

    expect(rules).not.toContain("frontend-next");
    expect(rules).toContain("frontend-next/.next");
  });

  it("uses Next.js configuration inside the frontend root instead of backend rewrites", () => {
    const config = JSON.parse(
      readFileSync(new URL("../frontend-next/vercel.json", import.meta.url), "utf8"),
    );

    expect(config).toMatchObject({ framework: "nextjs", buildCommand: "npm run build" });
    expect(config).not.toHaveProperty("functions");
    expect(config).not.toHaveProperty("rewrites");
  });

  it("overrides backend ignore rules while excluding local artifacts and secrets", () => {
    const rules = readFileSync(
      new URL("../frontend-next/.vercelignore", import.meta.url),
      "utf8",
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    expect(rules).toEqual(
      expect.arrayContaining(["node_modules", ".next", ".env", ".env.*"]),
    );
    for (const path of ["frontend-next", "app", "lib", "components", "package.json", "package-lock.json"]) {
      expect(rules).not.toContain(path);
    }
  });
});

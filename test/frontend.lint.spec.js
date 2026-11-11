import { createRequire } from "node:module";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const frontendRoot = fileURLToPath(new URL("../frontend-next/", import.meta.url));
const { ESLint } = createRequire(new URL("../frontend-next/package.json", import.meta.url))("eslint");

it("keeps frontend hook and API code free of lint errors and warnings", async () => {
  const results = await new ESLint({ cwd: frontendRoot }).lintFiles([
    "app/page.tsx",
    "components/adopter-portal.tsx",
    "components/dashboard-content.tsx",
    "components/resource-editor.tsx",
    "components/resource-page.tsx",
    "lib/api.ts",
    "lib/auth-context.tsx",
  ]);
  const issues = results.flatMap((result) =>
    result.messages.map(({ line, ruleId }) => ({
      file: relative(frontendRoot, result.filePath),
      line,
      ruleId,
    })),
  );

  expect(issues).toEqual([]);
}, 30000);

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const steps = [
  ['001-adopter-self-service', './migrate-adopters.mjs'],
  ['002-users-email', './apply-email-migration.mjs'],
  ['003-animal-photo', './apply-photo-migration.mjs'],
];

for (const [label, relativePath] of steps) {
  console.log(`\n=== ${label} ===`);
  const scriptPath = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

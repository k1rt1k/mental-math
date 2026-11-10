// Cross-platform syntax check: `npm run check` used a POSIX-only shell loop.
// Check every shipped and supporting module, not only the two frontend folders.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const files = ['public/sw.js'];
for (const dir of ['public/js', 'netlify/functions', 'netlify/lib', 'tools', 'test']) {
  for (const file of readdirSync(dir, { recursive: true }).filter((f) => /\.(?:js|mjs)$/.test(f)).sort()) files.push(join(dir, file));
}
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`All JS syntax checks passed (${files.length} files)`);

// Cross-platform syntax check: `npm run check` used a POSIX-only shell loop.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

for (const dir of ['public/js', 'public/js/views']) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    execFileSync(process.execPath, ['--check', join(dir, file)], { stdio: 'inherit' });
  }
}
console.log('All JS syntax checks passed');

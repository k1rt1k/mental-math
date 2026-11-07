// The release number comes from the VERSION file, never from a test, so a release does not mean editing tests.
import { readFileSync } from 'node:fs';
export const VERSION = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
export const CACHE = 'mm-v' + VERSION.replace('.', '-');

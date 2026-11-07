// One place for the release number: the VERSION file. Everything that has to repeat it is stamped from there.
//   node tools/version.mjs            stamp every file from VERSION (does nothing when they already agree)
//   node tools/version.mjs 14.52      set VERSION, then stamp
//   node tools/version.mjs --check    change nothing; exit 1 and name the files that disagree
// Also: npm run release -- 14.52   /   npm run version:check
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
const FORMAT = /^\d+\.\d+$/;

/** [file, regex with the number in group 2 (groups 1 and 3 are kept), how many times it must appear, form of the number]. */
const dotted = (v) => v, dashed = (v) => v.replace('.', '-');
export const TARGETS = [
  ['public/js/util.js', /(export const VERSION = ')([^']*)(')/g, 1, dotted],
  ['public/sw.js', /(const C = 'mm-v)([^']*)(')/g, 1, dashed],
  ['public/index.html', /(css\/(?:style|motion|extras)\.css\?v=)([^"]*)(")/g, 3, dotted],
  ['netlify/functions/ai.mjs', /(const AI_BUILD_VERSION = ')([^']*)(')/g, 1, dotted],
  ['README.md', /(buildVersion: ")([^"]*)(")/g, 1, dotted],
  ['README.md', /(x-mental-math-ai-version: )(\d+\.\d+)()/g, 1, dotted],
  ['README.md', /("buildVersion": ")([^"]*)(")/g, 1, dotted],
  ['README.md', /(absent or not `)([^`]*)(`)/g, 1, dotted],
];

export const current = () => {
  const v = readFileSync(path('VERSION'), 'utf8').trim();
  if (!FORMAT.test(v)) throw new Error(`VERSION must look like 14.52, not "${v}"`);
  return v;
};

/** Returns [{file, found, want}] for every place that disagrees; with write=true also fixes them. */
export function stamp(v = current(), write = false) {
  const out = [], text = {};
  for (const [file, re, n, form] of TARGETS) {
    const src = text[file] ?? (text[file] = readFileSync(path(file), 'utf8'));
    const hits = [...src.matchAll(re)];
    if (hits.length !== n) throw new Error(`${file}: expected ${n} match(es) for ${re}, found ${hits.length}. Update tools/version.mjs if the file changed shape.`);
    for (const m of hits) if (m[2] !== form(v)) out.push({ file, found: m[2], want: form(v) });
    text[file] = src.replace(re, (_, a, _b, c) => a + form(v) + c);
  }
  if (write && out.length) for (const f of new Set(out.map((x) => x.file))) writeFileSync(path(f), text[f]);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  try {
    if (arg === '--check') {
      const bad = stamp();
      if (bad.length) { console.error('Out of step with VERSION:\n' + bad.map((b) => `  ${b.file}: ${b.found} (want ${b.want})`).join('\n') + '\nRun: node tools/version.mjs'); process.exit(1); }
      console.log('Version ' + current() + ' is consistent everywhere.');
    } else {
      if (arg) { if (!FORMAT.test(arg)) throw new Error(`"${arg}" is not a version like 14.52`); writeFileSync(path('VERSION'), arg + '\n'); }
      const changed = stamp(current(), true);
      console.log(changed.length ? `Version ${current()} stamped into: ${[...new Set(changed.map((c) => c.file))].join(', ')}` : `Version ${current()}: nothing to change.`);
      if (arg) console.log('Remember the CHANGELOG entry, and the tests that name a release (they read VERSION, so none should).');
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}

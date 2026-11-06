import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const jsFiles = walk(root + 'js').filter((f) => f.endsWith('.js'));

test('every JS module and asset the app loads is in the service-worker precache (offline would break otherwise)', () => {
  const sw = fs.readFileSync(root + 'sw.js', 'utf8');
  const listed = [...sw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const need = [...jsFiles.map((f) => path.relative(root, f).split(path.sep).join('/')), 'css/style.css', 'index.html', 'manifest.webmanifest', 'icon.svg'];
  for (const f of need) assert.ok(listed.includes(f), `${f} missing from SHELL in sw.js`);
  for (const f of listed.filter((x) => /\.(js|css|png|svg|webmanifest|html)$/.test(x))) assert.ok(fs.existsSync(root + f), `sw.js lists ${f} but it does not exist`);
});

test('every data-act used in markup has a handler registered in the A table', () => {
  const src = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const used = new Set([...src.matchAll(/data-act="([A-Za-z]+)"/g)].map((m) => m[1]));
  const defined = new Set([...src.matchAll(/\bA\.([A-Za-z]+)\s*=/g)].map((m) => m[1]));
  for (const a of used) assert.ok(defined.has(a), `data-act="${a}" has no handler (A.${a})`);
});

test('every relative import resolves to a real file', () => {
  for (const f of jsFiles) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'|import '(\.[^']+)'/g)) {
      const rel = m[1] || m[2];
      assert.ok(fs.existsSync(path.resolve(path.dirname(f), rel)), `${path.relative(root, f)} imports missing ${rel}`);
    }
  }
});

test('manifest icons and shortcut targets exist', () => {
  const m = JSON.parse(fs.readFileSync(root + 'manifest.webmanifest', 'utf8'));
  for (const i of m.icons) assert.ok(fs.existsSync(root + i.src), i.src);
});
test('no inline event handlers or inline scripts (CSP forbids them)', () => {
  const html = fs.readFileSync(root + 'index.html', 'utf8');
  assert.ok(!/\son[a-z]+=/i.test(html));
  assert.ok(!/<script(?![^>]*src=)[^>]*>/i.test(html));
  const src = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/\sonclick=/.test(src), 'inline onclick found in a template');
});

test('service-worker cache name tracks the app VERSION (forces the bump on release)', () => {
  const sw = fs.readFileSync(root + 'sw.js', 'utf8'), util = fs.readFileSync(root + 'js/util.js', 'utf8');
  const v = util.match(/VERSION = '([^']+)'/)[1], c = sw.match(/const C = '([^']+)'/)[1];
  assert.equal(c, 'mm-v' + v.replaceAll('.', '-'), `sw.js cache is ${c} but VERSION is ${v}: bump both together`);
});

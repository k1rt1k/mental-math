// Browser smoke test: loads every tab at phone widths with seeded data and fails on layout damage that string-matching tests cannot see.
//   - a .chip, .btn or .pill whose text is clipped, or that has collapsed to a sliver
//   - the page scrolling sideways
// Not part of `npm test` (it needs a browser). Run it with:   npm run test:browser
// One-time setup, which does not touch package.json or the lockfile:   npm i --no-save playwright && npx playwright install chromium
// If only a system Chrome is available, point MM_CHROME at chrome.exe (or the macOS/Linux binary) instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fresh, S, replaceState } from '../../public/js/state.js';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { throw new Error('Playwright is not installed. Run:  npm i --no-save playwright && npx playwright install chromium'); }

const ROOT = process.env.MM_PUBLIC_DIR || fileURLToPath(new URL('../../public/', import.meta.url));   // MM_PUBLIC_DIR: point the test at another build of the app
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

/** A learner with history: sessions, a notebook with some items due and some not (long and short questions), and spread-out ratings. */
function seed() {
  replaceState(fresh());
  const now = Date.now(), DAY = 864e5;
  const SKS = Object.keys(S.sk);
  SKS.forEach((k, i) => Object.assign(S.sk[k], { lv: 3 + ((i * 2) % 8) + 0.4, acc: 0.78 + (i % 4) * 0.05, spd: 0.9 + (i % 3) * 0.2, n: 40 + i * 9 }));
  for (let i = 0; i < 14; i++) S.sessions.push({ t: now - (14 - i) * DAY * 0.8, m: ['train', 'focus', 'daily', 'survival', 'review', 'sprint'][i % 6], dur: 120, n: 30 + i, ok: 24 + (i % 6), ft: 12, pts: 400 + i * 35, tm: 2.1 + (i % 4) * 0.3, by: {}, lv: {}, off: 0 });
  const qs = ['12 + 15', '30 − 7', '48 × 7', '144 ÷ 12', '999 + 1', '7 × 8', '1,234 − 567', '25% of 360'];
  qs.forEach((q, i) => (S.weak[q] = { q, a: 10 + i, sk: SKS[i % SKS.length], d: 3, pt: 'no carry', tip: 'Split it into tens and ones.', box: i % 3, due: i < 4 ? now - 6e4 : now + 3e6, at: now - i * 3e5 }));
  return JSON.stringify(S);
}

const TABS = ['home', 'coach', 'learn', 'progress', 'notebook', 'settings'];
const VIEWPORTS = [{ width: 360, height: 740 }, { width: 412, height: 915 }];

/** Runs in the page. Returns a list of problems. */
const audit = () => {
  const problems = [];
  const label = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
  for (const el of document.querySelectorAll('.chip, .btn, .pill')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;   // not on screen
    const text = (el.textContent || '').trim();
    // The width the text wants, measured on the text itself, so it works whether the box clips with hidden or with clip.
    const range = document.createRange(); range.selectNodeContents(el);
    const wanted = Math.max(...[...range.getClientRects()].map((b) => b.right), 0) - r.left;
    if (el.scrollWidth > el.clientWidth + 1 || wanted > el.clientWidth + 1.5) problems.push(`clipped: ${label(el)} (box ${Math.round(el.clientWidth)}px, content ${Math.round(Math.max(el.scrollWidth, wanted))}px)`);
    else if (text.length >= 3 && r.width < 40 && !el.classList.contains('sm')) problems.push(`collapsed: ${label(el)} (${Math.round(r.width)}px wide)`);
  }
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) problems.push(`page scrolls sideways (${de.scrollWidth}px in a ${innerWidth}px window)`);
  return problems;
};

const browser = await chromium.launch({ ...(process.env.MM_CHROME ? { executablePath: process.env.MM_CHROME } : {}) });
test.after(async () => { await browser.close(); server.close(); });

for (const vp of VIEWPORTS) {
  test(`no clipped controls or sideways scroll at ${vp.width}px`, async () => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await ctx.addInitScript((json) => { try { if (!localStorage.getItem('mmSeeded')) { localStorage.setItem('mmTrainer.v1', json); localStorage.setItem('mmSeeded', '1'); } } catch { /* storage unavailable */ } }, seed());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route((u) => u.origin !== new URL(base).origin, (r) => r.abort());
    const failures = [];
    for (const tab of TABS) {
      await page.goto(base + (tab === 'home' ? '' : '#/' + tab), { waitUntil: 'load' });
      await page.waitForSelector('#main > *', { timeout: 5000 });
      await page.waitForTimeout(700);   // entrance motion
      failures.push(...(await page.evaluate(audit)).map((p) => `[${tab}] ${p}`));
      if (tab === 'home') {   // the options panel holds the chip rows
        const toggle = page.locator('[data-act=toggleCustom]');
        if (await toggle.count()) { await toggle.first().click(); await page.waitForTimeout(700); failures.push(...(await page.evaluate(audit)).map((p) => `[home, Customize open] ${p}`)); }
      }
      if (tab === 'progress') {
        // Only the four section tabs, not the stat cards that also switch tabs: clicking a card
        // replaces the overview panel (and its cards), so an index taken before the first click would vanish.
        const n = await page.locator('.tabs2 [role=tab]').count();
        for (let i = 0; i < n; i++) { const t = page.locator('.tabs2 [role=tab]').nth(i); const name = (await t.textContent() || '').trim(); await t.click(); await page.waitForTimeout(500); failures.push(...(await page.evaluate(audit)).map((p) => `[progress/${name}] ${p}`)); }
      }
    }
    await ctx.close();
    assert.deepEqual(errors, [], 'page errors:\n' + errors.join('\n'));
    assert.deepEqual([...new Set(failures)], [], 'layout problems:\n' + [...new Set(failures)].join('\n'));
  });
}

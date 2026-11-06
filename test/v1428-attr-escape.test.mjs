// Every ${...} written inside an HTML attribute value must go through esc(), unless it is a number, a boolean or one of our own fixed words.
// A synced or imported entry with a quote in it would otherwise close the attribute and break the markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { esc } from '../public/js/util.js';

const dir = new URL('../public/js/', import.meta.url);
const files = [...readdirSync(dir).filter((f) => f.endsWith('.js')), ...readdirSync(new URL('views/', dir)).filter((f) => f.endsWith('.js')).map((f) => 'views/' + f)];

// Attributes that carry text. Style, class, geometry and aria-pressed/selected/checked/expanded take numbers, booleans or fixed words, so they are not checked.
const TEXT_ATTR = /^(data-[\w-]+|name|id|title|aria-label|aria-labelledby|aria-controls|aria-describedby|value|type|href|src|placeholder|for|alt)$/;

// Expressions that are known to be numbers or fixed words. A new one has to be added here on purpose.
const SAFE = new Set([
  'n', 'a', 'b', 'i', 'a * b', 'pi', 'lv', 'w.box', 'MASTER_BOX', 'sess.lives', 'pr.cur', 'pr.goal', 'runs',
  "runs == 1 ? 'session' : 'sessions'", "st ? st + '-day streak' : 'No streak yet'", "n ? ', ' + due + ' to review' : ''",
  "p.done ? ', done' : ''", "skOpen() ? 'hide' : 'show'",
  'fmt(mn)', 'fmt(mx)', 'fmt(v[v.length - 1])', 'heatWeeks()', 'ymd(t)', 'ymd(x.t)', 'Number(ol[2])', 'Number(f[2]).toFixed(3)',
  'pts(P, tips)',   // escapes inside the helper
]);

function findings(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(?<![\w-])([\w-]+)=\\?(["'])/g)) {
      if (!TEXT_ATTR.test(m[1])) continue;
      const rest = line.slice(m.index + m[0].length);
      let end = rest.indexOf(m[2]);
      while (end > 0 && rest[end - 1] === '\\') end = rest.indexOf(m[2], end + 1);
      const val = end >= 0 ? rest.slice(0, end) : rest;
      for (const e of val.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
        const x = e[1].trim();
        if (x.startsWith('esc(') || SAFE.has(x) || /^\w+\.length$/.test(x) || /^o \? ' · ' \+ o\.ok/.test(x) || /^\d+$/.test(x)) continue;
        out.push({ line: i + 1, attr: m[1], expr: x });
      }
    }
  });
  return out;
}

test('every text attribute value built from data goes through esc()', () => {
  const bad = [];
  for (const f of files) for (const x of findings(readFileSync(new URL(f, dir), 'utf8'))) bad.push(`${f}:${x.line} ${x.attr}="\${${x.expr}}"`);
  assert.deepEqual(bad, [], 'wrap these in esc(), or add the expression to SAFE if it is always a number or a fixed word:\n' + bad.join('\n'));
});

test('the checker itself flags a raw value and accepts an escaped one', () => {
  assert.equal(findings('`<b data-v="${w.q}">`').length, 1);
  assert.equal(findings('`<b data-v="${esc(w.q)}">`').length, 0);
  assert.equal(findings("'<b title=\\\"${t}\\\">'").length, 1);
});

test('esc makes a quote inert inside an attribute', () => {
  const html = `<b data-v="${esc('a" onclick="x')}">`;
  assert.equal(html, '<b data-v="a&quot; onclick=&quot;x">');
});

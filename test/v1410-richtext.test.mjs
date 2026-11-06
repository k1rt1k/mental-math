import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRich, latexToText } from '../public/js/richtext.js';

test('LaTeX from Gemini becomes readable symbols, not raw commands', () => {
  const h = renderRich('You know $9 \\times 20 = 180$ and $17 \\pmod 9$; $182 \\div 7$, $\\frac{a+b}{2}$, $x^2$.');
  assert.ok(!/\\|\$/.test(h.replace(/<[^>]+>/g, '')), h);
  for (const t of ['9 × 20 = 180', '17 (mod 9)', '182 ÷ 7', '(a+b)/2', 'x²']) assert.ok(h.includes(t), t);
  assert.equal(latexToText('3 \\rightarrow 4 \\leq 5'), '3 → 4 ≤ 5');
});

test('prices are not mistaken for maths', () => {
  const h = renderRich('It costs $5 and $6 in total.');
  assert.ok(h.includes('$5 and $6') && !h.includes('class="mt"'));
});

test('markdown: numbered lists keep their numbers, rules, italics, bold, tables', () => {
  const h = renderRich('1. **One**\n\n2. Two\n\n---\n\n*note*\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(h, /<ol><li value="1"><b>One<\/b><\/li><li value="2">Two<\/li><\/ol>/);
  assert.ok(h.includes('<hr>') && h.includes('<i>note</i>') && h.includes('<table>'));
});

test('HTML in model output is escaped', () => {
  const h = renderRich('<img src=x onerror=alert(1)> **b** `<script>`');
  assert.ok(!h.includes('<img') && !h.includes('<script'));
});

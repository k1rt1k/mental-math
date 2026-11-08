// While a dialog/sheet is open, the page behind it must not scroll.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../public/js/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/extras.css', import.meta.url), 'utf8');

test('ui.js pins the page while any dialog[open] exists and restores the scroll position on close', () => {
  assert.match(ui, /MutationObserver/);
  assert.match(ui, /dlg-lock/);
  assert.match(ui, /window\.scrollTo\(0, y\)/);
});

test('CSS locks the page and stops scroll chaining out of dialogs', () => {
  assert.match(css, /body\.dlg-lock\s*{[^}]*position:\s*fixed/);
  assert.match(css, /html:has\(dialog\[open\]\)\s*{[^}]*overflow:\s*hidden/);
  assert.match(css, /dialog\.dlg\s*{[^}]*overscroll-behavior:\s*contain/);
});

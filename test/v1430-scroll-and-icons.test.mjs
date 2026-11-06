import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('scroll-state class never collides with the shortcuts .sc grid', () => {
  assert.doesNotMatch(read('js/motion.js'), /classList\.toggle\('sc'/);
  assert.match(read('js/motion.js'), /classList\.toggle\('scrolled'/);
  assert.doesNotMatch(read('css/motion.css'), /^\.sc /m);
  assert.match(read('css/style.css'), /^dl\.sc \{/m);
});

test('no colour emoji in shipped UI code', () => {
  const emoji = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u;
  for (const f of ['js/views/home.js', 'js/views/coach.js', 'js/views/progress.js', 'js/views/learn.js', 'js/stats.js', 'js/ui.js'])
    assert.doesNotMatch(read(f), emoji, f);
});

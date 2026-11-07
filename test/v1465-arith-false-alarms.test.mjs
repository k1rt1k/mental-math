import test from 'node:test';
import assert from 'node:assert/strict';
import { checkArithmetic, quotedLearnerAnswers } from '../netlify/lib/ailogic.mjs';

test('a chain broken up by powers is not judged from its middle', () => {
  for (const ok of [
    '7³ = 7² × 7 = 49 × 7 = 343.',
    '12³ = 12² × 12 = 144 × 12 = 1728',
    'x = −5 + 8 = 3',
  ]) assert.deepEqual(checkArithmetic(ok).flags, [], ok);
});

test('the whole tail of such a chain is still checked for real mistakes', () => {
  assert.equal(checkArithmetic('7³ = 7² × 7 = 49 × 7 = 353.').flags.length, 1);
  assert.equal(checkArithmetic('12³ = 12² × 12 = 144 × 12 = 1738').flags.length, 1);
});

test('quoting the learner\'s own wrong answer is not an AI mistake', () => {
  for (const ok of [
    'You rush the ones digit, as seen when you answered 1575 ÷ 25 = 66 instead of 63.',
    'You typed 66 but 1575 ÷ 25 = 63.',
    'Entered 7 × 8 = 54 rather than 56.',
  ]) assert.deepEqual(checkArithmetic(ok).flags, [], ok);
  // a cue in an EARLIER sentence does not excuse a later wrong equation
  assert.equal(checkArithmetic('You answered 66. Note 1575 ÷ 25 = 66.').flags.length, 1);
});

test('the app\'s own list of typed wrong answers is trusted exactly', () => {
  const quoted = quotedLearnerAnswers({ missList: [{ q: '1575 ÷ 25', a: 63, ty: 66 }, { q: '9 × 9', a: 81, ty: '' }, { q: '6 × 7', a: 42, ty: null }] });
  assert.deepEqual(quoted, ['1575 ÷ 25 = 66']);
  assert.deepEqual(checkArithmetic('A slip like 1575÷25 = 66 happens.', { quoted }).flags, []);
  assert.equal(checkArithmetic('A slip like 1575÷25 = 67 happens.', { quoted }).flags.length, 1);
});

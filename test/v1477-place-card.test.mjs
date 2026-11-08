import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh, replaceState } from '../public/js/state.js';
import { canPlace, applyPlacement, recordCheck, progress } from '../public/js/paths.js';

test('the starting-stage card is offered only before any stage is passed', () => {
  replaceState(fresh());
  assert.equal(canPlace('add'), true, 'untouched path');
  recordCheck('add', 0, 'check', { pass: true, n: 5, correct: 5 }, 1e12);
  assert.equal(progress('add').cur, 1);
  assert.equal(canPlace('add'), false, 'a passed stage means the path already has a starting point');
  replaceState(fresh());
  applyPlacement('sub', 0, 2, 1e12);
  assert.equal(canPlace('sub'), false, 'after the quiz cleared stages the card goes away');
});

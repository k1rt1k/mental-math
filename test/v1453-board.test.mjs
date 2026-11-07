import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, leave, postScore, readBoard, validDay, cleanName, BOARD } from '../netlify/lib/board.mjs';

// A store that behaves like Netlify Blobs for what the board uses: ETags, onlyIfMatch / onlyIfNew, list, delete.
function fakeStore() {
  const m = new Map(); let v = 0;
  return {
    m,
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k).d) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: JSON.parse(m.get(k).d), etag: m.get(k).e } : null),
    setJSON: async (k, d, o = {}) => {
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!m.has(k) || m.get(k).e !== o.onlyIfMatch)) return { modified: false };
      m.set(k, { d: JSON.stringify(d), e: 'e' + ++v }); return { modified: true };
    },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    delete: async (k) => { m.delete(k); },
  };
}
const NOW = Date.parse('2026-11-07T12:00:00Z'), DAY = '2026-11-07', ana = { id: 'ana' }, ben = { id: 'ben' }, cy = { id: 'cy' };

test('nothing is stored or shown until a learner joins', async () => {
  const st = fakeStore();
  assert.deepEqual(await postScore(st, ana, { day: DAY, pts: 100, n: 10, ok: 9 }, NOW), { ok: true, member: false });
  assert.equal(st.m.size, 0, 'a non-member score is not stored');
  assert.deepEqual(await readBoard(st, ana, DAY), { member: false, day: DAY });
});

test('members see each other, ranked by points, with the viewer marked and the others still to play', async () => {
  const st = fakeStore();
  await join(st, ana, 'Ana', NOW); await join(st, ben, 'Ben', NOW); await join(st, cy, 'Cy', NOW);
  await postScore(st, ana, { day: DAY, pts: 120, n: 20, ok: 18 }, NOW);
  await postScore(st, ben, { day: DAY, pts: 150, n: 22, ok: 21 }, NOW);
  const b = await readBoard(st, ana, DAY);
  assert.deepEqual(b.board.map((x) => [x.name, x.pts, x.you]), [['Ben', 150, false], ['Ana', 120, true]]);
  assert.deepEqual(b.waiting, ['Cy']);
  assert.equal(JSON.stringify(b).includes('"t"'), false, 'timestamps are not exposed');
});

test('a day keeps the learner’s best score only', async () => {
  const st = fakeStore(); await join(st, ana, 'Ana', NOW);
  await postScore(st, ana, { day: DAY, pts: 200, n: 20, ok: 20 }, NOW);
  await postScore(st, ana, { day: DAY, pts: 90, n: 9, ok: 9 }, NOW);
  assert.equal((await readBoard(st, ana, DAY)).board[0].pts, 200);
});

test('leaving removes the name and every stored score; scores of someone who left never show', async () => {
  const st = fakeStore(); await join(st, ana, 'Ana', NOW); await join(st, ben, 'Ben', NOW);
  await postScore(st, ana, { day: DAY, pts: 100, n: 10, ok: 10 }, NOW);
  await postScore(st, ben, { day: DAY, pts: 50, n: 5, ok: 5 }, NOW);
  assert.deepEqual(await leave(st, ana), { ok: true });
  assert.deepEqual((await readBoard(st, ben, DAY)).board.map((x) => x.name), ['Ben']);
  assert.equal(JSON.stringify([...st.m.values()]).includes('"ana"'), false);
  assert.deepEqual(await readBoard(st, ana, DAY), { member: false, day: DAY });
});

test('a learner whose key was turned off is hidden even though their record remains', async () => {
  const st = fakeStore(); await join(st, ana, 'Ana', NOW); await join(st, ben, 'Ben', NOW);
  await postScore(st, ben, { day: DAY, pts: 50, n: 5, ok: 5 }, NOW);
  assert.deepEqual((await readBoard(st, ana, DAY, new Set(['ana']))).board, []);
});

test('names are cleaned, must be unique, and the board has a size limit', async () => {
  assert.equal(cleanName(' <Ana> \n"B"  '), 'Ana B');
  assert.equal(cleanName('x'.repeat(50)).length, BOARD.NAME_MAX);
  const st = fakeStore();
  assert.equal((await join(st, ana, 'A', NOW)).status, 400);
  assert.equal((await join(st, ana, 'Ana', NOW)).ok, true);
  assert.equal((await join(st, ben, ' ana ', NOW)).status, 409);
  assert.equal((await join(st, ana, 'Ana B', NOW)).ok, true, 'renaming is allowed');
  for (let i = 0; i < BOARD.MAX_MEMBERS; i++) await join(st, { id: 'x' + i }, 'Name ' + i, NOW);
  assert.equal((await join(st, { id: 'late' }, 'Late', NOW)).status, 409);
});

test('only plausible days and scores are accepted', async () => {
  assert.equal(validDay('2026-11-07', NOW) && validDay('2026-11-08', NOW) && validDay('2026-11-06', NOW), true);
  for (const d of ['2026-11-09', '2026-02-30', '2026-1-7', '', undefined, '2026-11-07T00:00']) assert.equal(validDay(d, NOW), false, String(d));
  const st = fakeStore(); await join(st, ana, 'Ana', NOW);
  for (const bad of [{ pts: -1, n: 1, ok: 1 }, { pts: 1.5, n: 1, ok: 1 }, { pts: 1e9, n: 1, ok: 1 }, { pts: 5, n: 3, ok: 4 }, { pts: '5', n: 3, ok: 3 }])
    assert.equal((await postScore(st, ana, { day: DAY, ...bad }, NOW)).status, 400, JSON.stringify(bad));
});

test('old days are dropped when a new score arrives', async () => {
  const st = fakeStore(); await join(st, ana, 'Ana', NOW);
  st.m.set('day-2026-10-01', { d: '{"entries":{}}', e: 'x' });
  await postScore(st, ana, { day: DAY, pts: 10, n: 1, ok: 1 }, NOW);
  assert.equal(st.m.has('day-2026-10-01'), false);
  assert.equal(st.m.has('day-' + DAY), true);
});

test('simultaneous scores do not overwrite each other', async () => {
  const st = fakeStore(); await join(st, ana, 'Ana', NOW); await join(st, ben, 'Ben', NOW);
  await Promise.all([postScore(st, ana, { day: DAY, pts: 10, n: 1, ok: 1 }, NOW), postScore(st, ben, { day: DAY, pts: 20, n: 2, ok: 2 }, NOW)]);
  assert.equal((await readBoard(st, ana, DAY)).board.length, 2);
});

test('the client sends nothing unless this device joined, and the service worker precaches the module', () => {
  const b = readFileSync(new URL('../public/js/board.js', import.meta.url), 'utf8');
  assert.match(b, /if \(!boardHint\(\)\) return null;/);
  assert.match(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), /'js\/board\.js'/);
  assert.match(readFileSync(new URL('../netlify/functions/board.mjs', import.meta.url), 'utf8'), /path: "\/api\/board"/);
});

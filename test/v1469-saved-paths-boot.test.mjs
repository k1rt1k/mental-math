// Regression: loading saved state at module startup must not touch consts that are defined further down state.js.
// With saved path progress, cleanPaths ran before cleanStage existed and the whole app stayed on a blank screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const stateUrl = new URL('../public/js/state.js', import.meta.url).href;

test('the app boots when localStorage already holds guided-path progress (new and v14.47 shapes)', () => {
  const saved = {
    paths: {
      add: { st: [{ ph: 3, pass: 1700000000000, sc: 0.9, at: 1 }], ret: [{ t: 5, ok: 1 }] },
      mul: { 1: { demo: 1, pass: 1700000000000, n: 10, ft: 8 }, 2: { demo: 1, pass: 0, n: 5, ft: 2 } },
    },
  };
  const code = `
    globalThis.localStorage = { 'mmTrainer.v14.singleUserState.v1': '1', 'mmTrainer.v1': ${JSON.stringify(JSON.stringify(saved))} };
    const m = await import(${JSON.stringify(stateUrl)});
    console.log(JSON.stringify({ add: m.S.paths.add.st[0].ph, mulPassed: m.S.paths.mul.st[0].ph, stages: m.S.paths.mul.st.length }));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), { add: 3, mulPassed: 3, stages: 5 });
});

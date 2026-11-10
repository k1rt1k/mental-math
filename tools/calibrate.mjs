// Calibration report: `node tools/calibrate.mjs [sessions] [seed]`.
// Prints the four-persona simulation and exits non-zero if a calibration guardrail breaks.
import { report, PERSONAS } from './sim.mjs';
import { IDS } from '../public/js/engine.js';

const sessions = Math.max(6, Math.round(+(process.argv[2] || 24)));
const seed = Math.round(+(process.argv[3] || 7));
const rows = report({ sessions, seed });

const pct = (x) => (100 * x).toFixed(0) + '%';
const num = (x, n = 2) => (+x).toFixed(n);

const head = ['persona', 'acc', 'late acc', 'avg lv', 'jump', 'cold', 'rough', 'skills', 'min', 'patterns', 'top pattern', 'top', 'MAE', 'rank'];
const table = rows.map((r) => [
  r.persona, pct(r.avgAccuracy), pct(r.lateAccuracy), num(r.finalAvgDifficulty), num(r.maxDifficultyJump, 1),
  String(r.worstColdStreak), String(r.roughSessions), `${r.skillsSeen}/${IDS.length}`, String(r.minSkill), String(r.patterns),
  r.topPattern || '–', pct(r.topShare), num(r.mae, 2), r.rankCorrelation ? num(r.rankCorrelation, 2) : 'n/a',
]);
const widths = head.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)));
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
console.log(line(head));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
table.forEach((r) => console.log(line(r)));
console.log(`\n${sessions} sessions per persona, seed ${seed}.`);

const fails = [];
rows.forEach((r) => {
  const tag = r.persona;
  if (r.skillsSeen !== IDS.length) fails.push(`${tag}: only ${r.skillsSeen}/${IDS.length} skills were served`);
  if (r.minSkill < 4) fails.push(`${tag}: a skill got only ${r.minSkill} questions`);
  if (r.maxDifficultyJump > 2) fails.push(`${tag}: difficulty jumped ${num(r.maxDifficultyJump, 1)} levels in a session`);
  if (r.worstColdStreak > 8) fails.push(`${tag}: cold streak of ${r.worstColdStreak} questions`);
  if (r.roughSessions > Math.max(2, Math.floor(sessions * 0.2))) fails.push(`${tag}: ${r.roughSessions} rough sessions (<50% accuracy)`);
  if (r.lateAccuracy < 0.55) fails.push(`${tag}: late accuracy ${pct(r.lateAccuracy)} is too low`);
  if (r.topShare > 0.35) fails.push(`${tag}: pattern "${r.topPattern}" is ${pct(r.topShare)} of questions`);
  if (r.patterns < 8) fails.push(`${tag}: only ${r.patterns} distinct patterns served`);
  if (r.mae > 1.15) fails.push(`${tag}: rating misses the latent level by ${num(r.mae, 2)} on average`);
  if (PERSONAS[r.persona.toLowerCase()] && r.persona === 'Uneven' && r.rankCorrelation < 0.7) fails.push(`${tag}: rating order does not track ability (rho ${num(r.rankCorrelation, 2)})`);
});

if (fails.length) {
  console.error('\nCalibration guardrails failed:');
  fails.forEach((f) => console.error(' - ' + f));
  process.exitCode = 1;
} else {
  console.log('All calibration guardrails passed.');
}

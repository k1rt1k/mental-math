// Daily leaderboard, client side. Opt-in: nothing is sent unless this learner joined (Settings, Cloud sync).
import { esc } from './util.js';
import { syncKey, boardApi } from './sync.js';

// A per-device hint that this learner joined, so a Daily on a device that never joined sends nothing. The server is the authority.
const HINT = 'mmTrainer.board';
export const boardHint = () => { try { return !!syncKey() && localStorage[HINT] === '1'; } catch (e) { return false; } };
export const setBoardHint = (on) => { try { if (on) localStorage[HINT] = '1'; else localStorage.removeItem(HINT); } catch (e) { /* private mode */ } };
export const boardWhy = (r) => (r.status === 0 ? 'Could not reach the server.' : r.status === 429 ? (r.json && r.json.error) || 'Too many wrong keys. Try again later.' : r.status === 401 ? 'The sync key was not accepted.' : (r.json && r.json.error) || 'That did not work.');

/** Report a finished Daily, then return the board for that day (or null when this learner is not on it). */
export async function reportDaily(e) {
  if (!boardHint()) return null;
  await boardApi('POST', { body: { day: e.day, pts: Math.round(e.pts), n: e.n, ok: e.ok } });
  return loadBoard(e.day);
}
export async function loadBoard(day) {
  const r = await boardApi('GET', { query: '?day=' + encodeURIComponent(day) });
  if (r.status === 200) { setBoardHint(!!r.json.member); return r.json.member ? r.json : null; }
  return r.status === 0 ? { offline: true } : { error: boardWhy(r) };
}

export function boardHtml(b) {
  if (!b) return '';
  if (b.offline) return '<p class="mu" style="margin:0">Could not reach the board. Your score is saved on this device.</p>';
  if (b.error) return `<p class="mu" style="margin:0">${esc(b.error)}</p>`;
  const rows = b.board.map((x, i) => `<tr${x.you ? ' class="you" aria-current="true"' : ''}><td class="r">${i + 1}<td>${esc(x.name)}${x.you ? ' <span class="mu">(you)</span>' : ''}<td class="r num">${x.pts}<td class="r mu">${x.ok}/${x.n}</tr>`).join('');
  return `${b.board.length ? `<div class="tbl"><table><tr><th class="r">#<th>Learner<th class="r">Points<th class="r">Right</tr>${rows}</table></div>` : '<p class="mu" style="margin:0">Nobody has played today’s Daily yet.</p>'}${b.waiting && b.waiting.length ? `<p class="mu" style="margin:10px 0 0">Still to play: ${b.waiting.map(esc).join(', ')}</p>` : ''}`;
}

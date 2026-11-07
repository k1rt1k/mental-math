// Daily leaderboard, client side. Opt-in: nothing is sent unless this learner joined (Settings, Cloud sync).
import { esc } from './util.js';
import { syncKey, boardApi } from './sync.js';
import { ymd } from './util.js';
import { queueAdd, queueClean, queueDrop, rankChange, moveText } from './boardlogic.js';

// A per-device hint that this learner joined, so a Daily on a device that never joined sends nothing. The server is the authority.
const HINT = 'mmTrainer.board';
export const boardHint = () => { try { return !!syncKey() && localStorage[HINT] === '1'; } catch (e) { return false; } };
export const setBoardHint = (on) => { try { if (on) localStorage[HINT] = '1'; else { localStorage.removeItem(HINT); localStorage.removeItem(QKEY); } } catch (e) { /* private mode */ } };   // leaving, or a different learner's key, also forgets any unsent score

// Dailies finished while the server could not be reached wait here (this device only) and go out when it can.
const QKEY = 'mmTrainer.boardQ';
const qRead = () => { try { return queueClean(JSON.parse(localStorage[QKEY] || '[]'), ymd()); } catch (e) { return []; } };
const qWrite = (q) => { try { if (q.length) localStorage[QKEY] = JSON.stringify(q); else localStorage.removeItem(QKEY); } catch (e) { /* private mode */ } };
export const boardQueued = () => qRead().length;
let flushing = null;
/**
 * Send every waiting score. A score leaves the queue when the server took it (or said it never will: a rejected score, or this
 * learner is not on the board). It stays on a network failure, a wrong-key lock, a busy server or a bad key, and expires after two days.
 * Returns how many were sent. Safe to call at any time and more than once at once.
 */
export function flushBoardQueue() {
  if (!boardHint()) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const x of qRead()) {
      const r = await boardApi('POST', { body: { day: x.day, pts: x.pts, n: x.n, ok: x.ok } });
      if (r.status === 0 || r.status === 429) break;                                  // still offline, or locked out: try again later
      if (r.status === 200) { qWrite(queueDrop(qRead(), x.day)); if (r.json.member === false) { setBoardHint(false); break; } sent++; }
      else if (r.status === 400) qWrite(queueDrop(qRead(), x.day));                   // the server will never take this one
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}
export const boardWhy = (r) => (r.status === 0 ? 'Could not reach the server.' : r.status === 429 ? (r.json && r.json.error) || 'Too many wrong keys. Try again later.' : r.status === 401 ? 'The sync key was not accepted.' : (r.json && r.json.error) || 'That did not work.');

/**
 * Report a finished Daily, then return the board for that day (or null when this learner is not on it).
 * The score is queued first, so closing the app or losing the connection never loses it. The result carries `moved` (see rankChange)
 * when this score moved the learner up, and `queued: true` when the score is still waiting to be sent.
 */
export async function reportDaily(e) {
  if (!boardHint()) return null;
  qWrite(queueAdd(qRead(), e, ymd()));
  const b0 = await loadBoard(e.day);                          // where the learner stood before this score
  if (b0 && (b0.offline || b0.error)) return { ...b0, queued: true };
  await flushBoardQueue();
  const b1 = await loadBoard(e.day);
  if (!b1 || b1.offline || b1.error) return b1 ? { ...b1, queued: boardQueued() > 0 } : b1;
  return { ...b1, moved: rankChange(b0 && b0.board, b1.board), queued: boardQueued() > 0 };
}
export async function loadBoard(day) {
  const r = await boardApi('GET', { query: '?day=' + encodeURIComponent(day) });
  if (r.status === 200) { setBoardHint(!!r.json.member); return r.json.member ? r.json : null; }
  return r.status === 0 ? { offline: true } : { error: boardWhy(r) };
}

export function boardHtml(b) {
  if (!b) return '';
  if (b.offline) return `<p class="mu" style="margin:0">${b.queued ? 'Could not reach the board. Your score is saved on this device and will be sent when you are back online.' : 'Could not reach the board.'}</p>`;
  if (b.error) return `<p class="mu" style="margin:0">${esc(b.error)}${b.queued ? ' Your score is saved on this device and will be sent later.' : ''}</p>`;
  const mv = b.moved, climb = mv && mv.up ? ` style="--n:${Math.min(mv.up, 6)}"` : '';
  const rows = b.board.map((x, i) => `<tr${x.you ? ` class="you${mv ? ' climb' : ''}" aria-current="true"${climb}` : ''}><td class="r">${i + 1}<td>${esc(x.name)}${x.you ? ' <span class="mu">(you)</span>' : ''}<td class="r num">${x.pts}<td class="r mu">${x.ok}/${x.n}</tr>`).join('');
  const banner = mv ? `<div class="bmove" role="status"><span class="bmi" aria-hidden="true">${mv.first ? '★' : '▲'}</span><span>${esc(moveText(mv))}</span></div>` : '';
  return `${banner}${b.board.length ? `<div class="tbl"><table><tr><th class="r">#<th>Learner<th class="r">Points<th class="r">Right</tr>${rows}</table></div>` : '<p class="mu" style="margin:0">Nobody has played today’s Daily yet.</p>'}${b.waiting && b.waiting.length ? `<p class="mu" style="margin:10px 0 0">Still to play: ${b.waiting.map(esc).join(', ')}</p>` : ''}`;
}

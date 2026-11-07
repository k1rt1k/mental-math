import { S, save, replaceState, mergeStates, asCurrent, stampWipe, fresh, avgLv, migrate, devicePrefs } from '../state.js';
import { IDS, SK } from '../engine.js';
import { esc, ymd, clamp, ago } from '../util.js';
import { A, register, go, view } from '../nav.js';
import { dialog, confirmDlg, typedConfirmDlg, promptDlg, choiceDlg, toast, download, icon } from '../ui.js';
import { ib } from '../info.js';
import { applyTheme, ACC, FONTS, padOn, isTouch } from '../theme.js';
import { boardHint, setBoardHint, boardWhy, loadBoard, boardHtml } from '../board.js';
import { boardApi, syncKey, setSyncKey, pull, syncNow, statusText, status, fetchBackup, keyProblem, isWeakKey, keysApi, MIN_KEY_LENGTH } from '../sync.js';
import { state as remState, enable as remEnable, disable as remDisable, test as remTest, rem as remGet, setRem, isStandalone, isIOS } from '../notify.js';

const seg = (act, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button aria-pressed="${cur == v}" data-act="${esc(act)}" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
const row = (t, d, key, on) => `<div class="set"><div><div class="t"><span id="l-${esc(key)}">${t}</span>${ib('s.' + key)}</div><div class="d">${d}</div></div><button class="sw" role="switch" aria-checked="${on}" aria-labelledby="l-${esc(key)}" data-act="tog" data-v="${esc(key)}"></button></div>`;
// "noX" keys are stored inverted so existing data keeps its meaning.
const INV = new Set(['noBlur', 'noCd', 'noHap', 'noGrace']);
const get = (k) => (INV.has(k) ? !S[k] : !!S[k]);

let bd = null;   // this learner's board membership as the server last said: null (unknown) | { member, name }
let rs = null;   // reminder state, resolved asynchronously: unsupported | ios-install | denied | off | on
const hh = (t) => String(t.h).padStart(2, '0') + ':' + String(t.m).padStart(2, '0');
const DN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], DFULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], ORDER = [1, 2, 3, 4, 5, 6, 0];
function remindersCard() {
  const r = remGet();
  const head = `<section class="card"><h3>Reminders${ib('s.remind')}</h3>`;
  if (rs === null) return head + '<p class="mu" style="margin-top:8px">Checking…</p></section>';
  const note = (t) => `<p class="mu" style="margin:8px 0 0;max-width:56ch">${t}</p>`;
  if (rs == 'unsupported') return head + note('This browser cannot show reminders when the app is closed. Try Chrome, Edge, Firefox or Safari 16.4+, and install the app.') + '</section>';
  if (rs == 'ios-install') return head + note('On iPhone and iPad, reminders work once the app is on your Home Screen.') + `<div class="btns" style="margin-top:12px"><button class="btn sm" data-act="iosHelp">Show me how</button></div></section>`;
  if (rs == 'denied') return head + note('Notifications are blocked for this app. Allow them in your browser or phone settings, then come back.') + '</section>';
  if (rs == 'on') return head + `
      <div class="set" style="align-items:flex-start"><div><div class="t">Times</div><div class="d">Your local time. Up to 3 a day.</div></div>
        <div class="btns" style="justify-content:flex-end">${r.times.map((t, i) => `<button class="btn sm" data-act="remTime" data-v="${esc(i)}" aria-label="Change ${esc(hh(t))}">${hh(t)}</button>`).join('')}${r.times.length < 3 ? `<button class="btn sm ghost" data-act="remAdd" aria-label="Add a time">+ Add</button>` : ''}</div></div>
      <div class="set" style="align-items:flex-start"><div><div class="t">Repeat on</div><div class="d">${r.days.length == 7 ? 'Every day' : r.days.length + ' days a week'}</div></div>
        <div class="chips" role="group" aria-label="Days of the week">${ORDER.map((d) => `<button class="chip" style="min-width:36px;padding:5px 0;justify-content:center" aria-pressed="${r.days.includes(d)}" aria-label="${esc(DFULL[d])}" data-act="remDay" data-v="${esc(d)}">${DN[d]}</button>`).join('')}</div></div>
      ${row('Skip if I already practised', 'No nudge on days you have already played.', 'remSkip', r.skip)}
      ${row('Streak rescue', 'One extra nudge at 20:30 when a streak of 3+ days is at risk.', 'remSave', r.save)}
      <div class="btns" style="margin-top:12px"><button class="btn sm" data-act="remTest">Send a test</button><button class="btn sm danger" data-act="remOff">Turn off</button></div></section>`;
  return head + note('Get a nudge at the times you choose, on the days you choose. Works even when the app is closed.') + `<div class="btns" style="margin-top:12px"><button class="btn sm primary" data-act="remOn">${icon('bulb')} Turn on reminders</button></div></section>`;
}
const loadRem = () => remState().then((x) => { if (x !== rs) { rs = x; if (view.scr == 'settings') settings(); } });

const loadBoardState = () => { bd = { member: false }; loadBoard(ymd()).then((b) => { bd = b && b.member ? b : { member: false }; if (view.scr == 'settings') settings(); }); };
function settings() {
  document.title = 'Settings · Mental Math';
  if (rs === null) loadRem();
  if (bd === null && syncKey()) loadBoardState();
  const goal = S.goal || 2, pad = S.pad == null ? 'auto' : S.pad ? 'on' : 'off', th = S.theme || 'auto';
  const grp = (id, title, sub, inner) => `<section class="sgrp" data-grp="${esc(id)}" aria-labelledby="g-${esc(id)}"><h2 class="sg" id="g-${esc(id)}">${title}<span class="sub">${sub}</span></h2>${inner}</section>`;
  const cols = (l, r) => `<div class="g g2" style="align-items:start"><div class="g">${l}</div><div class="g">${r}</div></div>`;
  document.querySelector('#main').innerHTML = `
  <div class="hd"><h1>Settings</h1></div>
  <div class="sfind"><input id="sq" class="inp" type="search" placeholder="Search settings" aria-label="Search settings" autocomplete="off" spellcheck="false" value="${esc(sq)}">
    <nav class="chips sjump" aria-label="Jump to a group">${GROUPS.map(([id, t]) => `<button class="chip" data-act="sjump" data-v="${esc(id)}">${t}</button>`).join('')}</nav></div>
  ${grp('look', 'Look and feel', 'Theme, colours and text', cols(`<section class="card"><h3>Appearance</h3>
      <div class="field"><div class="mu">Theme</div>${seg('theme', th, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['black', 'Black']])}</div>
      <div class="field"><div class="mu">Accent</div><div class="chips" role="radiogroup" aria-label="Accent colour">${Object.entries(ACC).map(([k, [c]]) => `<button class="swatch" role="radio" aria-checked="${(S.acc || 'blue') == k}" aria-label="${esc(k)}" data-act="acc" data-v="${esc(k)}" style="background:${c};color:${c}"></button>`).join('')}</div></div>
      <div class="field"><div class="mu">Question font</div><div>${seg('font', S.font || 'serif', Object.entries(FONTS))}<div class="fontprev" aria-hidden="true">47 × 38</div></div></div>
      <div class="field"><div class="mu">Text size</div>${seg('ts', S.ts || 'm', [['m', 'Normal'], ['l', 'Large'], ['xl', 'Largest']])}</div>
      ${row('Reduce motion', 'No sliding, shaking or confetti.', 'rm', get('rm'))}
      ${row('High contrast', 'Stronger text and borders for bright rooms or low vision.', 'hc', get('hc'))}
      ${row('Colour-blind friendly colours', 'Right is blue and wrong is orange, instead of green and red.', 'cb', get('cb'))}
      ${row('Larger answer text', 'Bigger digits in the answer box while you play.', 'bigA', get('bigA'))}
      ${row('Focus layout', 'Hide the side panel and race bar while you play.', 'zen', get('zen'))}
    </section>`, `<section class="card pv" data-k="preview"><h3>Preview</h3>
      <div class="pv-box" role="img" aria-label="Preview of the question, answer and colours with your current choices">
        <div class="pv-q">47 × 38</div>
        <div class="pv-a">1786<i></i></div>
        <div class="pv-row"><span class="pill ok">Right</span><span class="pill bad">Wrong</span><span class="pv-btn">Accent</span></div>
        <p class="pv-t">The quick fox solves 12 × 12 in your head.</p>
      </div>
      <p class="mu pv-n">Updates as you change theme, accent, font, text size, contrast and colours.</p>
    </section>`))}
  ${grp('practice', 'Practice', 'How you answer and how sessions run', cols(`<section class="card"><h3>Answering</h3>
      <div class="field"><div class="mu">Keypad${ib('s.pad')}</div><div>${seg('pad', pad, [['auto', 'Auto'], ['on', 'Always'], ['off', 'Never']])}<div class="mu" style="margin-top:6px">Auto shows it on touch screens only.</div></div></div>
      <div class="field"><div class="mu">Keypad layout</div><div>${seg('padFlip', S.padFlip ? 'calc' : 'phone', [['phone', '1 2 3 on top'], ['calc', '7 8 9 on top']])}</div></div>
      ${row('Enter to submit', 'Answers are only judged when you press Enter or Submit. Slower, but a slip on the last digit can be fixed, and the answer length is not revealed.', 'ent', get('ent'))}
      ${row('Forgive near-miss typos', 'A last digit one key away from the right one gets a moment to fix before it counts as a slip. Once per question.', 'noGrace', get('noGrace'))}
      ${row('Pace readout', 'Show seconds on the current question against your target time.', 'pace', get('pace'))}
    </section>`, `<section class="card"><h3>Sessions</h3>
      ${row('3-2-1 countdown', 'A short countdown before each session.', 'noCd', get('noCd'))}
      ${row('Sound', 'Soft tones for right and wrong answers.', 'mute', !S.mute)}
      ${row('Vibration', 'Haptic buzz on wrong answers and keypad taps.', 'noHap', get('noHap'))}
      ${row('Auto-pause', 'Pause when you switch to another window or tab.', 'noBlur', get('noBlur'))}
      <div class="set"><div><div class="t">Daily goal${ib('s.goal')}</div><div class="d">Sessions of 2+ minutes that keep your streak alive.</div></div><div class="stepper"><button class="btn sm" data-act="goal" data-v="-1" aria-label="Fewer sessions" ${goal <= 1 ? 'disabled' : ''}>−</button><b class="num" aria-live="polite">${goal}</b><button class="btn sm" data-act="goal" data-v="1" aria-label="More sessions" ${goal >= 5 ? 'disabled' : ''}>+</button></div></div>
      <div class="set"><div><div class="t">Ratings${ib('s.ratings')}</div><div class="d">Average ${Math.round(avgLv() * 100)}. Ratings adapt on their own; reset them if the level feels off.</div></div><div class="btns"><button class="btn sm" data-act="calib">Set all…</button><button class="btn sm" data-act="placement">Choose level</button></div></div>
    </section>`))}
  ${grp('account', 'Account', 'AI Coach, reminders and cloud sync', cols(`${remindersCard()}<section class="card"><h3>AI Coach${ib('s.ai')}</h3>
      <p class="mu" style="margin:6px 0 0;max-width:56ch">The AI Coach belongs to this device's learner. Gemini is configured securely on the server; your personal sync password identifies which learner's cloud data and AI access to use. There is no separate User 1 / User 2 switch or browser-stored API key.</p>
      <div class="btns" style="margin-top:12px"><button class="btn sm" data-act="aiStatus">${icon('sparkle')} Check AI status</button></div>
    </section>`, `<section class="card"><h3>Cloud sync${ib('s.sync')}</h3>
      <p class="mu" style="margin:6px 0 12px;max-width:56ch">${syncKey() ? "Your progress syncs to the personal cloud account selected by this device's key. Your settings (theme, accent, keypad, sound, goal and saved setups) sync too, so a new browser looks and behaves like your others. Reminders stay per device. Use your own key on your devices; the other learner must use a different key." : "Set this learner's personal sync password. Use the same password on other devices belonging to this learner and your settings will follow you. Another person must use their own different password."}</p>
      <div class="set"><div><div class="t">${syncKey() ? esc(statusText()) : 'Sync is off'}</div><div class="d">${syncKey() ? 'Key set on this device' : 'No key set'}</div></div><div class="btns"><button class="btn sm" data-act="syncKey">${syncKey() ? 'Change key' : 'Set up sync'}</button>${syncKey() ? '<button class="btn sm" data-act="syncNow">Sync now</button>' : ''}</div></div>
      ${syncKey() && isWeakKey() ? `<div class="notice" role="status" style="margin:0 0 12px"><span>This sync key is shorter than ${MIN_KEY_LENGTH} characters, so it is easier to guess. Replace it with a longer one: set a new SYNC_KEY in Netlify, or ask the main account for a new key under Learners and keys.</span></div>` : ''}
      ${syncKey() ? `<div class="set"><div><div class="t">Learners and keys</div><div class="d">Make a key for another person, or turn one off. Main account only.</div></div><button class="btn sm" data-act="learners">Manage</button></div>` : ''}
      ${syncKey() ? `<div class="set"><div><div class="t">Daily leaderboard</div><div class="d">${bd && bd.member ? `On, as <b>${esc(bd.name)}</b>. Learners who joined see each other's Daily points.` : 'Off. Compare each day\u2019s Daily score with the other learners on this server. Shares only the display name you choose, your Daily points and how many you answered; leaving deletes it.'}</div></div><div class="btns">${bd && bd.member ? `<button class="btn sm" data-act="boardView">Today</button><button class="btn sm" data-act="boardJoin">Rename</button><button class="btn sm danger" data-act="boardLeave">Leave</button>` : `<button class="btn sm" data-act="boardJoin">Join\u2026</button>`}</div></div>` : ''}
      ${syncKey() ? `<div class="set"><div><div class="t">Recover from cloud safety copy${ib('s.recover')}</div><div class="d">The server keeps a daily copy. This merges back anything missing here.</div></div><button class="btn sm" data-act="restoreCloud">Recover</button></div>` : ''}
    </section>`))}
  ${grp('data', 'Data and help', 'Backups, reset and how things work', cols(`<section class="card"><h3>Your data</h3>
      <div class="set"><div><div class="t">Backup${ib('s.backup')}</div><div class="d">${S.lastExport ? 'Last download ' + ymd(S.lastExport) + ' (' + ago(S.lastExport) + ')' : 'Never downloaded'}. Home reminds you after 12 days without one, unless sync is on. ${S.sessions.length} ${S.sessions.length == 1 ? 'session' : 'sessions'} stored here.</div></div><button class="btn sm" data-act="export">${icon('down')} Download</button></div>
      <div class="set"><div><div class="t">Restore from backup${ib('s.import')}</div><div class="d">Merge or replace using a backup file.</div></div><button class="btn sm" data-act="import">${icon('up')} Import</button></div>
      <div class="set"><div><div class="t">Session history</div><div class="d">One row per session, for spreadsheets.</div></div><button class="btn sm" data-act="csv">${icon('down')} CSV</button></div>
      ${installRow()}
      <div class="set"><div><div class="t">Reset everything${ib('s.reset')}</div><div class="d">Erases progress on this device.</div></div><button class="btn sm danger" data-act="reset">${icon('trash')} Reset</button></div>
    </section>`, `<section class="card"><h3>Help</h3>
      <div class="set"><div><div class="t">How it works</div><div class="d">Ratings, scoring, the notebook and modes.</div></div><button class="btn sm" data-act="help">Read</button></div>
      <div class="set"><div><div class="t">Keyboard shortcuts</div><div class="d">Everything is reachable without a mouse.</div></div><button class="btn sm" data-act="keys">${icon('keys')} Show</button></div>
    </section>`))}
  <div class="card empty sempty" id="sempty" role="status" hidden></div>`;
  filterSettings();
}

/* ---------- search, groups ---------- */
const GROUPS = [['look', 'Look and feel'], ['practice', 'Practice'], ['account', 'Account'], ['data', 'Data and help']];
let sq = '';   // the search text; survives the repaint every change triggers
const norm = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
/** Hide rows, cards and groups that do not match every word typed. A card's own title matches all its rows. */
function filterSettings() {
  const main = document.querySelector('#main'); if (!main || view.scr != 'settings') return;
  const terms = norm(sq).trim().split(' ').filter(Boolean), all = (t) => terms.every((w) => t.includes(w));
  const jump = main.querySelector('.sjump'); if (jump) jump.hidden = !!terms.length;
  let any = false;
  main.querySelectorAll('.sgrp').forEach((g) => {
    let gShow = false;
    const gTitle = norm(g.querySelector('h2').textContent);
    g.querySelectorAll('.card:not(.pv)').forEach((c) => {
      const rows = [...c.querySelectorAll('.set, .field')], title = norm((c.querySelector('h3') || {}).textContent || '') + ' ' + gTitle;
      let show;
      if (!terms.length) { rows.forEach((r) => (r.hidden = false)); show = true; }
      else if (!rows.length) show = all(title + ' ' + norm(c.textContent));
      else if (all(title)) { rows.forEach((r) => (r.hidden = false)); show = true; }
      else { show = false; rows.forEach((r) => { r.hidden = !all(title + ' ' + norm(r.textContent)); show = show || !r.hidden; }); }
      c.hidden = !show; gShow = gShow || show;
    });
    const pv = g.querySelector('.pv'); if (pv) pv.hidden = !!terms.length && !gShow;
    g.hidden = !gShow; any = any || gShow;
  });
  const e = main.querySelector('#sempty'); if (e) { e.hidden = any || !terms.length; e.textContent = terms.length && !any ? 'No settings match “' + sq.trim() + '”. Try a shorter word, such as theme, sound or sync.' : ''; }
}
document.addEventListener('input', (e) => { if (e.target.id == 'sq' && view.scr == 'settings') { sq = e.target.value; filterSettings(); } });
document.addEventListener('keydown', (e) => { if (e.target.id == 'sq' && e.key == 'Escape' && sq) { e.preventDefault(); sq = ''; e.target.value = ''; filterSettings(); } });
A.sjump = (d) => { const g = document.querySelector('#g-' + d.v); if (g) g.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion == 'reduce' ? 'auto' : 'smooth', block: 'start' }); };

/* ---------- actions ---------- */
const again = () => { if (view.scr == 'settings') settings(); };
A.theme = (d) => { S.theme = d.v == 'auto' ? undefined : d.v; save(); applyTheme(); again(); };
A.acc = (d) => { S.acc = d.v; save(); applyTheme(); again(); };
A.ts = (d) => { S.ts = d.v; save(); applyTheme(); again(); };
A.font = (d) => { S.font = d.v; save(); applyTheme(); again(); };
A.padFlip = (d) => { S.padFlip = d.v == 'calc'; save(); again(); };
A.pad = (d) => { S.pad = d.v == 'auto' ? null : d.v == 'on'; save(); applyTheme(); again(); };
A.goal = (d) => { S.goal = clamp((S.goal || 2) + +d.v, 1, 5); save(); again(); };
A.tog = (d) => {
  const k = d.v;
  if (k == 'remSave') { setRem({ save: !remGet().save }); return again(); }
  if (k == 'remSkip') { setRem({ skip: !remGet().skip }); return again(); }
  if (k == 'mute') S.mute = !S.mute; else S[k] = !S[k];
  save(); applyTheme(); again();
};
A.calib = async () => {
  const v = parseInt(await promptDlg('Set all ratings', 'Rating for every skill (100 to 1200)', Math.round(avgLv() * 100), { type: 'number', min: 100, max: 1200, ok: 'Set ratings', hint: 'Roughly: 300 beginner, 500 comfortable, 700 quick, 900 expert.' }));
  if (v >= 100 && v <= 1200) { IDS.forEach((k) => (S.sk[k].lv = clamp(v / 100, 1, 12))); save(); again(); toast('All ratings set to ' + v); }
};
A.placement = () => placement().then(again);

export async function placement() {
  const lvl = await choiceDlg('Where are you starting from?', '<p>This sets every skill’s starting rating. It adapts within about three sessions, so don’t overthink it.</p>', [
    { value: 300, title: 'Beginner', desc: 'Small numbers, one step at a time' },
    { value: 500, title: 'Comfortable', desc: 'Two-digit sums, times tables up to 12' },
    { value: 700, title: 'Quick', desc: 'Two-digit × one-digit in your head' },
    { value: 900, title: 'Expert', desc: 'Already fast; bring the hard stuff' },
  ]);
  if (lvl) { IDS.forEach((k) => (S.sk[k].lv = clamp(lvl / 100, 1, 12))); save(); toast('Starting rating set to ' + lvl); }
  return lvl;
}

A.syncKey = async () => {
  const o = syncKey();
  let n = '', problem = '';
  // Ask again until the key is long enough (or empty, which turns sync off). The key already on this device is never re-judged,
  // so someone with an older short key can still open the dialog and leave it as it is.
  for (;;) {
    const k = await promptDlg('Personal sync password', "Enter the sync password assigned to this learner. Use this same password on your own devices; the other learner uses a different password.", problem ? n : o, { ok: 'Save', hint: problem ? `<b class="bad">${esc(problem)}</b> Keys made under Learners and keys are always long enough.` : `Leave empty to turn sync off. At least ${MIN_KEY_LENGTH} characters; treat the key like a password.` });
    if (k === null) return;
    n = k.trim();
    problem = n && n !== o ? keyProblem(n) : '';
    if (!problem) break;
  }
  if (o && n && o !== n && S.sessions.length && !(await confirmDlg('Switch sync account?', `This device’s progress (<b>${S.sessions.length} sessions</b>) will be merged into the cloud account selected by the new password. Only continue if that is the intended account.`, { ok: 'Switch and merge' }))) return;
  setSyncKey(n); bd = null; setBoardHint(false);   // the board belongs to the learner the key selects
  again();
  if (n) { await pull(); again(); } else toast('Sync turned off');
};
const showNewKey = (name, key) => dialog({
  title: 'Key for ' + name,
  body: `<p>Copy or write this key down now. It is shown only once: the server keeps no readable copy.</p><input class="inp" readonly value="${esc(key)}" aria-label="New sync key" style="margin:10px 0;font-family:var(--mono);letter-spacing:.02em"><button type="button" class="btn sm" data-copy>Copy key</button><p class="mu" style="margin-top:10px">On their device: Settings, then Set up sync, and enter this key.</p>`,
  actions: [{ label: 'Done', value: true, primary: true }],
  onOpen: (d) => {
    const i = d.querySelector('input'); i.focus(); i.select();
    d.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(key); toast('Copied'); } catch (e) { i.select(); toast('Press and hold to copy'); } });
  },
});
/** Why a /api/keys call did not go through, as a sentence for a toast; '' when it did. */
const keysWhy = (r) => (r.status == 429 ? (r.json && r.json.error) || 'Too many wrong keys. Try again later.' : r.status == 401 ? 'The sync key was not accepted.' : r.status == 403 ? 'Only the main account can manage learners.' : r.status >= 400 ? (r.json && r.json.error) || 'That did not work.' : '');
A.learners = async () => {
  let r;
  try { r = await keysApi('GET'); } catch (e) { return toast('Could not reach the server'); }
  if (keysWhy(r)) return toast(keysWhy(r));
  if (!r.json.admin) return toast('Only the main account can manage learners.');
  const list = r.json.learners || [], max = r.json.max || 10;
  const opts = [];
  if (list.length < max) opts.push({ value: 'add', title: 'Add a learner', desc: 'Makes a new key and shows it once' });
  for (const l of list) opts.push({ value: 'rm:' + l.id, title: 'Turn off ' + l.name, desc: 'Their key stops working. Saved progress stays; adding the same name again gives a new key and the same progress.', danger: true });
  const intro = list.length ? `<p>${list.length} learner${list.length == 1 ? '' : 's'} made here, besides the ones set up in Netlify.</p>` : '<p>No learners have been made here yet. The ones set up in Netlify keep working as before.</p>';
  const v = await choiceDlg('Learners and keys', intro, opts);
  if (v === 'add') {
    const name = await promptDlg('New learner', 'Name (letters and numbers)', '', { ok: 'Create key', hint: 'The name picks their private cloud space. It cannot be changed later.' });
    if (name === null || !name.trim()) return;
    let c;
    try { c = await keysApi('POST', { body: { name: name.trim() } }); } catch (e) { return toast('Could not reach the server'); }
    if (keysWhy(c)) return toast(keysWhy(c));
    await showNewKey(c.json.learner.name, c.json.key);
  } else if (typeof v == 'string' && v.startsWith('rm:')) {
    const id = v.slice(3), who = list.find((l) => l.id === id);
    if (!who || !(await confirmDlg('Turn off this key?', `<b>${esc(who.name)}</b> will no longer be able to sync until you make them a new key. Their saved progress is kept.`, { ok: 'Turn off', danger: true }))) return;
    let d;
    try { d = await keysApi('DELETE', { query: '?id=' + encodeURIComponent(id) }); } catch (e) { return toast('Could not reach the server'); }
    toast(keysWhy(d) || 'Key turned off');
  }
};
A.boardJoin = async () => {
  const name = await promptDlg('Daily leaderboard', 'Display name', (bd && bd.name) || '', { ok: bd && bd.member ? 'Save' : 'Join', hint: 'Other learners on this server see this name, your Daily points and how many you answered. Nothing else. You can leave at any time.' });
  if (name === null) return;
  const r = await boardApi('PUT', { body: { name } });
  if (r.status !== 200) return toast(boardWhy(r), { ms: 4500 });
  setBoardHint(true); bd = { member: true, name: r.json.name }; again(); toast('On the board as ' + r.json.name);
};
A.boardLeave = async () => {
  if (!(await confirmDlg('Leave the leaderboard?', 'Your name and Daily scores are removed from the board. Your own progress is not touched. You can join again later.', { ok: 'Leave', danger: true }))) return;
  const r = await boardApi('DELETE');
  if (r.status !== 200) return toast(boardWhy(r), { ms: 4500 });
  setBoardHint(false); bd = { member: false }; again(); toast('Left the leaderboard');
};
A.boardView = async () => {
  const b = await loadBoard(ymd());
  await dialog({ title: 'Today\u2019s board', body: boardHtml(b || { error: 'You are not on the board.' }), actions: [{ label: 'Done', value: true, primary: true }] });
};
A.aiStatus = async () => {
  let body;
  try {
    const r = await fetch('/api/ai'), j = await r.json();
    const q = j.quota || {}, models = q.perModel || {};
    body = `<div class="ai-prose"><ul><li><b>Server key:</b> ${j.configured ? 'configured' : '<span class="bad">missing</span> (set GEMINI_API_KEY in Netlify)'}</li>
      <li><b>Build:</b> ${esc(j.buildVersion)}</li>
      <li><b>Used today:</b> ${q.usedToday ?? '?'} of ${q.dailyLimit ?? 300}</li>
      ${Object.entries(models).map(([m, v]) => `<li><b>${esc(m)}:</b> ${v.requestsLastMinute ?? '?'} of ${q.perModelRpmLimit ?? 12} this minute</li>`).join('')}</ul>
      <p class="mu">Each AI button makes one request (two if the first model is busy). Replies for the same data are saved on this device for 4 hours, so reopening a sheet is free.</p></div>`;
  } catch (e) { body = `<p class="bad">Could not reach /api/ai: ${esc(e.message || 'network error')}</p>`; }
  await dialog({ title: 'AI status', body, actions: [{ label: 'Done', value: true, primary: true }] });
};
A.syncNow = async () => { toast('Syncing…'); const ok = await syncNow(); toast(ok ? 'Up to date' : statusText()); again(); };
A.sync = () => { if (!syncKey()) { go('settings'); setTimeout(() => A.syncKey(), 50); } else A.syncNow(); };
A.restoreCloud = async () => {
  try {
    const r = await fetchBackup();
    if (!r) return toast('No cloud safety copy yet');
    const n = r.state.sessions.length, when = new Date(r.at).toLocaleString();
    if (await confirmDlg('Recover from safety copy?', `Copy from <b>${esc(when)}</b> has <b>${n} sessions</b>. Anything missing here will be merged back; nothing is deleted.`, { ok: 'Recover' })) {
      replaceState(mergeStates(S, asCurrent(r.state))); save(); again(); toast('Recovered. Now ' + S.sessions.length + ' sessions');
    }
  } catch (e) { toast('Could not reach the server'); }
};

export function exportBackup() {
  download('mentalmath-backup-' + ymd() + '.json', JSON.stringify(S, null, 1), 'application/json');
  S.lastExport = Date.now(); save(); toast('Backup downloaded'); again();
}
A.export = exportBackup;
A.csv = () => {
  if (!S.sessions.length) return toast('No sessions yet');
  const r = ['date,mode,seconds,answers,correct,accuracy_pct,points,avg_seconds'].concat(S.sessions.map((x) => [new Date(x.t).toISOString(), x.m, x.dur, x.n, x.ok, Math.round((100 * x.ok) / Math.max(1, x.n)), x.pts, x.tm].join(',')));
  download('mentalmath-sessions-' + ymd() + '.csv', r.join('\n'), 'text/csv'); toast('CSV downloaded');
};
A.import = () => document.querySelector('#imp').click();
export function wireImport() {
  document.querySelector('#imp').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      let o;
      try { o = JSON.parse(r.result); if (!o || !o.sk || !Array.isArray(o.sessions)) throw 0; } catch (x) { toast('That is not a valid backup file'); e.target.value = ''; return; }
      const synced = !!syncKey();
      let how = await choiceDlg('Import backup', `<p>Backup has <b>${o.sessions.length}</b> sessions. This device has <b>${S.sessions.length}</b>.</p>${synced ? '<p>Sync is on, so replacing also replaces the cloud copy and your other devices.</p>' : ''}`, [
        { value: 'merge', title: 'Merge (recommended)', desc: 'Keep everything from both; nothing is lost' },
        { value: 'replace', title: synced ? 'Replace everywhere' : 'Replace this device', desc: synced ? 'This device, the cloud copy and your other devices' : 'Use the backup as is', danger: synced },
      ]);
      if (how == 'replace' && synced && !(await typedConfirmDlg('Replace everywhere?', `<p>The cloud copy (<b>${S.sessions.length}</b> sessions here) will be replaced by this backup (<b>${o.sessions.length}</b> sessions). A safety copy of the cloud data is kept on the server.</p>`, 'REPLACE', { ok: 'Replace everywhere' }))) how = undefined;
      if (how == 'merge') { replaceState(mergeStates(S, asCurrent(o))); save(); toast('Merged. Now ' + S.sessions.length + ' sessions'); }
      else if (how == 'replace') {
        const prev = S.wipe;
        replaceState(migrate(o));
        if (synced) stampWipe(prev); else if (prev) S.wipe = prev; else delete S.wipe;   // the file's own marker never decides anything
        save(); toast('Imported ' + S.sessions.length + ' sessions');
        if (synced) syncNow().then((ok) => ok || toast('Replaced here. The cloud copy follows when you are back online.', { ms: 5000 }));
      }
      e.target.value = ''; applyTheme(); go(view.scr == 'settings' ? 'settings' : 'home');
    };
    r.readAsText(f);
  };
}
function installRow() {
  const d = (t, b) => `<div class="set"><div><div class="t">Install app</div><div class="d">${t}</div></div>${b}</div>`;
  if (isStandalone()) return d('Installed. You are using the app version.', `<span class="pill ok">Installed</span>`);
  if (A._ip) return d('Full screen, instant launch, works offline, and enables reminders.', `<button class="btn sm primary" data-act="install">${icon('down')} Install</button>`);
  if (isIOS()) return d('Add to your Home Screen for full screen and reminders.', `<button class="btn sm" data-act="iosHelp">How</button>`);
  return d('Use your browser menu: Install app, or Add to Home Screen.', `<button class="btn sm" data-act="install">${icon('down')} How</button>`);
}
A.install = () => { if (A._ip) { A._ip.prompt(); A._ip.userChoice && A._ip.userChoice.finally(() => (A._ip = null)); } else toast('Open your browser menu, then choose Install app or Add to Home Screen'); };
A.iosHelp = () => dialog({ title: 'Add to Home Screen', body: `<ol style="margin:0;padding-left:20px;display:grid;gap:8px"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open Mental Math from your Home Screen, then turn on reminders in Settings.</li></ol>`, actions: [{ label: 'Got it', value: true, primary: true }] });

/* ---------- reminder actions ---------- */
const WHY = { denied: 'Notifications were not allowed.', server: 'The server is not set up for reminders yet (see README: VAPID keys).', offline: 'You appear to be offline. Try again when connected.', key: 'The sync key was not accepted.', unsupported: 'This browser cannot show reminders.', error: 'Something went wrong turning reminders on.' };
const pickTime = (t, title = 'Remind me at') => dialog({
  title, body: `<label>Time of day<input class="inp" type="time" name="t" value="${esc(hh(t))}" required style="margin-top:8px"></label><p class="mu" style="margin-top:8px">Your local time.</p>`,
  actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }],
  onOpen: (d) => d.querySelector('input').focus(), collect: (d, v) => (v ? d.querySelector('input').value : null),
}).then((v) => { const x = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return x ? { h: +x[1], m: +x[2] } : null; });
const again2 = () => { if (view.scr == 'settings') settings(); };
A.remOn = async () => {
  const t = await pickTime(remGet().times[0], 'Remind me daily at');
  if (!t) return;
  const r = await remEnable([t]);
  if (r.ok) { rs = 'on'; toast('Reminders on at ' + hh(t)); again2(); remTest().catch(() => {}); } else { toast(WHY[r.why] || WHY.error, { ms: 5000 }); await loadRem(); again2(); }
};
A.remOff = async () => { await remDisable(); rs = 'off'; again2(); toast('Reminders off'); };
A.remTime = async (d) => {
  const R = remGet(), i = +d.v, t = await pickTime(R.times[i]);
  if (!t) return;
  const times = R.times.map((x, j) => (j == i ? t : x)).filter((x, j, a) => a.findIndex((y) => hh(y) == hh(x)) == j);
  setRem({ times }); again2(); toast('Reminder set for ' + times.map(hh).join(', '));
};
A.remAdd = async () => {
  const R = remGet(), last = R.times[R.times.length - 1], t = await pickTime({ h: (last.h + 6) % 24, m: last.m }, 'Add a reminder time');
  if (!t || R.times.some((x) => hh(x) == hh(t))) return;
  setRem({ times: [...R.times, t].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m)) }); again2();
};
A.remDay = (d) => {
  const R = remGet(), n = +d.v, days = R.days.includes(n) ? R.days.filter((x) => x != n) : [...R.days, n].sort();
  if (!days.length) return toast('Pick at least one day');
  setRem({ days }); again2();
};
A.remTest = async () => { toast('Sending…'); try { toast((await remTest()) ? 'Test sent. It should arrive in a few seconds.' : 'Could not send a test. Is the server set up?', { ms: 4000 }); } catch (e) { toast('Could not send a test'); } };
A.reset = async () => {
  const synced = !!syncKey();
  const c = await choiceDlg('Reset everything?', synced
    ? '<p>Sync is on, so a reset on this device alone would just come back from the cloud. Choose how far it goes.</p><p>Erasing everywhere removes all sessions, ratings and notes here and in the cloud copy, and your other devices are reset the next time they sync. The server keeps one safety copy.</p>'
    : '<p>This erases all sessions, ratings and notes <b>on this device</b>.</p>',
  synced ? [
    { value: 'backup', title: 'Download a backup, then erase everywhere', desc: 'Safest', danger: true },
    { value: 'cloud', title: 'Erase everywhere', desc: 'This device, the cloud copy and your other devices', danger: true },
    { value: 'local', title: 'Reset this device only', desc: 'Turns sync off here, so the cloud copy stays as it is' },
  ] : [
    { value: 'backup', title: 'Download a backup, then reset', desc: 'Safest' },
    { value: 'reset', title: 'Reset now', desc: 'No backup', danger: true },
  ]);
  if (!c) return;
  const everywhere = synced && c != 'local';
  if (everywhere && !(await typedConfirmDlg('Erase everywhere?', `<p>This erases <b>${S.sessions.length}</b> sessions on this device <b>and in the cloud</b>. It can only be undone from the safety copy.</p>`, 'ERASE', { ok: 'Erase everywhere' }))) return;
  if (c == 'backup') exportBackup();
  const snap = JSON.parse(JSON.stringify(S)), keep = devicePrefs();   // sound, pad, reminders and every other device setting survive; only progress is erased
  replaceState(Object.assign(fresh(), keep)); S.onb = 1;
  if (everywhere) stampWipe(snap.wipe); else if (snap.wipe) S.wipe = snap.wipe;
  if (synced && c == 'local') setSyncKey('');
  save(); applyTheme(); go('home');
  toast(everywhere ? 'Erased on this device. Erasing the cloud copy…' : 'Everything reset', { label: 'Undo', onClick: () => {
    replaceState(snap);
    if (everywhere) stampWipe(S.wipe);   // undoing an erase is itself newer than the erase, so the restored data wins back the cloud copy
    save(); applyTheme(); go('home'); toast('Restored');
    if (everywhere) syncNow();
  } });
  if (everywhere) syncNow().then((ok) => ok ? toast('Erased everywhere') : toast('Erased here. The cloud copy follows when you are back online.', { ms: 6000 }));
};

export function keysDialog() {
  const K = [['Enter', 'Start / skip question / play again'], ['1 – 6', 'Session length (home)'], ['← →', 'Pick a skill (home)'], ['Y', 'Daily challenge'], ['V', 'Survival'], ['X', 'Sprint (20 questions)'], ['R', 'Review missed'], ['H', 'Show the method (while playing)'], ['Esc', 'Pause / back'], ['C', 'AI Coach'], ['P', 'Progress'], ['T', 'Learn tricks'], ['N', 'Notebook'], ['S', 'Settings'], ['L', 'Light / dark'], ['M', 'Sound on / off'], ['?', 'This list']];
  return dialog({ title: 'Keyboard shortcuts', body: `<dl class="sc">${K.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl>`, actions: [{ label: 'Done', value: true, primary: true }] });
}
A.keys = () => keysDialog();
export function helpDialog() {
  return dialog({ title: 'How it works', body: `<p>Each skill has a <b>rating</b> (×100). Every correct answer is scored against a <b>par time</b> that includes reading the question, thinking and typing the digits. Answer at par and your rating holds; faster raises it, slower lowers it a little. Ratings settle where you are about 72% “perfect”, which is hard enough to learn from. A wrong answer or a skip never costs more than a small step.</p>
  <p>Points grow with difficulty, plus up to 25% for beating par. Slips count half in a skill’s accuracy.</p>
  <p><b>H</b> shows the worked method for any question. Hinted answers earn half points and don’t move your rating. Every miss shows its solution and returns after 4 questions, 10 minutes and a day, until you answer it fast three times.</p>
  <p><b>Daily challenge</b> is 60 seconds with the same questions for everyone. <b>Survival</b> gives you 3 lives and raises the difficulty with every answer. <b>Sprint</b> is 20 questions against the clock: each slip adds 3 s and each skip 5 s, and your best time is saved. Bonus questions are harder and worth double. Ratings only move in Train and Focus sessions at Auto difficulty.</p>
  <p>Each setting keeps its own best score and ghost, so you always race your previous best.</p>`, actions: [{ label: 'Got it', value: true, primary: true }] });
}
A.help = () => helpDialog();

register('settings', settings);
export { settings };

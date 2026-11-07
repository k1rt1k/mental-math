import { S, save, avgLv, cfgNow } from '../state.js';
import { IDS, SK, COL, rank, ZDEF, zNorm, zLabel } from '../engine.js';
import { esc, ymd, fmtLen, VERSION, dayAgo, dueIn } from '../util.js';
import { restChip } from '../rest.js';
import { streak, restInfo, days, plan, todayCount, trickOfDay, weakestSkills, MS, week, zDef, zMD, recommend, lvAgo, records } from '../stats.js';
import { radar, ring } from '../charts.js';
import { icon, promptDlg, dialog, toast } from '../ui.js';
import { ib } from '../info.js';
import { spark, sessLabel } from '../charts.js';
import { setLearnFilter } from './learn.js';
import { A, register, view, go } from '../nav.js';
import { syncKey, statusText, status } from '../sync.js';
import { applyTheme } from '../theme.js';
import { start } from './play.js';
import { mkOf } from '../session.js';
import { exportBackup } from './settings.js';
import { showAiSheet } from '../ai.js';
import { askSkillAi } from '../skillAi.js';

const LENS = [30, 60, 120, 300, 600, 0];
/** ["Good morning", "Tuesday, Nov 3"] from the device clock. */
const greeting = () => { const h = new Date().getHours(); const d = new Date(), f = (o) => d.toLocaleDateString(undefined, o);
  return [h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening', `<span class="dl">${esc(f({ weekday: 'long', month: 'long', day: 'numeric' }))}</span><span class="ds">${esc(f({ weekday: 'short', month: 'short', day: 'numeric' }))}</span>`]; };
const kc = (k, t) => `<span class="kc" style="--sc:${COL[k]}">${esc(t)}</span>`;
const SL = { add: 'Add', sub: 'Subtract', mul: 'Multiply', div: 'Divide', sq: 'Squares', pw: 'Roots & cubes', pct: 'Percent', ops: 'Multi-step', mod: 'Remainders', dec: 'Decimals', neg: 'Negatives', frac: 'Fractions', life: 'Real-life' };
const onLabel = (c) => (c.only == 'all' ? 'all skills' : c.only == 'mix' ? 'custom mix' : c.only == 'zeta' ? zLabel(c.zeta) : SL[c.only]);
const STEP_IC = { train: 'target', review: 'redo', daily: 'cal' };
const DIFF = [[-1.5, 'Easier'], [0, 'Auto'], [1.5, 'Harder'], [3, 'Brutal']];

export const syncChip = () => {
  const on = !!syncKey(), lbl = on ? 'Sync status: ' + statusText() : 'Sync is off. Set up sync';
  return `<button class="syncdot ${on ? status.kind : 'off'}" data-act="sync" title="${esc(lbl)}" aria-label="${esc(lbl)}"><span class="sico">${icon('cloud')}<i></i></span><span id="sy">${esc(on ? statusText() : 'Set up sync')}</span></button><span class="offp" role="status">${icon('cloud')} Offline<span class="offw"> · still works</span></span>`;
};

function home() {
  document.title = 'Mental Math Trainer';
  applyTheme();
  const now = Date.now(), st = streak(), goal = S.goal || 2, td = todayCount();
  const rest = restInfo(), restTip = !rest ? '' : rest.state == 'ready' ? ' · rest day ready: one missed day is forgiven' : rest.state == 'using' ? ' · rest day in use: play today to keep it' : ' · ' + rest.left + (rest.left == 1 ? ' more day' : ' more days') + ' in a row earns a rest day';
  const MIL = [3, 7, 14, 30, 60, 100, 200, 365], nm = MIL.find((m) => m > st), pm = [...MIL].reverse().find((m) => m <= st) || 0;   // streak ring: progress toward the next milestone
  const stRing = nm ? (st - pm) / (nm - pm) : 1, stRingTip = nm ? (nm - st) + (nm - st == 1 ? ' day' : ' days') + ' to the ' + nm + '-day mark' : 'Every milestone reached';
  const r = Math.round(avgLv() * 100), saved = Object.keys(S.weak).length, dueNow = Object.values(S.weak).filter((w) => w.due <= now).length, cf = cfgNow(), bst = S.best[mkOf(cf)];
  const [w1] = weakestSkills(2), has = S.sessions.length > 0, D = days(), dly = S.daily && S.daily[ymd()];
  const chip = (on, act, arg, label, extra = '') => `<button class="chip" aria-pressed="${on}" data-act="${esc(act)}" data-v="${esc(arg)}" ${extra}>${label}</button>`;
  const a = week(0, 7), b = week(7, 14), dd = Math.round(a.acc - b.acc);
  const nextMs = MS.find((m) => !S.ms.includes(m[0]));
  const svBest = S.best.survival;

  const notices = [];
  if (has && !syncKey() && now - (S.lastExport || 0) > 12 * 864e5 && now > (S.bkSnooze || 0)) notices.push(`<div class="notice slim" role="status"><span>Saved only on this device.</span><span class="btns"><button class="btn sm tonal" data-act="export">Back up</button><button class="btn sm ghost x" data-act="dismissBk" aria-label="Hide this for a week">${icon('x', 'sm')}</button></span></div>`);

  const rec = recommend(), open = S.customOpen === true;
  const diffL = cf.off ? ' · ' + (DIFF.find((d) => d[0] == cf.off) || [0, 'custom'])[1].toLowerCase() : '';
  const [hello, dateStr] = greeting(), warnStreak = st && !D.has(ymd());
  const modes = [
    `<button class="mode" data-act="daily"><span class="mi">${icon('cal')}</span><b>Daily</b><span class="mdesc">${dly ? 'Today ' + dly + ' pts' : '60\u00a0s · same for everyone'}</span></button>`,
    `<button class="mode" data-act="survival"><span class="mi">${icon('heart')}</span><b>Survival</b><span class="mdesc">3 lives${svBest ? ' · best ' + svBest.pts : ', rising difficulty'}</span></button>`,
    `<button class="mode" data-act="sprint"><span class="mi">${icon('bolt')}</span><b>Sprint</b><span class="mdesc">20 questions${S.best.sprint ? ' · best ' + S.best.sprint.t + '\u00a0s' : ', fastest time'}</span></button>`,
    `<button class="mode" data-act="flash"><span class="mi">${icon('star')}</span><b>Flash</b><span class="mdesc">${(() => { const b = Math.max(0, ...S.sessions.filter((x) => x.m == 'flash').map((x) => x.pts)); return b ? 'Running total · best ' + b : 'Numbers flash, you add'; })()}</span></button>`,
  ];
  if (has) { modes.shift(); modes.push(
    `<button class="mode" data-act="weakest"><span class="mi">${icon('target')}</span><b>Drill weakest</b><span class="mdesc">${esc(SK[w1].n)}</span></button>`); }
  // One Start. When the recommendation is a plain training session it runs the learner's configured session; the title follows the setup.
  const dflt = cf.dur == 120 && cf.only == 'all' && !(cf.off || 0), conf = has && rec.act == 'recommended';
  const heroAct = conf ? 'start' : rec.act, heroCta = conf && !dflt ? 'Start' : rec.cta, heroTitle = conf && !dflt ? fmtLen(cf.dur) + ' · ' + onLabel(cf) + diffL : rec.title;
  const t = trickOfDay();
  $app().innerHTML = `
  <div class="hd home-hd"><div><h1>${esc(hello).replace(/^Good /, '<span class="gw">Good </span>')}</h1><div class="greet">${dateStr}</div>${restChip(rest, icon, esc) ? `<div class="hrest">${restChip(rest, icon, esc)}</div>` : ''}</div>
    <div class="meta"><span class="pill streak ${warnStreak ? 'warn' : ''}" ${warnStreak ? `title="${esc(rest && rest.state == 'using' ? 'Your rest day is in use: play today to keep the streak' : 'Play a session today to keep it')}"` : ''}><span class="sring ${rest && rest.state == 'ready' ? 'rest' : ''}" style="--p:${esc(stRing.toFixed(3))}" ${st ? `title="${esc(stRingTip + restTip)}"` : ''}>${icon('flame', 'fill')}</span> ${st ? st + '<span class="sl">-day streak</span><span class="ss" aria-hidden="true">d</span>' + (warnStreak ? '<span class="pt"> · play today</span>' : '') : 'No streak yet'}</span>${syncChip()}<button class="hd-gear" data-go="settings" aria-label="Settings">${icon('gear')}</button></div></div>
  ${notices.join('')}
  <div class="home${has ? '' : ' solo'}">
   <div class="home-main">
    <section class="card hero" aria-label="Today">
      <div><div class="eyebrow">Recommended now${ib('home.rec')}</div><h2>${esc(heroTitle)}</h2><p>${esc(rec.why)}</p>
        <div class="btns"><button class="btn primary lg" data-act="${esc(heroAct)}">${icon('play', 'fill')} ${esc(heroCta)}${heroAct == 'start' ? '<kbd>Enter</kbd>' : ''}</button>${has ? `<button class="btn ghost ask" data-act="aiFocus">${icon('sparkle')} Ask AI</button>` : ''}</div></div>
      <div class="goal">${ring(td / goal, td + '/' + goal, 120)}<div class="mu">today’s goal${ib('home.goal')}</div></div>
      ${has ? `<div class="hsess"><div class="hsrow"><div class="chips lens" role="group" aria-label="Session length">${LENS.map((d) => chip(cf.dur == d, 'cfg', 'dur:' + d, fmtLen(d))).join('')}${chip(!LENS.includes(cf.dur), 'customLen', '', 'Custom…')}</div></div>
        ${presetRow()}
        <div class="hsfoot"><div class="mu hbest">${bst ? 'Beat your best: <b class="tx">' + bst.pts + ' pts</b>' : 'Your first run here sets the ghost to race against'}</div><button class="btn sm" data-act="toggleCustom" aria-expanded="${open}" aria-controls="cust">${open ? 'Hide options' : 'Customize'}</button></div>
        <div id="cust" class="cust" ${open ? '' : 'hidden'}>
         <div class="field"><div class="mu">Skills${ib('home.skillsPick')}</div><div class="chips" role="group" aria-label="Skills">${chip(cf.only == 'all', 'cfg', 'only:all', 'All')}${chip(cf.only == 'mix', 'cfg', 'only:mix', 'Custom mix')}${chip(cf.only == 'zeta', 'cfg', 'only:zeta', 'Custom ranges')}${IDS.map((k) => chip(cf.only == k, 'cfg', 'only:' + k, `<span class="dot" style="--sc:${COL[k]}"></span>${esc(SL[k])}`)).join('')}</div></div>
         ${cf.only == 'mix' ? `<div class="field"><div class="mu">In the mix</div><div class="chips">${IDS.map((k) => chip((cf.mix || []).includes(k), 'mix', k, esc(SL[k]))).join('')}</div></div>` : ''}
         ${cf.only == 'zeta' ? zetaPanel(cf) : ''}
         ${cf.only == 'zeta' ? '' : `<div class="field"><div class="mu">Difficulty${ib('home.diff')}</div><div class="chips" role="group" aria-label="Difficulty">${DIFF.map(([v, l]) => chip((cf.off || 0) == v, 'cfg', 'off:' + v, l)).join('')}${cf.off ? '<span class="mu" style="align-self:center">ratings frozen</span>' : ''}</div></div>`}
         <div class="field"><div class="mu">Saved setups</div><div class="chips">${chip(false, 'savePreset', '', '+ Save this setup', (S.presets || []).length >= PMAX ? 'disabled' : '')}${(S.presets || []).map((p, i) => chip(false, 'delPreset', String(i), esc(p.n) + ' ✕', `aria-label="${esc('Delete ' + p.n)}"`)).join('')}</div></div>
         <div class="mu hint"><kbd>Enter</kbd> start · <kbd>1</kbd>–<kbd>6</kbd> length · <kbd>←</kbd><kbd>→</kbd> skill · <kbd>?</kbd> all shortcuts</div>
      </div></div>` : ''}
      ${has ? `<div class="plan" role="list" aria-label="Today's plan">${plan().map((p) => `<button class="step ${p.done ? 'done' : ''}" role="listitem" data-act="${esc(p.act)}" aria-label="${esc(p.label)}: ${esc(p.detail)}${p.done ? ', done' : ''}"><i aria-hidden="true">${icon(p.done ? 'check' : STEP_IC[p.id] || 'play')}</i><span>${esc(p.label)}<small>${esc(p.detail)}</small></span><em class="go" aria-hidden="true">${icon('chev')}</em></button>`).join('')}</div>` : ''}
    </section>

    <div class="modes m3">${modes.join('')}</div>

    <section class="card tod" aria-label="Trick of the day"><div class="eyebrow">Trick of the day · ${kc(t.sk, SK[t.sk].n)}${ib('home.trick')}</div><div class="todt"><div><b>${esc(t.title)}</b><div class="mu">${esc(t.rule)}</div><div class="todx">${esc(t.ex[0])}</div></div><div class="btns"><button class="btn sm" data-act="tryTrick" data-v="${esc(t.id)}">Try one</button><button class="btn sm tonal" data-act="practiceTrick" data-v="${esc(t.id)}">Practise</button></div></div></section>
    ${has ? reviewCard(saved, dueNow, now) : ''}
    ${has ? skillsFold() : howItWorks()}
   </div>

   ${has ? `<aside class="home-side" aria-label="Your stats">
     <section class="card" aria-label="This week"><h3>This week${ib('home.week')}</h3>${weekStrip(D)}
       <div class="mini"><div><b>${a.s}</b><span>${a.s == 1 ? 'session' : 'sessions'}</span></div><div><b>${a.n}</b><span>${a.n == 1 ? 'answer' : 'answers'}</span></div><div><b>${Math.round(a.acc)}%</b><span>accurate${b.s && dd ? ` <span class="${dd >= 0 ? 'ok' : 'bad'}">${dd >= 0 ? '▲' : '▼'}${Math.abs(dd)}</span>` : ''}</span></div></div>
       <div class="wkn mu"><span>${[6, 5, 4, 3, 2, 1, 0].filter((i) => D.has(ymd(dayAgo(i)))).length} of 7 days practised</span><span>${nextMs ? 'Next unlock: ' + esc(nextMs[1]) : 'Every milestone unlocked'}</span></div></section>
     <section class="card" aria-label="Skill balance"><h3>Skill balance${ib('home.balance')}</h3><div class="lvl"><b class="num" title="Average rating across skills">${r}</b><span>${esc(rank(r))}</span></div>${radar()}
       <div class="zline mu"><span>Zetamac estimate <b class="tx">${zDef()}</b></span><span>× ÷ only <b class="tx">${zMD()}</b></span></div></section>
     <section class="card" aria-label="Personal bests"><h3>Personal bests</h3>${records().map(([l, v]) => `<div class="fr"><span class="mu">${l}</span><b>${v}</b></div>`).join('')}</section>
   </aside>` : ''}
  </div>
  <p class="foot">Mental Math ${VERSION}</p>`;
  startBar(has, heroAct, heroCta);
}

/** Phones: once the hero's Start button has scrolled away, keep one Start within thumb reach above the tab bar. Hidden on other screens by CSS. */
let sbObs = null;
function startBar(has, act, cta) {
  if (sbObs) sbObs.disconnect();
  const old = document.getElementById('startbar'); if (old) old.remove();
  const target = document.querySelector('.hero .btns .btn.primary');
  if (!has || !target || !('IntersectionObserver' in window) || !matchMedia('(max-width: 760px)').matches) return;
  const bar = document.createElement('div');
  bar.id = 'startbar'; bar.className = 'startbar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Start a session');
  const tabs = document.getElementById('tabs'); bar.style.setProperty('--tabh', (tabs ? Math.round(tabs.getBoundingClientRect().height) : 64) + 'px');
  bar.innerHTML = `<button class="btn primary" data-act="${esc(act)}" tabindex="-1">${icon('play', 'fill')} ${esc(cta)}</button>`;
  document.body.appendChild(bar);
  sbObs = new IntersectionObserver(([en]) => { const past = !en.isIntersecting && en.boundingClientRect.top < 0; bar.classList.toggle('on', past); bar.firstChild.tabIndex = past ? 0 : -1; });
  sbObs.observe(target);
}

const $app = () => document.querySelector('#main');

/** Returning learner, nothing to review: say so (and when it comes back) instead of leaving the question open. Hidden while items are due; the plan and Review mode cover that. */
function reviewCard(saved, due, now) {
  if (due) return '';
  if (!saved) return `<section class="card rq" aria-label="Review queue"><span class="rqi">${icon('check')}</span><div><b>Nothing to review</b><span class="mu">Questions you miss wait here and come back at the right time.</span></div></section>`;
  const next = Math.min(...Object.values(S.weak).map((w) => w.due || now));
  return `<section class="card rq" aria-label="Review queue"><span class="rqi">${icon('check')}</span><div><b>Nothing due right now</b><span class="mu">${saved} saved · next one ${esc(dueIn(next, now))}</span></div><button class="btn sm" data-act="review">Review early</button></section>`;
}

/* ---------- saved setups ("my 7× table, 60 s" as one tap) ---------- */
const PMAX = 6;
const presetName = (c) => fmtLen(c.dur) + ' · ' + onLabel(c) + (c.off ? ' · ' + (DIFF.find((d) => d[0] == c.off) || [0, 'custom'])[1].toLowerCase() : '');
/** One-tap chips under the length row: each applies the saved setup and starts it. */
function presetRow() {
  const P = S.presets || [];
  return P.length ? `<div class="chips pres" role="group" aria-label="Saved setups">${P.map((p, i) => `<button class="chip" data-act="runPreset" data-v="${i}">${icon('play', 'fill sm')} ${esc(p.n)}</button>`).join('')}</div>` : '';
}
A.savePreset = async () => {
  const P = (S.presets = S.presets || []); if (P.length >= PMAX) return;
  const cf = cfgNow(), n = String(await promptDlg('Save this setup', 'Name it. Saved setups start with one tap from Home.', presetName(cf), { ok: 'Save' }) || '').trim().slice(0, 28);
  if (!n) return;
  P.push({ n, cfg: JSON.parse(JSON.stringify(cf)) }); save(); home();
};
A.delPreset = (d) => { (S.presets || []).splice(+d.v, 1); save(); home(); };
A.runPreset = (d) => { const p = (S.presets || [])[+d.v]; if (!p) return; S.cfg = JSON.parse(JSON.stringify(p.cfg)); save(); start(); };

function weekStrip(D) {
  return '<div class="wk" aria-label="Last 7 days">' + [6, 5, 4, 3, 2, 1, 0].map((i) => {
    const t = new Date(dayAgo(i));
    return `<b class="${D.has(ymd(t)) ? 'on' : ''} ${i == 0 ? 'today' : ''}" title="${ymd(t)}">${'SMTWTFS'[t.getDay()]}</b>`;
  }).join('') + '</div>';
}

function skillCard(k, weak) {
  const s = S.sk[k], lv = Math.round(s.lv * 100), pk = s.pk && s.pk - s.lv > 0.15 ? ' · peak ' + Math.round(s.pk * 100) : '', d7 = s.n ? Math.round((s.lv - lvAgo(k, 7)) * 100) : 0;
  return `<button class="card sk" data-act="skill" data-v="${esc(k)}" style="--sc:${COL[k]}" aria-label="${esc(SK[k].n)}, rating ${lv}. Open details">
    <div class="nm">${esc(SK[k].n)}</div><div class="lv">${lv}${d7 ? `<small class="${d7 > 0 ? 'ok' : 'bad'}" title="Change in the last 7 days">${d7 > 0 ? '▲' : '▼'}${Math.abs(d7)}</small>` : ''}</div>
    <div class="bar" title="${lv} on a scale of 100 to 1200"><i style="width:${Math.min(100, (s.lv / 12) * 100).toFixed(1)}%"></i></div>
    <div class="sknote"><span>${s.n ? Math.round(s.acc * 100) + '% · ' + s.spd.toFixed(2) + '×' + (pk ? '<span class="pk">' + pk + '</span>' : '') : 'new'}</span>${weak ? '<span class="tag">focus</span>' : ''}</div></button>`;
}

/** Skills as a collapsible section. The summary strip shows all ten ratings at a glance, so phones can keep it closed. */
const skOpen = () => (S.skOpen === undefined ? innerWidth > 760 : !!S.skOpen);
function skillsFold() {
  const weak = weakestSkills(2), strip = IDS.map((k) => `<i style="height:${Math.round(18 + (82 * (S.sk[k].lv - 1)) / 11)}%;--sc:${COL[k]}"></i>`).join('');
  return `<details class="fold skfold" ${skOpen() ? 'open' : ''}><summary data-act="skToggle" aria-label="Your skills, ${skOpen() ? 'hide' : 'show'} details"><h2>Your skills<span class="sub">tap one for details and drills</span></h2><span class="sstrip" aria-hidden="true">${strip}</span></summary>
    <div class="skills">${IDS.map((k) => skillCard(k, weak.includes(k))).join('')}</div></details>`;
}
/** First-run replacement for the stats widgets, which would all be empty. */
const howItWorks = () => `<section class="card how1" aria-label="How it works"><h3>How it works</h3>
  <ol><li><span class="n">1</span><div><b>Play 2 minutes</b><span>Type each answer. It submits itself, no Enter needed.</span></div></li>
  <li><span class="n">2</span><div><b>Get a rating per skill</b><span>It rises as you get faster and cleaner, and sets how hard questions are.</span></div></li>
  <li><span class="n">3</span><div><b>Misses come back</b><span>Missed questions return later, with the method to solve them.</span></div></li></ol></section>`;
A.skToggle = () => { S.skOpen = !skOpen(); save(); home(); };
/** Hide the backup reminder for a week (this device only). */
A.dismissBk = () => { S.bkSnooze = Date.now() + 7 * 864e5; save(); home(); };

/* ---------- actions ---------- */
export const setCfg = (k, v) => { S.cfg = Object.assign({ dur: 120, only: 'all' }, S.cfg); S.cfg[k] = v; if (k == 'only') { delete S.cfg.patt; if (v == 'zeta' && !S.cfg.zeta) S.cfg.zeta = zNorm(ZDEF); if (v == 'mix' && !(S.cfg.mix || []).length) S.cfg.mix = ['mul', 'div']; } save(); home(); };
A.cfg = (d) => { const [k, v] = d.v.split(':'); setCfg(k, k == 'only' ? v : +v); };
A.mix = (d) => {
  S.cfg = Object.assign({ dur: 120, only: 'mix' }, S.cfg);
  const m = new Set(S.cfg.mix || []);
  if (m.has(d.v)) {
    if (m.size <= 1) return toast('Keep at least one skill in the mix.');   // an empty mix would silently become "all skills"
    m.delete(d.v);
  } else m.add(d.v);
  S.cfg.mix = [...m]; save(); home();
};
A.customLen = async () => { const v = parseInt(await promptDlg('Custom length', 'Session length in seconds (10 to 3600)', (S.cfg && S.cfg.dur) || 120, { type: 'number', min: 10, max: 3600, ok: 'Use this length' })); if (v >= 10 && v <= 3600) setCfg('dur', v); };
A.start = () => start();
A.daily = () => start('daily');
A.survival = () => start('survival');
A.sprint = () => start('sprint');
A.review = () => { if (Object.keys(S.weak).length) start('review'); };
A.drill = (d) => drill(d.v);
A.weakest = () => { if (S.sessions.length) drill(weakestSkills(1)[0]); };
/** Practise one skill (optionally one pattern). Uses your saved length and difficulty but never rewrites your saved setup. */
A.aiFocus = () => showAiSheet({ title: 'What to practise today', action: 'recommend', context: { sessions: S.sessions.length, day: ymd() }, extra: (res) => (res.structured && SK[res.structured.skill] ? [{ label: `Start ${res.structured.durationSec / 60}-min ${SK[res.structured.skill].n} drill`, run: () => start(undefined, { dur: res.structured.durationSec, only: res.structured.skill }) }] : []) });

export function drill(k, patt) { start(undefined, { only: k, patt: patt || undefined }); }
A.export = () => exportBackup();

register('home', home);
export { home, SL };

A.recommended = () => start(undefined, { dur: 120, only: 'all', off: 0, patt: undefined });
A.skill = async (d) => {
  const k = d.v, s = S.sk[k], hist = S.sessions.slice(-30).map((x) => ((x.lv && x.lv[k] != null ? x.lv[k] : SK[k].s)) * 100);
  const pats = Object.entries(S.pat).filter(([n, o]) => n.startsWith(SK[k].n + ' · ') && o.n >= 3).map(([n, o]) => ({ n: n.split(' · ')[1], acc: Math.round((100 * o.ok) / o.n), n_: o.n, sp: o.ok ? o.r / o.ok : 0 })).sort((x, y) => x.acc - y.acc).slice(0, 4);
  const wq = Object.values(S.weak).filter((w) => w.sk == k).length, d7 = Math.round((s.lv - lvAgo(k, 7)) * 100);
  const v = await dialog({
    title: SK[k].n + ' · ' + Math.round(s.lv * 100),
    body: `<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px"><div><div class="mu">Accuracy</div><b>${Math.round(s.acc * 100)}%</b></div><div><div class="mu">Speed</div><b>${s.n ? s.spd.toFixed(2) + '× par' : '–'}</b></div><div><div class="mu">7 days</div><b class="${d7 >= 0 ? 'ok' : 'bad'}">${d7 >= 0 ? '+' : ''}${d7}</b></div></div>
      ${spark(hist, COL[k], { w: 420, h: 80, labels: S.sessions.slice(-30).map(sessLabel) })}
      ${pats.length ? '<div class="mu" style="margin:12px 0 4px">Weakest patterns</div>' + pats.map((p) => `<div class="fr"><span>${esc(p.n)}</span><span>${p.acc}% · ${p.sp ? p.sp.toFixed(2) + '×' : '–'} · ${p.n_} tries</span></div>`).join('') : ''}
      ${wq ? `<div class="mu" style="margin-top:10px">${wq} in your notebook</div>` : ''}`,
    actions: [{ label: 'Close', value: false }, { label: 'Learn tricks', value: 'learn' }, ...(s.n > 0 ? [{ label: 'Ask AI', icon: 'sparkle', value: 'ai' }] : []), { label: 'Drill ' + SK[k].n.toLowerCase(), value: 'drill', primary: true }],
  });
  if (v == 'drill') drill(k); else if (v == 'learn') { setLearnFilter(k); go('learn'); } else if (v == 'ai') askSkillAi(k);
};
/** Show or hide the options panel IN PLACE. It used to repaint the whole home screen, which replayed the layout glide on every card (the "blink") and let the page jump to the bottom. Nothing else on screen changes, so only the panel and its button are touched and the scroll position is pinned. */
A.toggleCustom = (d, btn) => {
  const open = !(S.customOpen === true), y = scrollY, panel = document.getElementById('cust');
  S.customOpen = open; save();
  if (!panel || !btn) { home(); return; }                    // panel not on screen: fall back to a normal repaint
  panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? 'Hide options' : 'Customize';
  scrollTo({ top: y, left: 0, behavior: 'instant' }); requestAnimationFrame(() => scrollTo({ top: y, left: 0, behavior: 'instant' }));
};

/* ---------- custom ranges ---------- */
function zetaPanel(cf) {
  const z = zNorm(cf.zeta), r = (x) => x[0] == x[1] ? x[0] : x[0] + '–' + x[1], has = (o) => z.ops.includes(o);
  const parts = [];
  if (has('add') || has('sub')) parts.push(`${has('add') ? '+' : ''}${has('sub') ? ' −' : ''} <b>${r(z.a)}</b> and <b>${r(z.b)}</b>`);
  if (has('mul') || has('div')) parts.push(`${has('mul') ? '×' : ''}${has('div') ? ' ÷' : ''} <b>${r(z.m)}</b> by <b>${r(z.n)}</b>`);
  return `<div class="field"><div class="mu">Ranges</div><div><div style="margin-bottom:8px">${parts.join(' · ')}</div><div class="btns"><button class="btn sm" data-act="zetaEdit">Edit ranges</button><button class="btn sm" data-act="zetaTable">Times table…</button></div><div class="mu" style="margin-top:8px">Fixed difficulty. Ratings stay put, and each setup keeps its own best score and ghost.</div></div></div>`;
}
A.zetaEdit = async () => {
  const z = zNorm((S.cfg || {}).zeta);
  const num = (n, v) => `<input class="inp" style="width:84px;min-height:38px;padding:4px 8px" type="number" inputmode="numeric" min="0" max="9999" name="${esc(n)}" value="${esc(v)}" aria-label="${esc(n)}">`;
  const box = (id, label) => `<label style="display:inline-flex;gap:8px;align-items:center;color:var(--tx);font-weight:600;margin-right:16px"><input type="checkbox" name="op_${esc(id)}" ${z.ops.includes(id) ? 'checked' : ''} style="width:18px;height:18px"> ${label}</label>`;
  const rng = (t, x) => `<div class="mu" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">${t} ${num(x + '0', z[x][0])} to ${num(x + '1', z[x][1])}</div>`;
  const out = await dialog({
    title: 'Custom ranges',
    body: `<div>${box('add', 'Addition')}${box('sub', 'Subtraction')}${rng('First number', 'a')}${rng('Second number', 'b')}</div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ln)">${box('mul', 'Multiplication')}${box('div', 'Division')}${rng('First number', 'm')}${rng('Second number', 'n')}</div>
      <p class="mu" style="margin-top:12px">Subtraction and division are the reverse of the same ranges (for example 9 + 5 becomes 14 − 9), so answers are always whole numbers.</p>`,
    actions: [{ label: 'Cancel', value: false }, { label: 'Use these ranges', value: true, primary: true }],
    collect: (d) => { const f = new FormData(d.querySelector('form')), g = (n) => +f.get(n); return { ops: ['add', 'sub', 'mul', 'div'].filter((o) => f.get('op_' + o)), a: [g('a0'), g('a1')], b: [g('b0'), g('b1')], m: [g('m0'), g('m1')], n: [g('n0'), g('n1')] }; },
  });
  if (out && typeof out == 'object') { S.cfg = Object.assign({ dur: 120 }, S.cfg, { only: 'zeta', zeta: zNorm(out) }); save(); home(); }
};
A.zetaTable = async () => {
  const v = parseInt(await promptDlg('Times table', 'Which table? (2 to 99)', 7, { type: 'number', min: 2, max: 99, ok: 'Practise it', hint: 'Mixes × and ÷ against 2 to 12, so “7 × 8” and “56 ÷ 7” both appear.' }));
  if (v >= 2 && v <= 99) { S.cfg = Object.assign({ dur: 120 }, S.cfg, { only: 'zeta', zeta: zNorm({ ops: ['mul', 'div'], a: ZDEF.a, b: ZDEF.b, m: [v, v], n: [2, 12] }) }); save(); home(); }
};

// The streak sheet: tap the streak anywhere (Home pill, rest-day chip, side rail) to see the streak as a picture.
// A five-week calendar, progress to the next milestone, the rest-day (freeze) status and your past streaks, with a share button.
import { S, avgLv } from '../state.js';
import { esc } from '../util.js';
import { streak, longest, days, restInfo, streakDays, streakRuns, restUsed, STREAK_MARKS } from '../stats.js';
import { restView, REST_NEED } from '../rest.js';
import { icon, dialog, toast } from '../ui.js';
import { A } from '../nav.js';
import { shareCard } from '../share.js';

/** Ring fill: how far you are between the last milestone and the next (full once every one is reached). Same rule as Home's ring. */
const ring = (st) => { const nm = STREAK_MARKS.find((m) => m > st), pm = [...STREAK_MARKS].reverse().find((m) => m <= st) || 0; return !st ? 0 : nm ? (st - pm) / (nm - pm) : 1; };
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const fmt = (t, o) => new Date(t).toLocaleDateString(undefined, o);

/** The share image for a streak: the same card the result screens use. */
function card(st) {
  const lg = longest(), pb = st >= 3 && st >= lg;
  return { tag: pb ? 'Personal best streak' : 'Practice streak', best: pb, big: st, bigLabel: st == 1 ? 'day in a row' : 'days in a row', rows: [['Longest', lg], ['Sessions', S.sessions.length], ['Rating', Math.round(avgLv() * 100)]] };
}

const heat = (cells) => {
  const level = (n) => (n >= 60 ? 3 : n >= 25 ? 2 : 1);
  const head = DOW.map((d) => `<span aria-hidden="true">${d}</span>`).join('');
  const body = cells.map((c, idx) => {
    const cls = ['sd', c.on ? 'on l' + level(c.n) : '', c.rest ? 'rest' : '', c.today ? 'today' : '', c.future ? 'fut' : ''].filter(Boolean).join(' ');
    const tip = fmt(c.t, { weekday: 'short', month: 'short', day: 'numeric' }) + (c.on ? ' · ' + c.n + (c.n == 1 ? ' answer' : ' answers') : c.rest ? ' · rest day' : c.future ? '' : ' · no practice');
    return `<i class="${esc(cls)}" title="${esc(tip)}" style="--i:${idx}">${c.rest ? icon('moon') : new Date(c.t).getDate() == 1 ? esc(fmt(c.t, { month: 'short' })) : new Date(c.t).getDate()}</i>`;
  }).join('');
  const n = cells.filter((c) => c.on).length;
  return `<div class="stk-cal" role="img" aria-label="${esc('Practised ' + n + ' of the last ' + cells.filter((c) => !c.future).length + ' days')}"><div class="stk-dow">${head}</div><div class="stk-grid">${body}</div></div>
  <div class="stk-key" aria-hidden="true"><span>Less</span><i class="sd on l1"></i><i class="sd on l2"></i><i class="sd on l3"></i><span>More</span><i class="sd rest">${icon('moon')}</i><span>Rest day</span></div>`;
};

const mileBlock = (st) => {
  const nm = STREAK_MARKS.find((m) => m > st), pm = [...STREAK_MARKS].reverse().find((m) => m <= st) || 0;
  const pct = nm ? Math.round(((st - pm) / (nm - pm)) * 100) : 100;
  const line = nm ? `<b>${nm - st}</b> ${nm - st == 1 ? 'day' : 'days'} to the <b>${nm}-day</b> mark` : 'Every milestone reached';
  return `<div class="stk-sec"><div class="stk-h"><h4>Next milestone</h4><span>${line}</span></div>
    <div class="bar" role="progressbar" aria-label="Progress to the next streak milestone" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    <div class="stk-marks" aria-hidden="true">${STREAK_MARKS.map((m) => `<span class="${m <= st ? 'hit' : ''}">${m}</span>`).join('')}</div></div>`;
};

const restBlock = (st) => {
  const v = restView(restInfo()), used = restUsed();
  if (!v) return `<div class="stk-rest"><span class="rico">${icon('moon')}</span><div><b>Rest day</b><p>Practise ${REST_NEED} days in a row and you earn one. After that, a single missed day will not break your streak.</p></div></div>`;
  const pips = v.cls == 'earning' ? `<span class="rpips" aria-hidden="true">${Array.from({ length: REST_NEED }, (_, i) => `<i${i < v.filled ? ' class="on"' : ''}></i>`).join('')}</span>` : '';
  const how = v.cls == 'ready' ? 'Miss one day and your streak survives. Play the day after.' : v.cls == 'using' ? 'Yesterday was your rest day. Play today to keep the streak, and you start earning the next one.' : 'Every ' + REST_NEED + ' days in a row earns one rest day.';
  return `<div class="stk-rest ${esc(v.cls)}"><span class="rico">${icon('moon')}</span><div><b class="rt">${esc(v.full)}</b>${pips}<p>${esc(how)}${used ? ` Used so far: <b>${used}</b>.` : ''}</p></div></div>`;
};

const runsBlock = (rs) => {
  const last = rs.slice(-6);
  if (last.length < 2) return '';
  const mx = Math.max(...last.map((r) => r.len));
  return `<div class="stk-sec"><div class="stk-h"><h4>Your streaks</h4><span>latest ${last.length}</span></div>
    <div class="stk-runs">${last.map((r) => `<div class="${r.cur ? 'cur' : ''}"><span class="mu">${esc(fmt(new Date(r.end + 'T12:00').getTime(), { month: 'short', day: 'numeric' }))}</span><span class="rb"><i style="width:${Math.max(4, Math.round((r.len / mx) * 100))}%"></i></span><b class="num">${r.len}</b></div>`).join('')}</div></div>`;
};

A.streakCard = async () => {
  const st = streak(), lg = longest(), D = days(), cells = streakDays(5);
  const total = D.size, recent = cells.filter((c) => c.on).length, passed = cells.filter((c) => !c.future).length;
  const hero = `<div class="stk-hero"><span class="sring big ${restInfo() && restInfo().state == 'ready' ? 'rest' : ''}" style="--p:${esc(ring(st).toFixed(3))}">${icon('flame', 'fill')}</span>
    <div><div class="stk-n"><b class="num">${st}</b><span>${st == 1 ? 'day streak' : 'day streak'}</span></div>
    <p class="mu">${st ? `Longest ${lg} · ${recent} of the last ${passed} days practised` : total ? `Longest ${lg}. Practise today to start a new one.` : 'Finish a session to start your streak.'}</p></div></div>`;
  const body = `<div class="stk">${hero}${restBlock(st)}<div class="stk-sec"><div class="stk-h"><h4>Last 5 weeks</h4><span>${total} ${total == 1 ? 'day' : 'days'} in total</span></div>${heat(cells)}</div>${mileBlock(st)}${runsBlock(streakRuns())}</div>`;
  const go = await dialog({ title: 'Your streak', body, actions: st ? [{ label: 'Close', value: false }, { label: 'Share image', value: true, primary: true }] : [{ label: 'Close', value: false, primary: true }], onOpen: (dl) => dl.classList.add('stksheet') });
  if (go && await shareCard(card(st)) == 'saved') toast('Image saved');
};

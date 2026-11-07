// Pure scheduling + wording logic for daily reminders. No I/O, so it is fully unit-tested.

/** Local calendar date (YYYY-MM-DD), hour and minute for a timestamp in an IANA time zone. Falls back to UTC for a bad zone. */
export function localParts(ms, tz) {
  let f;
  try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const h = +p.hour % 24;
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, h, m: +p.minute, min: h * 60 + +p.minute, wd: new Date(date + 'T12:00:00Z').getUTCDay() };   // wd: 0 = Sunday
}

const WINDOW = 150;   // minutes after the chosen time in which a missed run can still catch up
const SAVE_AT = 20 * 60 + 30;   // optional "save your streak" nudge, 20:30 local

const slotKey = (t) => String(t.h).padStart(2, '0') + ':' + String(t.m).padStart(2, '0');
/**
 * Decide whether a reminder is due now. Returns null or { kind: 'daily' | 'streak', slot }.
 * rec: { times:[{h,m}], days:[0-6], skip, tz, last, streak, sent:{ 'HH:MM': date }, sentS, saveStreak, on }
 */
export function dueKind(rec, now = Date.now()) {
  if (!rec || rec.on === false) return null;
  const L = localParts(now, rec.tz);
  const days = Array.isArray(rec.days) && rec.days.length ? rec.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(L.wd)) return null;
  if (rec.skip !== false && rec.last === L.date) return null;       // already practised today: stay quiet
  const times = Array.isArray(rec.times) && rec.times.length ? rec.times : [{ h: +rec.h || 19, m: +rec.m || 0 }];
  const sent = rec.sent || {};
  for (const t of times) {
    const target = t.h * 60 + t.m;
    if (sent[slotKey(t)] !== L.date && L.min >= target && L.min < target + WINDOW) return { kind: 'daily', slot: slotKey(t) };
  }
  const first = Math.max(...times.map((t) => t.h * 60 + t.m));
  if (rec.saveStreak && (+rec.streak || 0) >= 3 && rec.sentS !== L.date && L.min >= Math.max(SAVE_AT, first + 60) && L.min < SAVE_AT + WINDOW) return { kind: 'streak', slot: 'S' };
  return null;
}

const DAILY = [
  ['Two minutes. That is all.', 'A quick session keeps your mental maths sharp.'],
  ['Your numbers are waiting', 'Warm up with a 2-minute round.'],
  ['Time to think fast', 'Beat yesterday’s speed in 2 minutes.'],
  ['Daily challenge is live', 'Same 60 seconds for everyone today. How high can you score?'],
  ['Small habit, big gains', 'One short session today keeps the progress rolling.'],
  ['Brain gym time', 'Two minutes now and you are done for the day.'],
  ['Ready for a round?', 'Your ratings only climb when you play.'],
];

/** Learn-path retention checks whose time has come, from the list the app last sent ({ at, n, l } each). */
export const retDue = (rec, now = Date.now()) => (Array.isArray(rec.ret) ? rec.ret : []).filter((x) => x && x.at > 0 && x.at <= now);

/** Notification text for a reminder kind. `rec` supplies streak / due counts; `now` picks a rotating variant. */
export function message(kind, rec, now = Date.now()) {
  const st = +rec.streak || 0, due = +rec.due || 0;
  const day = Math.floor(now / 864e5);
  const rd = retDue(rec, now), one = rd[0] ? `${rd[0].n} ${String(rd[0].l || 'check').toLowerCase()}` : '';
  if (kind == 'streak') {
    return { title: `Keep your ${st}-day streak alive`, body: rd.length ? `Your ${one} is ready, and Learn practice counts for the streak.` : 'A 2-minute session before bed is enough.', tag: 'mm-streak', url: rd.length ? '/?go=retain' : '/?go=train' };
  }
  if (rd.length) {   // a retention check is the one thing that cannot be done earlier, so it leads
    const more = due >= 5 ? ` ${Math.min(due, 20)} review questions are waiting too.` : '';
    return rd.length == 1 ? { title: `Your ${one} is ready`, body: 'Six questions show what actually stuck.' + more, tag: 'mm-daily', url: '/?go=retain' } : { title: `${rd.length} retention checks are ready`, body: 'A few minutes shows what actually stuck.' + more, tag: 'mm-daily', url: '/?go=retain' };
  }
  if (due >= 5) return { title: `${Math.min(due, 20)} questions are due for review`, body: 'Spaced review is the fastest way to stop repeating a mistake.', tag: 'mm-daily', url: '/?go=review' };
  const [t, b] = DAILY[day % DAILY.length];
  const flame = st >= 2 ? ` ${st}-day streak, keep it going.` : '';
  return { title: t, body: b + flame, tag: 'mm-daily', url: '/?go=train' };
}

/** Retention checks the app expects to open: at most 26, each a time plus short plain-text names. */
const cleanRet = (a) => (Array.isArray(a) ? a : []).slice(0, 26).map((x) => ({ at: Math.round(+(x && x.at)), n: String((x && x.n) || '').replace(/[^\p{L}\p{N} &'-]/gu, '').slice(0, 24), l: String((x && x.l) || '').replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 24) })).filter((x) => Number.isFinite(x.at) && x.at > 0 && x.at < 8.64e15);

/** Clamp and normalise a client-supplied reminder record so a bad payload can never break the scheduler. */
export function cleanRec(b) {
  const int = (x, lo, hi, d) => (Number.isFinite(+x) ? Math.min(hi, Math.max(lo, Math.round(+x))) : d);
  let tz = typeof b.tz == 'string' ? b.tz.slice(0, 64) : 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = 'UTC'; }
  const date = (s) => (typeof s == 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');
  let times = (Array.isArray(b.times) ? b.times : [{ h: b.h, m: b.m }]).slice(0, 3).map((t) => ({ h: int(t && t.h, 0, 23, 19), m: int(t && t.m, 0, 59, 0) }));
  times = times.filter((t, i) => times.findIndex((u) => slotKey(u) === slotKey(t)) === i);
  if (!times.length) times = [{ h: 19, m: 0 }];
  const days = [...new Set((Array.isArray(b.days) ? b.days : [0, 1, 2, 3, 4, 5, 6]).map((d) => int(d, 0, 6, -1)).filter((d) => d >= 0))].sort();
  return { times, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6], skip: b.skip !== false, tz, last: date(b.last), streak: int(b.streak, 0, 9999, 0), due: int(b.due, 0, 9999, 0), saveStreak: b.saveStreak !== false, on: b.on !== false, ret: cleanRet(b.ret) };
}

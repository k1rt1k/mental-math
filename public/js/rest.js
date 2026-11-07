// Rest-day allowance, shown plainly. Pure: restView turns stats.restInfo() into words and pips; restChip draws it.
export const REST_NEED = 7;

/** rest: { state: 'ready' | 'using' | 'earning', left, since } or null. */
export function restView(rest) {
  if (!rest) return null;
  if (rest.state === 'ready') return { cls: 'ready', label: 'Rest day ready', full: 'Rest day ready: one missed day will be forgiven.', filled: REST_NEED };
  if (rest.state === 'using') return { cls: 'using', label: 'Rest day in use · play today', full: 'Your rest day is in use. Play today to keep the streak.', filled: 0 };
  const filled = Math.max(0, Math.min(REST_NEED - 1, REST_NEED - rest.left));
  return { cls: 'earning', label: filled + '/' + REST_NEED, full: rest.left + (rest.left == 1 ? ' more day' : ' more days') + ' in a row earns a rest day.', filled };
}
const pips = (n) => '<span class="rpips" aria-hidden="true">' + Array.from({ length: REST_NEED }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('') + '</span>';
/** HTML for the chip. `icon` is ui.js's icon(); `esc` escapes text. Always carries the full sentence as its label so a phone, which has no tooltip, still gets it. */
export function restChip(rest, icon, esc) {
  const v = restView(rest);
  if (!v) return '';
  return `<span class="pill rest ${v.cls}" role="img" aria-label="${esc(v.full)}" title="${esc(v.full)}">${v.cls === 'earning' ? pips(v.filled) : icon('moon')}<span>${esc(v.label)}</span></span>`;
}

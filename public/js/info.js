// The "i" explainer sheet. A button anywhere carries data-act="info" data-v="<key>"; tapping it opens a short sheet
// (slides up on phones, pops in on larger screens). Text and button markup live in infotext.js. Nothing here touches data.
import { A } from './nav.js';
import { dialog } from './ui.js';
import { INFO, ib, ibs } from './infotext.js';

export { INFO, ib, ibs };

export function openInfo(k) {
  const x = INFO[k];
  if (!x) return Promise.resolve();
  return dialog({
    title: x[0],
    body: x.slice(1).map((p) => `<p>${p}</p>`).join(''),
    actions: [{ label: 'Got it', value: true, primary: true }],
    onOpen: (d) => d.classList.add('info'),
  });
}
A.info = (d) => openInfo(d.v);

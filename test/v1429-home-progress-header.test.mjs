import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const home = rd('js/views/home.js'), progress = rd('js/views/progress.js'), style = rd('css/style.css'), main = rd('js/main.js'), state = rd('js/state.js'), ui = rd('js/ui.js');

test('Home: the backup reminder is one slim line that can be hidden for a week, per device', () => {
  assert.match(home, /class=\\"notice slim\\"|class="notice slim"/);
  assert.match(home, /now > \(S\.bkSnooze \|\| 0\)/);                         // hidden while snoozed
  assert.match(home, /A\.dismissBk = \(\) => \{ S\.bkSnooze = Date\.now\(\) \+ 7 \* 864e5; save\(\); home\(\); \};/);
  assert.match(state, /DEVICE_LOCAL = \[[^\]]*'bkSnooze'/);                    // a snooze on one device must not silence another
  assert.match(style, /\.notice\.slim \{[^}]*background: none[^}]*border: 0/);
});

test('Home: Start is the one big button; Ask AI is a ghost button beside it', () => {
  assert.match(home, /class="btn ghost ask" data-act="aiFocus"/);
  assert.doesNotMatch(home, /class="btn lg" data-act="aiFocus"/);
  assert.match(style, /\.hero \.btn\.ask \{[^}]*flex: none/);
  assert.match(style, /\.hero \.btns \{ flex-wrap: nowrap; \} \.hero \.btn\.lg \{ flex: 1 1 auto/);   // the tablet/phone rule that used to make Start width:100% and push Ask AI onto its own row
});

test('Home: plan rows read as buttons (icon tile + chevron), not checkboxes', () => {
  assert.match(home, /STEP_IC = \{ train: 'target', review: 'redo', daily: 'cal' \}/);
  assert.match(home, /<em class="go" aria-hidden="true">\$\{icon\('chev'\)\}<\/em>/);
  assert.match(ui, /chev: '<path/);
  assert.doesNotMatch(style, /\.step i \{[^}]*border: 2px solid var\(--mu2\)/);          // the empty ring is gone
});

test('Home: the sync chip is an icon with a status badge and a name, and main.js refreshes its label, not its first span', () => {
  assert.match(home, /<span class="sico">\$\{icon\('cloud'\)\}<i><\/i><\/span><span id="sy">/);
  assert.match(home, /'Sync is off\. Set up sync'/);
  assert.match(main, /el\.querySelector\('#sy'\)/);
  assert.doesNotMatch(main, /el\.querySelector\('span'\)/);                               // the first span is now the icon wrapper; writing text into it would delete the icon
});

test('Progress: one Filters chip and the AI button above the tabs; the two segmented controls live in a folding panel', () => {
  assert.match(progress, /<div class="hd"><h1>Progress<\/h1><\/div>/);                  // no controls in the page header any more
  assert.match(progress, /class="btn sm fchip/);
  assert.match(progress, /data-act="pfilters" aria-expanded="\$\{fOpen\}" aria-controls="pf"/);
  assert.match(progress, /<div id="pf" class="pf" \$\{fOpen \? '' : 'hidden'\}>/);
  assert.match(progress, /A\.pfilters = \(d, btn\) => \{ fOpen = !fOpen;/);
  assert.match(progress, /filterable = tab == 'overview' \|\| tab == 'skills'/);        // Tables and History never had these filters
  assert.match(style, /\.pf \.seg \{ display: flex; width: 100%; \}/);
});

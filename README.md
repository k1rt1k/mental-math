# Mental Math Trainer 14.50 – fractions, negatives, real-life maths, and lighter sync

## v14.50
- **Three new skills, so the content is no longer only whole non-negative numbers.** *Negatives* (crossing zero, subtracting a negative, signed × and ÷, chains), *Fractions* (a fraction of a number, simplifying, same and unlike denominators, ×, ÷; answers in lowest terms) and *Real-life* (tips, sale price, tax, successive discounts, unit conversion, clock gaps, recipe scaling, ratios, speed, unit price, splitting a bill). Each has twelve difficulty levels, tips, worked methods, guided five-stage Learn paths with shortcut drills, and its own rating on the skill radar. Existing data gains them at their starting level on load.
- **One extra key, only when needed.** Answers can now contain `−`, `/` or `.`. The pad's empty corner becomes that skill's key (minus for Negatives, slash for Fractions, point for Real-life) and is invisible on every other question, so the keypad does not give away which sign an answer has. The keyboard `-`, `/` and `.` work too, and the touch-keyboard fallback switches to a text keyboard for those questions. A symbol the question does not use is ignored.
- **Matching.** `ansMatch` (engine.js) is exact text, plus the same value for decimals (`.5` for `0.5`) and an equal fraction of the same length (`6/8` for `3/4`). Auto-submit, near-miss forgiveness, Enter-to-submit, the Learn dialogs, review and the notebook all use it. Par time counts a minus, point and slash as keystrokes.
- **The Daily challenge is unchanged**: it still draws only from the original ten skills (`CORE`), so its questions stay the same for everyone and need no symbol key.
- **Delta sync.** A save now sends only the sessions newer than a per-device cursor, plus a count-and-sum fingerprint of the whole history. The server unions them and refuses (409) on a mismatch, in which case the client sends a full save, exactly what every save used to be. Full saves are still used for the first save, after an erase, with a new sync key, and whenever the delta would be more than half the history. With 3,000 sessions a save is about 50× smaller.
- **gzip.** Bodies over 2 KB are gzip-compressed by the browser (`CompressionStream`). The server recognises gzip by its first bytes, caps the decompressed size, and answers 400 on corrupt input and 413 on a bomb. A server that rejects gzip makes the client send plain JSON from then on.
- **Conditional pulls.** The server returns the state's ETag; a client that already holds it gets `{unchanged:true}` instead of the whole state. A save that failed offline is still retried because a pull that decides to push marks the state dirty first.
- Not included yet: **estimation** (answers within a tolerance), mixed numbers, and fraction-to-decimal conversion. Tests: `test/v1449-new-content.test.mjs`, `test/v1449-delta-sync.test.mjs`. The calibration test now runs 30 sessions (13 skills get the per-skill exposure 24 gave 10).


## v14.49
- **Reset and Replace now work while sync is on.** Both used to be undone by the next sync, because the merge simply re-added everything from the cloud. A Reset or an Import → Replace now stamps `S.wipe` (the time of the newest erase). The server accepts a save with a newer `wipe` as the one kind of save allowed to drop sessions, and refuses (409) a device that has not heard about the erase, which then merges and adopts the erased state instead of pushing its old data back. `mergeStates` follows the same rule: when the two sides disagree about `wipe`, the newer one wins outright, and only settings still merge. Backups and safety copies are merged back as a union (`asCurrent`), so Recover and Import → Merge are unaffected.
- **Explicit choices, typed confirmation.** With sync on, Reset offers *Erase everywhere* (type `ERASE`), *Download a backup, then erase everywhere*, and *Reset this device only* (which turns sync off on this device so the cloud copy stays). Import → Replace becomes *Replace everywhere* (type `REPLACE`). Undo after an erase is itself newer than the erase, so it restores the cloud copy too. If the device is offline, the erase completes on the next sync.
- **The server always keeps what an erase destroys.** An erase writes `backup-pre-erase` and refreshes `backup` even if a daily copy is fresh, but never overwrites them with an already-empty state. A wipe time more than a day in the future is rejected so it cannot lock the other devices out.
- **Typo forgiveness.** When the answer is the right length and wrong only in its last digit, and that digit is a keypad neighbour of the right one (phone or numpad layout, diagonals included), nothing is counted for 1.5 s: the digits turn amber, and Backspace or typing the right digit fixes it with no slip and no lost life. If the window runs out it becomes the slip it was. Once per question; the clock keeps running. Settings → Practice → *Forgive near-miss typos* (on by default, synced).
- **Enter to submit.** Settings → Practice → *Enter to submit* (off by default, synced) judges nothing until Enter or the new Submit button, so any digit can be corrected and the answer's length is not revealed. In this mode Enter never skips; Space and the Skip button do (the on-screen Skip now sends its own `Skip` key).
- Version 14.49, cache `mm-v14-49`. Tests: `test/v1449-reset-and-typos.test.mjs`; `test/v55.test.mjs` now turns the grace off because it deliberately types near-miss slips.


## v14.48
- **Settings sync across browsers and devices.** Theme, accent, question font, text size, high contrast, colour-blind colours, larger answer text, reduce motion, focus layout, keypad (on/off and layout), pace readout, countdown, sound, vibration, auto-pause, daily goal, the current session setup and Saved setups now travel with your sync key. A new browser or phone looks and behaves like your others as soon as sync is set up; nothing is re-entered per device.
- **Newest change wins, per setting.** Each setting has its own change time in `S.pt`, stamped in `save()` only when its value actually changes (loads, merges and imports never stamp). Changing the theme on the laptop and the keypad layout on the phone keeps both; setting the theme back to Auto is a change too. Data from before this version has no times: a device keeps its own value and a device that never set one adopts the account's, so nothing flips unexpectedly on upgrade.
- **Repaints live.** A settings-only change from another device now repaints on the next sync (it used to be missed whenever the other device had saved more recently), and a newer local setting is pushed even if the server's session data looks identical.
- **Stays per device (by design):** reminders (they belong to this browser's push subscription), which panels are open, and the backup-banner snooze. Reset keeps your appearance and input settings, as before; goal and saved setups are still cleared by Reset.
- **Not synced:** AI Coach history and cached AI replies are local caches, not settings.
- Version 14.48, cache `mm-v14-48`. Tests: `test/v1448-settings-sync.test.mjs`, plus updates to `test/audit.test.mjs` and `test/v80.test.mjs` (they asserted the old per-device rule).


## v14.47
- **Guided paths for every skill.** Learn now opens with a five-stage journey for each of the ten skills: Foundation → Intermediate → Mental shortcuts → Independent practice → Mastery assessment. Each stage teaches the method in plain language, then offers a worked example before the timed drill.
- **Show, don't tell.** The worked example is interactive: solve the question or reveal the method, and the stage records that the demonstration was seen. A stage completes only when both the example and the assessment are ticked, so a lucky run does not skip the teaching.
- **Assessment goals, not just minutes.** Every stage has an explicit bar — answers, first-try accuracy and pace against par. The Mastery stage adds a delayed-retention gate for that skill: at least five clean question pairs answered again after seven days, with 60% retained. Previous best runs and passes are kept, so a bad run never erases progress.
- **Pattern rotation.** Shortcut stages rotate through every trick pattern that has a generator link (for example ×11, ×25, ×99/×101 and near-100 for multiplication), instead of drilling one pattern forever. The rotation is per-run and is never saved or replayed on Start.
- **Sync-safe path progress.** `S.paths` stores one row per skill and stage with the best run, demo and pass timestamps. Migration rejects unknown skills/stages and strips the per-run pattern list; merge keeps the best run and treats demo/pass as monotonic.
- **Calibration simulation.** `tools/sim.mjs` drives the real Session with beginner, intermediate, advanced and uneven synthetic learners. `npm run calibrate` reports difficulty jumps, cold streaks, rough sessions, pattern concentration, skill exposure and the gap between final ratings and latent ability. The suite fails if difficulty jumps more than two levels in a session, a pattern takes over, a skill is never served, or ratings stop tracking ability.
- **Results link back.** A finished path stage shows a pass/retry banner on the results screen with an Open path button, and Play again repeats the same stage.
- Version 14.47, cache `mm-v14-47`. Tests: `test/v1447-paths.test.mjs`, `test/v1447-calibration.test.mjs`, plus the existing retention, mastery, sync and deployment suites.

## v14.46
- **7-day retention.** Progress now answers the question the other charts cannot: how much maths do you still remember after a week? It compares your accuracy the first time a question appears with your accuracy when the same question comes back at least seven days later. The big number is delayed recall; the line under it is your initial accuracy and the number of question pairs behind it.
- **Honest collection.** Only questions answered both times are counted. A delayed answer counts only when it is first-try and unhinted; a hinted answer is ignored and the next clean attempt is used, so a hint can neither inflate nor deflate the result. Five pairs are needed before a percentage appears, and the card shows how many are still waiting instead of inventing a number.
- **Separate from mastery.** The existing mastery ledger and its "never slipped since" count stay in the Notebook. A mastered question that is later missed still re-opens at stage 0 and records exactly one lapse.
- **Bounded history.** The new `S.recall` ledger keeps one compact row per question, is capped, drops the oldest pending baselines first, and merges as a union across devices. A completed pair is never stitched from one device's baseline and another device's outcome.
- Version 14.46, cache `mm-v14-46`. Tests: `test/v1446-retention.test.mjs`, plus the existing mastery, sync and deployment suites.

## v14.45
- **Five-step mastery review.** A missed question now needs five fast, first-try, unhinted correct retrievals, spaced by 10 minutes, 1 day, 3 days and 7 days, before a final check takes it out of active review. A slow, hinted, slipped or same-session-retry answer keeps the stage where it is.
- **Mastery history.** Retired questions move into `S.mastered`, keyed by the canonical question, so their first mastery date, successful retrieval count, number of lapses and last lapse are kept. The Notebook lists them under Mastered and can put one back into review without erasing that history.
- **Retention.** Progress has a Retention stat: the share of mastered questions that have not been missed since. A missed mastered question re-opens the Notebook at stage 0 and counts exactly one lapse.
- **Conflict-safe cloud sync.** `PUT /api/sync` now reads the state's ETag and writes with `onlyIfMatch` (or `onlyIfNew`), retrying a racing write up to three times before returning HTTP 409 for the client to merge. The guard against dropping a server session is checked against each retry, and safety backups are only written after a successful swap, so a conflict can never overwrite a valid backup.
- **AI self-test pacing.** `tools/ai-selftest.mjs` now counts requests accurately (15 per model, 25 with `--probe` and `--latency`), runs every generation call through a rolling 12-RPM per-model scheduler, paces the thinking-level probe and latency runs too, and accepts `--actions=coach,plan` to test only the AI actions you care about.
- **Deployment docs.** The backend verification section now matches the shipped build: version 14.45, Gemini 3.5 Flash-Lite as primary and 3.1 as backup, with the matching `/api/ai` response.
- Version 14.45, cache `mm-v14-45`. Tests: `test/v1445-mastery.test.mjs`, `test/sync.test.mjs`, `test/ai-selftest-pacing.test.mjs`, `test/readme-deployment.test.mjs`.

## v14.44
- **Offline checked for real:** with the service worker active, the app was loaded, the network cut, and the page reloaded: Home boots from the cache, the offline pill shows, a Train session starts, and the pill disappears when the network returns. Every file under `public/` is in the precache list and every import resolves.
- The offline pill reads just "Offline" on phones so the header keeps its row.
- Version 14.44, cache `mm-v14-44`.

## v14.43
- **Touch targets:** the small Drill / Ask AI buttons in table rows are 36px tall on touch screens (they were 28px).
- **Audit, no change needed:** every screen at 390px was checked for duplicate ids, controls with no accessible name, images without alt, sideways scroll and console errors; Train, Daily, Survival, Sprint, Review and Drill-weakest were each played through with hint, skip, a wrong answer, pause and end, with no errors. The info (i) buttons already have a 44px hit area; the times-table squares stay 27px because 12 columns must fit a phone.
- Version 14.43, cache `mm-v14-43`.

## v14.42
- **Progress (phones):** the odd last stat tile ("Best 2-min train") is now one compact line, label on the left and number on the right, instead of a tall, mostly empty card. Rows no longer all stretch to the tallest tile; tiles in the same row still match.
- Version 14.42, cache `mm-v14-42`.

## v14.41
- **Saved setups (Home):** Customize > Saved setups > "+ Save this setup" stores the current length, skills and difficulty under a name (max 6). Each shows as a one-tap chip under the length row that applies it and starts. Delete from the same panel. Stored in `S.presets` (syncs like other settings, last write wins).
- **Results:** a new best says "Beat your best by N pts" (or N s for Sprint). `finish()` now returns `bestBy`.
- **Play:** the points counter counts up to the new total (about a quarter second) instead of jumping; Reduce motion and tiny gains set it directly.
- **Home:** a "Review queue" card says "Nothing to review" or "Nothing due right now · next one in …" (with Review early) instead of leaving the question open; phones show "Evening" rather than "Good evening" so the header stays on one line; an "Offline · still works" pill appears beside the sync chip only while the device is offline.
- **Coach (wide screens):** Your performance and Strengths & recurring slips sit side by side at equal height, with the analysis full width below. This removed the blank area under the right column. Phones stack as before.
- **Results:** rating-change pills pop in one after another (off under Reduce motion).
- **Reduce motion audit:** the blanket rules in `style.css` already cover both the OS setting and the in-app toggle for every CSS animation; the JS-driven ones (`pulse`, `morph`, confetti, points roll) check the same two flags. Nothing needed changing.
- **Not built:** Resume on Home. A run cannot be left while paused in the app, and a closed or killed tab already saves the answers given so far, so there is nothing to resume without a much bigger change (persisting live question state).
- Version 14.41, cache `mm-v14-41`. Tests: `test/v1441-presets-bestby.test.mjs`.

## v14.40
- **Coach:** the "Common Mistakes" panel now reads "No recurring slips recorded yet." instead of "None logged", and the Quick Actions box (which repeated Home) is gone.
- **Home:** the "Saved only on this device" banner keeps Back up and dismiss; sync is prompted from the sync chip only.

## v14.34

- **Progress stat cards** are one height (they stretch to match the tallest, rows included) instead of sizing to their own text.
- **Coach "Your performance" tiles** now use their own 4-column grid, so they fill the card evenly (2 by 2 on phones) instead of leaving the right third of the row empty.
- **"i" buttons rebuilt.** The old italic letter sat off-centre in its circle, so the icon is now a small SVG (dot and stem), centred to within 0.1px. ~55 buttons were cut to about 50 of the genuinely useful explainers; the obvious ones (Theme, Question font, sound, vibration, countdown and so on) and the ones that don't fit cleanly (streak pill, Your skills summary) are gone. They sit inline next to a label, with a lone i glued to the last word so it never wraps onto its own line. The explainer list is pinned in `test/info-keys.txt`. Version 14.34, cache `mm-v14-34`.

## v14.32 (rest of the feature list)

- **Share image.** Results has a **Share image** button next to Share result. `js/share.js` draws a 1080×1350 PNG on a canvas (score or Sprint time, correct, accuracy, best streak, average, streak, and a star for a new best) and opens the share sheet where the browser can share files, otherwise it downloads the image. Nothing is uploaded. `js/share.js` is in the precache list.
- **Pace readout** (Settings > Practice, off by default). Play already had a colour-coded per-question bar against your target time; this adds the number beside the combo chip, for example "1.8 / 3.4 s", in the same colour.
- **Backup reminder.** It already existed (Home banner after 12 days without a download, snoozed 7 days, hidden once sync is on). Settings > Backup now shows how long ago the last download was and when the reminder appears.
- Version 14.32, cache `mm-v14-32`, backend 14.32. Tests added to `test/v1432-rest-day.test.mjs`.

## v14.31 (features pass, on top of 14.30)

## v14.31 (features pass, on top of 14.30)

- **Rest day is now visible.** The app already forgave one missed day after 7 practised days in a row, but nothing showed it, so a miss felt like losing the streak. `restInfo()` in `stats.js` reports `ready` (one missed day is forgiven), `using` (yesterday was the rest day, play today) or `earning` (N more days in a row). Home shows a green dot on the streak ring while a rest day is banked, and the ring tooltip says where you stand. Progress > Streak shows the same status under the number. The rule itself did not change, so no separate "freeze" was added.
- **Notebook has a real Drill button.** Every missed question has a primary **Drill** button on its card: it drills that question's pattern (for example "no carry") or, when it has none, the whole skill. The tiny Drill button in the Progress skills table is unchanged.
- **Accessibility settings** (Settings > Appearance, device-local): **Colour-blind friendly colours** (right is blue, wrong is orange; the existing shake and ring cues still apply) and **Larger answer text** (bigger digits in the answer box). High contrast and Text size already existed.
- Tests: `test/v1432-rest-day.test.mjs`. Version 14.31, cache `mm-v14-31`, backend 14.31.

## v14.30 (everything since 14.27, in one release)

- **Progress cards explain themselves.** Streak, Rating, Sessions, Zetamac estimate and Best 2-min train each have a small `i` button that opens a one-line explanation under the number, in place. The cards no longer stretch to match an open neighbour. "Best 2-min train" already spans the full row on phones (an odd last stat card does).
- **Streak ring (Home).** The flame in the streak pill sits in a ring that fills toward the next milestone (3, 7, 14, 30, 60, 100, 200, 365 days) and grows in on first paint. The tooltip says how many days are left. A streak that has just hit a milestone shows an empty ring, which is correct.
- **Play motion.** The answer flash is stronger (a wider ring plus a brief tint of the card), and each countdown number pulses with a glow as it pops. Both switch off under Reduce motion. Haptics were already in (14.20: tap, wrong, combo, countdown), so none were added.
- **Charts fade in** on first paint instead of popping. In-place repaints do not replay it.
- **Light theme has more separation.** Page background, card surface and borders are each a step stronger, and card shadows are slightly deeper. The high-contrast option still overrides the borders.
- **Numpad: unchanged on purpose.** The empty bottom-left key is not needed for minus or decimal: every generated answer is a whole number of at least 0 (checked over 39,000 questions, and guarded by a test). A Hint key there would also sit next to 0 and Backspace, where a mis-tap costs half the points.
- New CSS lives in `public/css/extras.css` (linked after `motion.css`, in the precache list), because `style.css` is at the 1100-line budget in `test/v110.test.mjs`.
- Version 14.30, service-worker cache `mm-v14-30`, backend `AI_BUILD_VERSION` 14.30.
- Tests: `test/v1431-visuals.test.mjs`. Older tests that pinned 14.27 were updated to 14.30.

### Home and Progress header work (originally listed as unreleased)

- **Home above the fold (phone).** The session card's Start button now sits above the tab bar at 390×844 (it was under it).
  - The "Saved only on this device" reminder is one flat line with a dismiss button (hides it for 7 days; `S.bkSnooze`, device-local like `skOpen`, so it never syncs).
  - **Ask AI** is a ghost button beside **Start** instead of a second full-width button under it.
  - The Practise / Review / Daily rows have an icon tile (a green check once done) and a chevron, so they no longer look like checkboxes.
  - The sync chip is a cloud icon with a status badge and an accessible name, so the phone layout, which hides its label, no longer shows a bare dot. `main.js` now refreshes the chip's `#sy` label and `aria-label` (it used to write into "the first span", which is now the icon wrapper).
- **Progress filters fold away.** On Overview and Skills the two segmented controls and the AI button took ~170px before any data. A single "All · Last 40" chip (highlighted when a filter is active) opens a panel with both controls, in place and without a repaint; "AI read" sits beside it. Tables and History still have no filters. The first data card starts ~106px higher at 390px.
- Tests: `test/v1429-home-progress-header.test.mjs`. `style.css` is now 1098 lines against the 1100-line budget in `test/v110.test.mjs`, so the next CSS change has to fold rules onto existing lines or trim something. `test/sync.test.mjs` needs `@netlify/blobs` installed (`npm install`) to run.

- **Browser layout smoke test.** `npm run test:browser` loads all six tabs (and every Progress sub-tab, and Home with Customize open) at 360px and 412px with a seeded learner. It fails on any `.chip`, `.btn` or `.pill` whose text is clipped or collapsed, and on sideways page scroll. It is not part of `npm test` because it needs a browser. One-time setup that leaves `package.json` and the lockfile alone: `npm i --no-save playwright && npx playwright install chromium`. `MM_PUBLIC_DIR=/path/ npm run test:browser` tests another build. Run against the 14.26 CSS with the chip guard removed, it reports the collapsed chips.
- **Ripple uses `overflow: clip`** (with `overflow: hidden` as the fallback) on `.btn`, `.opt`, `.seg button`, `.tabs2 button`, `.chip`, `.step`, `.lnk2` and `.syncdot`. `clip` does not make a scroll container, so these keep their automatic minimum width in no-wrap flex rows. Checked in Chromium: with the `.chips.fscroll > .chip { flex: none }` guard removed, nothing collapses. The guard stays as a second line of defence.
- **Notebook count means one thing.** `reviewPlan()` in `state.js`: Review covers what is due when any items are due, otherwise everything saved, capped at 20. The button reads "Review 4 due" (or "Review 8" when none are due), and a Review session now stops after the due items instead of carrying on into items that are not due yet.
- **Every text attribute built from data goes through `esc()`** (`data-*`, `name`, `id`, `aria-label`, `title`, `value`, `type`, and so on). `test/v1428-attr-escape.test.mjs` scans `public/js` and fails on a new unescaped one unless it is added to a short list of number-valued expressions.
- Tests: `test/v1428-review-plan.test.mjs`, `test/v1428-attr-escape.test.mjs`; one assertion in `test/v1426-header-controls.test.mjs` updated for the new ripple rule. 

## v14.27

- Customize / Hide options now opens the panel in place (no full-screen repaint, no blink) and pins the scroll position; in-place repaints can no longer move the page, and scroll anchoring is off on the main column.
- Version 14.27, service-worker cache `mm-v14-27`.


## v14.26
- **Fix: skill filter chips collapsed to bare dots on phones (Learn, Notebook).** The v14.24 touch ripple gave `.chip` `overflow:hidden`, which removes a flex item's automatic minimum width, so in the no-wrap swipe row every chip shrank (to ~30px) and clipped its label ("All" showed as "Al", the rest as dots). `.chips.fscroll > .chip` is now `flex: none`, so chips keep their natural width and the row scrolls.
- **Fix: Notebook header on phones.** "Clear all" wrapped onto a line of its own with the ghost button's padding, so it looked misaligned. It now takes a centred full-width row under "AI: find my patterns" / "Review n now"; header buttons are centred and capped at the container width.
- Version 14.26, service-worker cache `mm-v14-26`.

## v14.25
- **Repaints no longer teleport (`public/js/morph.js`).** Screens are painted with `innerHTML`, which threw the old DOM away, so a toggle, a sync or a list change snapped to its new state: the switch knob, bars, chips and the segmented highlight had no element left to transition. An in-place repaint of Home, Coach, Learn, Progress, Notebook or Settings now patches the existing elements instead. Every transition you already had now runs on every state change, and focus, caret, scroll position and selection survive. Things that moved glide to their new place (FLIP, using the independent `translate` property so hover lifts are untouched), new things ease in, removed things fade out as a ghost, and numbers roll to their new value. Navigation, Play and Results still replace the DOM exactly as before. A patch that throws falls back to the old replace. Under Reduce motion the state is patched but nothing moves.
- **Theme and accent glide.** The palette is registered as typed `<color>` properties (`@property`, section 0 of `motion.css`) and transitions on `:root`, so switching theme or accent fades surfaces, borders and ink together. Browsers without `@property` cut as before.
- **Results has an entrance.** Only navigation turned the entrance on, so the results screen (count-ups, gold sweep, level-up pop) appeared with none of it. Results now call `enter()`; the next-up card and buttons cascade in.
- **Play.** The screen builds in a short cascade; every countdown number pops; typed digits land one by one and a finished answer pops; the answered question slides away while the new one rises in; the feedback line eases in; points, streak and (in the last ten seconds) the clock pulse when they change; "last answers" and "by skill" insert rows with a glide instead of rewriting; a lost life swells and breaks; the pause card fades in and out.
- **Touch and scroll.** Tappable cards, rows and fold headers squeeze under a finger and release softly; fields lift a hair when focused; the tab bar and sticky sub-tabs gain a shadow only once content scrolls under them.
- Fix: the activity heatmap set `--c` (the card surface colour) to a column number on every cell; it now uses `--wc`.
- Version 14.25, service-worker cache `mm-v14-25`, `js/morph.js` added to the precache list.

## v14.24
- **Motion smoothness pass.** Same animations, fixed behaviour. Presses are fast and releases are soft; every hover/press property is in a transition list so nothing snaps; hover light on mode tiles and skill cards is one fading `::after` layer (the old hover swapped the background, which cannot animate); entrance grids no longer fade twice (grid and items); chart bar/heatmap staggers are capped so they finish inside the entrance window; dialogs animate out as well as in (`exit()` in `motion.js`, same `close` event and `returnValue`); count-ups wait for their element to become visible; the wrong-answer shake is damped; switches stretch under the thumb; folds glide open/shut where `::details-content` is supported.
- **Calmer glow.** No pulsing halo on the Start button (and no auto sheen on load; the sheen still plays on hover and tap). Tinted shadows on primary buttons, the hero, the logo, the rail bar and the active tab are now restrained depth.
- **Performance.** The page glow drift runs on desktop only (on phones a moving layer under the blurred tab bar forced a re-blur every frame); the toast no longer keeps a `backdrop-filter` while hidden; the streak flame animates transform only.
- **Motion everywhere (section 11 of `motion.css`).** Screen changes crossfade (View Transitions, the old screen fades while the new one rises); settings rows, fields, chips, notices, chat messages, dialog options, the keypad and the results hero all arrive in staggered cascades; scroll-reveal now works on desktop too; countdown digits pop; buttons, rows, linked cards, links and inputs answer hover the same way.
- **Nothing left without motion (section 12 of `motion.css`).** A zero-specificity safety net gives every button, tab, summary, select, label, input and link a transition, a press, and a focus ring that grows in; swatches, step tiles, the sync dot and text buttons got their own; touch ripple now covers chips, steps and text buttons. Segmented controls and sub-tabs have one highlight that glides to the new choice (`slide()` in `motion.js`).
- Version 14.24, service-worker cache `mm-v14-24`.

## v14.23
- **Fix: screen shifting when tapping a tab to the right.** The slide-in from the right overflowed the page edge and phones panned sideways for a moment. Horizontal overflow is now clipped (so sticky headers still work) and the slide is 12px instead of 18px. Version 14.23, cache `mm-v14-23`.

## v14.22
- **Premium pass 2 (section 10 of `motion.css`).** Phone tab bar: one pill glides between tabs (measured in `motion.js`, so it fits any width). Desktop/tablet rail: the active item gets a lit accent bar. Touch ripple on buttons, options and tabs. Play: a wrong answer shakes the question, a right one pops the streak flame, which flickers while the streak lives. Results: score and stats count up, a new best gets one gold sweep and a twinkling star, a level-up pops in. All off under Reduce motion.
- Version 14.22, service-worker cache `mm-v14-22`.

## v14.21 (touch parity)
- **Phone parity.** The light that followed the cursor now follows a finger: pressing a Train tile or skill card lights it where you touch, in its own colour, with the coloured border and shadow, drags along as you move, and fades on release. Primary buttons sweep a sheen on tap, and the Home start button catches the light once after it pulses. The page glow now breathes on phones too (transform only, paused during a session). The active tab springs up when you land on it, and the logo tilts when pressed. All off under Reduce motion.
- Version 14.21, service-worker cache `mm-v14-21`.

## v14.20
- **Every chart is now interactive.** Hover, tap or drag across any trend line, the per-day bars, the skill radar, the goal ring, the race-against-your-ghost chart and the activity heatmap to read the exact value in a tooltip (session date and time, change since the previous one, you vs your ghost at that second, a skill's rating and accuracy, answers on a given day). A click or tap pins the tooltip. Keyboard: focus a chart, then ←/→ (or Home/End) to move, Esc to clear; the heatmap uses ←/→ for weeks and ↑/↓ for days. One delegated handler in `charts.js` serves every chart, so views that repaint stay interactive. Vertical page scroll still works on touch.
- **Motion layer** (`public/css/motion.css`, `public/js/motion.js`). One easing family and three durations. Screens arrive as a short cascade (blocks, then grid items); charts draw themselves (lines trace in, bars grow, the radar blooms, the goal ring sweeps, heatmap cells ripple in by week); stat numbers count up; cards and mode tiles lift on hover and press on tap; folds, dialogs and AI answers ease in; the answer ring pulses out on correct/wrong in Play; tooltips glide between points. Arrival motion only runs on navigation, when a dialog opens or when a fold opens, never on in-place repaints (the `#main.enter` window is now 1.1 s so chart animations can finish). All of it is disabled by Reduce motion and by the OS setting.
- **Phone motion.** Screens slide in from the side of the tab you moved towards; blocks below the fold wait and settle in as you scroll to them (charts draw at that moment); the active tab icon lifts and presses squeeze; bottom sheets spring open and can be dragged down by the handle to dismiss; touch targets press in harder; light haptic ticks on taps and a double pulse on a wrong answer where the device supports vibration (Android; off with Reduce motion).
- **Finish pass** (section 8 of `motion.css`). Tabular digits so counting numbers never jitter; cursor-following light on mode tiles and skill cards, tinted by their own colour; a sheen sweep on primary buttons and three gentle pulses on the Home start button; a very slow breathing page glow on desktop; glow on the active nav item; spring toast; frosted, deeper dialog backdrop; softly graded page titles; one-time fade-in of the shell. Fixed: the arrival keyframe no longer pins `transform`, so hover and press effects still work on tiles revealed while scrolling on phones.
- Version 14.20, service-worker cache `mm-v14-20` (also precaches `css/motion.css` and `js/motion.js`).

## v14.19
- **Skill AI on the Home screen.** Tapping a skill card now has **Ask AI** next to Learn tricks and Drill. Home and Progress share one builder (`public/js/skillAi.js`), so both ask the identical question and offer the same drill / review buttons.
- **AI audit, fixes:**
  - **Saved answers now work offline and after the daily budget is used up.** The on-device cache was checked *after* the "offline" and "budget exhausted" short-circuits, so a Gemini answer you already had was replaced by a plain local fallback. It is now checked first; Regenerate still bypasses it.
  - **AI Method sheet:** the title was HTML-escaped twice (a question containing `&` or `<` showed as `&amp;`). It also had no Regenerate and no follow-up; it now behaves like every other AI sheet.
  - **LaTeX tidy-up no longer eats money.** `It costs $5 and $6` used to become `5 and6`. Only real LaTeX spans (backslash command, `^`, `_`, braces) are converted.
  - **Action buttons stay on local fallbacks** (drill, review, practise). Before, they vanished exactly when Gemini was unavailable.
  - Sheet cache raised from 30 to 60 entries now that there are more sheet types.
- Audited and left as is (no defects found): auth (timing-safe, server-side identity), quota store (CAS reservation, per-model RPM, Pacific-day budget), failover and thinking-config handling, JSON recommendation parsing, Coach loading / repaint guards.
- Version 14.19, service-worker cache `mm-v14-19` (also precaches `js/skillAi.js`). Tests: `test/v1418-audit.test.mjs` (316 pass).

## v14.18
- **Four new AI spots, each one tap, each labelled Gemini or local:**
  - **Progress → Weakness map:** an Ask AI button on every skill row (`skill` action): rating and 7-day move, accuracy, speed vs par, that skill's weakest patterns and your misses in it, one technique worked on your own miss, one drill.
  - **Progress → Times-table map:** "AI: memory hooks for these" (`facts` action): a verified hook for each of your weakest facts (anchor on a square, round to 10, or split at 5), plus what they share.
  - **Learn → "AI: which trick next?"** (`nexttrick` action): ranks the 23 library tricks against your skill ratings and per-trick accuracy, and gives one-tap "Practise: …" buttons for what it picked.
  - **Progress → History → any session → "AI read of this session"** (`session` action): strongest and weakest skill and the pace change against your previous same-kind session. It is told the app kept no individual questions for old sessions, so it must not invent any.
- **"Ask a follow-up" on every AI sheet.** Opens the Math Tutor with that reply already in the conversation, so your next question is answered in its context. Only Gemini replies are carried over (local text is never fed back as chat history).
- **Offline fallbacks for all four use only your numbers.** Weak facts get app-computed hooks such as `7 × 8 = 7 × 10 − 7 × 2 = 70 − 14 = 56` (`factDecomp` in `aiLocal.js`, every hook tested as a true equation for all 2–12 facts).
- Same safeguards as before: system rules split from data, learner data treated as data, arithmetic check, no invented causes, bounded context, per-action token and word targets, 4 h on-device cache.
- Version 14.18 and service-worker cache `mm-v14-18`. Tests: `test/v1418-ai-spots.test.mjs` (311 pass). `npm run ai:selftest` now also covers the four new actions; I could not run it against the live API here (no key), so read those four replies on your key before relying on them.

## v14.17
- **Per-device learning counters (sync fix).** Pattern, fact and error counters are now stored as one contribution per device plus a frozen shared base, and merged by adding the devices' contributions (laptop +3 and phone +2 on a shared 5 is now 10, not 8). `S.pat / S.facts / S.errs` stay as derived totals, so no screen changed. See `bump()`, `rollup()` and `mergeCtr()` in `state.js`.
- **Arithmetic check now reads whole chains.** `47 × 6 = 40 × 6 + 7 × 6 = 250 + 42 = 292` used to pass (only the last step was ever checked); every neighbouring pair is now evaluated with real precedence and parentheses. Thousands separators, decimals, remainders, powers and `mod` are left alone, and each line is checked on its own.
- **Rules and data are separate.** The standing rules go to Gemini as `systemInstruction`; the task and learner data are the user turn. The rules now say that anything inside the learner data (typed answers, chat text) is data and must never be obeyed as an instruction.
- **The model reuses verified arithmetic.** The newest misses carry the app's own worked method (`how()`), and the model is told to reuse it instead of re-deriving it. The app also computes the top priority (lowest-accuracy pattern with enough tries) and passes it with its skill id.
- **Sturdier recommendations.** A skill given by name ("Multiplication") or a loose duration ("2 min") is understood. A reply that is not usable JSON used to be shown to the learner as a raw JSON blob; it now becomes the app's own suggestion, labelled as local. A cut-off JSON reply no longer gets a "cut off" sentence glued into it.
- **Reply tidying.** Code-fenced replies are unwrapped, chatty openers removed, stray LaTeX turned into plain symbols (numbers are never touched).
- **Useful offline fallbacks.** Debrief, mistakes and progress sheets used to say "no analysis". They now show the learner's own numbers: score, missed questions with the app-computed gap and method, and a shared size of error. The logic lives in `public/js/aiLocal.js`, shared by the browser and the function.
- **Bug fixed: Coach repainting over other screens.** A slow AI reply (up to 35 s) re-rendered the Coach page even after the learner had left it, including during a practice session. It now repaints only if the Coach is still on screen.
- **Bug fixed:** a local-fallback text was passed to Gemini as the "previous answer to avoid repeating".
- **Label fix:** the prompt called the highest single skill rating "peak"; it now says so.
- Version 14.17, service-worker cache `mm-v14-17` (also precaches `js/aiLocal.js`); explanation caches bumped (client v6, server v5).
- Tests: `test/v1417-ai.test.mjs`, `test/v1417-counters.test.mjs`. Not verified against the live API (no key here): run `npm run ai:selftest` and read the replies, in particular that `systemInstruction` is accepted by both models.


## v14.16 (AI personalization and full AI audit)
- **The AI now gets much more of your data.** Every action sees per-skill detail (rating, movement over the last 6 sessions, recent accuracy and speed), your last 8 sessions, best session, habit (days since last practice, active days in the last 14, today's goal progress, recent modes), up to 6 weak and 4 strong patterns, 5 weak facts, 4 error categories, and your last 8 misses with what you typed plus the app-computed gap. Previously plan, recommend and chat saw only a thin snapshot.
- **Personal, dense, complete.** A new prompt rule asks for answers built from the 2-4 facts that matter most, with real numbers and your own questions, no filler, every requested section finished. Word targets rose about 15% (coach 150, analyze 230, plan 250, debrief 200, mistakes 220, trick 230) with matching token ceilings.
- **Audit fixes.**
  - Explain questions from the browser are now cleaned and length-bounded before they reach the prompt (a 5,000-character worked method used to pass straight through).
  - Cut-off replies and replies carrying an arithmetic warning are no longer cached (server 4 h, device 4 h); before, a truncated explanation was served again for hours.
  - The server rejects unknown AI actions with HTTP 400 instead of spending free-tier quota on an unbounded generic prompt.
  - The offline fallback for "recommend" was unreachable (an earlier branch caught it); fixed, and it now lists your weakest patterns and recent misses.
  - The local plan fallback ignored your daily goal; it now lists exactly that many sessions.
  - The on-device cache key for recommend/progress/debrief now includes your current skills, patterns, misses and due count, so a cached answer is not reused after your data changed.
  - Typed answers such as "1,234" are compared correctly in the app-computed gap.
  - Version 14.16 and service-worker cache `mm-v14-16`, so installed copies fetch the new AI client.
- Limits raised: context strings 240 chars, arrays 30, prompt data 7000 chars; summary strings 900.
- Explanation caches bumped (client v5, server v4) so old answers are not reused.
- Tests: `test/v1416-personalization.test.mjs`; two old limit assertions updated. `test/sync.test.mjs` fails only here because `@netlify/blobs` is not installed (run `npm install`).
- Not verified against the live API: run `npm run ai:selftest` with your key to read real replies and check latency with the longer prompts.

## v14.15 (historical)
Driven by the 14.14 live self-test report. Every reply was read, not just checked for errors.
- **Faster primary model.** In the report, all 11 calls on `gemini-3.5-flash-lite` took 1.2–3.5 s, while `gemini-3.1-flash-lite` had calls of 15.5 s, 15.9 s and 24.9 s, which the 9 s production timeout would abort (wasting a request, then failing over). 3.5 is now the primary and 3.1 the only backup; both are still the only allowed models. Devices that 14.14 had silently pinned to 3.1 move to 3.5 (new storage key). This rests on one run, so run `npm run ai:selftest -- --latency` to confirm on your key.
- **No more invented causes.** The report's `mistakes` and `debrief` replies said things like "you failed to add the carry-over" (which would give 242, not 272) and "you likely subtracted 20 from 80 and added 9 to 3" (which gives 72, not 64). The app now computes the gap for every wrong answer (`describeGap`: "272 is 10 below 282; only the tens digit differs") and a shared-gap pattern ("3 of 3 wrong answers are exactly 10 away"), and the prompts forbid stating how the learner reached an answer.
- **No false "your example".** The chat reply called 47 × 11 "your recent challenge" when the learner's miss was 47 × 6. Prompts now allow "your" only for questions present in the data.
- **Specific, not generic.** Every action previously recommended partial products. Prompts now carry a technique menu and recent misses: 47 × 6 and 58 × 7 are both just under a multiple of 10, so round-and-adjust (50 × 6 − 3 × 6) is suggested. Prompts also forbid claiming a method "avoids" carrying and calling speed fast/slow without a par ratio.
- **Plan** now sees skill ratings, review count and recent misses, maps the daily goal to exactly that many session bullets, and ends in a measurable Day-7 check.
- **Phone-sized.** Per-action word targets (110–210), short paragraphs, no tables or nested bullets, no headings in chat, quiz mode gives questions only.
- **Tokens and thinking.** Per-action `maxOutputTokens` (600–1000 instead of a flat 1500). `thinkingLevel: low` only for explain, mistakes, debrief, trick and recommend. The probe showed both models accept `minimal`/`low` and that 3.5 rejects `thinkingBudget: 0` with HTTP 400, so that is never sent. If a model ever rejects the thinking setting, it is skipped for it from then on and the backup answers.
- **Self-test** now sends exactly what production sends, checks content (invented causes, false ownership, headings in chat, leaked quiz answers, phone word limits, would-time-out latency), prints replies from both models, and has `--latency` (6 repeated calls per model).
- Tests: `test/v1415-ai-quality.test.mjs`, `test/v1415-client.test.mjs`; the content checks are in `tools/ai-checks.mjs` and are tested against the flawed replies from the report.

## v14.14
- `tools/ai-selftest.mjs` (`npm run ai:selftest`): runs every AI action on both models against the real API using the app's own prompts, and reports latency, token use (including thinking tokens), cut-offs, LaTeX leaks, arithmetic errors and JSON validity. `--probe` tests which thinking settings each model accepts; `--mock` is a no-network dry run. The key is never printed or saved.

## v14.13
- The AI now sees your weakest and strongest **question patterns** (accuracy, tries, speed vs par time) and your recent trend, not just totals, so analysis, plans, recommendations and tutor answers cite real evidence.
- **Actionable recommendations:** Gemini returns a validated JSON choice (skill, 1-5 min); the Coach and the Home sheet get a one-tap "Start this drill" button. Invented skills are rejected.
- Debrief, Notebook, Learn and Progress sheets end with follow-up buttons (practise missed, review, practise this trick, drill weakest).
- Math Tutor: follow-up chips after each reply (Another example / Explain simpler / Quiz me).
- Coach pill shows how many of today's shared free AI requests are left; a banner explains when the sync password is missing.
- Server: a model that just returned 429/5xx is tried last for a short while, so requests stop paying for a doomed first attempt.

## v14.12
- Timeouts: per-attempt 5 s → 9 s (total 20 s). Longer answers (lessons, plans) were being aborted, which also wasted a quota slot on the backup model.
- Output cap 900 → 1500 tokens (Gemini 3 thinking tokens count against it); a reply that still hits the cap is marked as cut off instead of silently ending mid-sentence.
- Arithmetic check: every Gemini reply is scanned for simple `a op b = c` statements; wrong ones are appended as a corrected "Arithmetic check" note.
- Robustness: request body capped, `summary`/`history`/`message` sanitised and bounded, prompt building no longer able to crash the function (malformed history gave a raw 500), safety/block reasons reported.
- Client: 35 s fetch timeout, identical in-flight requests share one call, known-exhausted daily budget and offline short-circuit without a request, local-fallback replies are no longer fed back to Gemini as chat history, IME-safe Enter.

## v14.11
- AI is now available on demand across the app, always labelled Gemini or local: **Results** (session debrief), **Notebook** (find patterns in mistakes), **Learn** (Ask AI on each trick: fresh worked examples + self-test), **Progress** (AI read of progress), **Home** (Ask AI what to practise), **Settings** (AI status: key, build, quota). The Math Tutor now also sees your recent misses.
- Server: new actions `debrief`, `trick`, `mistakes`, `progress` take a bounded `context` object (sanitised by `cleanContext`). Replies for identical data are cached on the device for 4 h so reopening a sheet costs no quota. Prompts forbid LaTeX.

## v14.10
- New `public/js/richtext.js`: one safe renderer for all Gemini text (Markdown lists, numbered lists, rules, tables, italics, and LaTeX such as `$9 \times 20$`, `\pmod`, `\frac`, `\div` converted to readable symbols). Used by the Coach and the "AI Method" sheet.
- Math Tutor / Coach mobile layout rebuilt: no overlapping chips, swipeable suggestions, no nested scroll box, sticky composer above the tab bar, typing indicator, AI Method sheet scrolls as one piece.

## v14.9
- Fixed quota counter inflation: Blobs 8.x ignored conditional writes and returned void, so one request wrote 12+ usage entries. Upgraded to @netlify/blobs 11 and treat a non-`modified:false` result as success.
- Pinned Netlify build/functions to Node 22.12.0 (Blobs 11 requires >=22.12).

## Current backend contract
This section describes the deployed backend as it is today; the release notes below are historical.
- Fixed Netlify Blobs initialization: the documented API is `getStore(storeName)`. Strong consistency remains requested on `getWithMetadata` reads.
- Added a deployment fingerprint to `GET /api/ai`: `buildVersion: "14.50"` and response header `x-mental-math-ai-version: 14.50`.
- Exposes the active model allow-list and exact application safety policy in the diagnostic response.
- Keeps Gemini 3.5 Flash-Lite primary and Gemini 3.1 Flash-Lite as the only backup.
- Keeps the shared 300-upstream-attempt Pacific-day budget and independent 12 RPM rolling windows per model.
- Keeps the single-device learner architecture, existing progress/sync behavior, AI Coach, mobile navigation and mobile Coach layout.

## Required Netlify environment variables
- `GEMINI_API_KEY`
- `SYNC_KEY` (and any existing `SYNC_KEY_<NAME>` variables used by the second device)

Keep the Google AI Studio project unlinked from billing to maintain the intended $0 spend. The app cannot verify the billing state of the Google project.

## Deploy the complete project
Deploy from the project root, not from `public` alone, because the Gemini endpoint and quota adapter live under `netlify/`:

```powershell
npm ci
npm run check
npm test
netlify link
netlify deploy --prod
```

Select the existing Netlify site when linking. Preserve all existing environment variables.

## Verify the deployed backend before testing AI
Open:

`https://YOUR-SITE.netlify.app/api/ai`

The JSON must include:

```json
{
  "buildVersion": "14.50",
  "defaultModel": "gemini-3.5-flash-lite",
  "models": ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
  "budgetPolicy": {
    "dailyShared": 300,
    "perModelRollingMinute": 12
  }
}
```

The `budgetPolicy` object also includes the model list. If `buildVersion` is absent or not `14.50`, the new function bundle is not the one currently serving the site; redeploy the full project root to the correct linked Netlify site.

## Honest limitations
- Automated tests use a mocked Blobs store and mocked Gemini responses; they cannot prove the user's live Netlify project, API key, Google model availability, or current provider capacity.
- Google applies its own per-project model RPM/TPM/RPD quotas and may return 429 or temporary 503 responses. The app's limits are conservative safeguards, not a guarantee that Google will never throttle or overload.
- The app never falls back to paid model tiers. If both allowed models fail, it displays an explicitly labelled local response.

# Mental Math Trainer

A mental-arithmetic trainer: adaptive skills, guided Learn paths, an AI Coach, reminders, and optional cloud sync. A static app in `public/` plus Netlify Functions in `netlify/` for sync, AI and push. Release history is in [CHANGELOG.md](CHANGELOG.md).

## Releasing
The release number lives in one file, `VERSION`. Do not edit it by hand in other files.

```
npm run release -- 14.53     # sets VERSION and stamps it everywhere it is repeated
npm run version:check        # changes nothing; fails and names any file that disagrees
npm test                     # includes the same check
```

`tools/version.mjs` lists what it stamps (`util.js`, the service-worker cache name, the `?v=` links in `index.html`, `ai.mjs`, and the backend-contract examples below). If one of those files changes shape, the tool stops with a message rather than guessing. Then add an entry to `CHANGELOG.md`.

## Current backend contract
This section describes the deployed backend as it is today; the release history is in [CHANGELOG.md](CHANGELOG.md).
- Fixed Netlify Blobs initialization: the documented API is `getStore(storeName)`. Strong consistency remains requested on `getWithMetadata` reads.
- Added a deployment fingerprint to `GET /api/ai`: `buildVersion: "14.56"` and response header `x-mental-math-ai-version: 14.56`.
- Exposes the active model allow-list and exact application safety policy in the diagnostic response.
- Keeps Gemini 3.5 Flash-Lite primary and Gemini 3.1 Flash-Lite as the only backup.
- Keeps the shared 300-upstream-attempt Pacific-day budget and independent 12 RPM rolling windows per model.
- Keeps the single-device learner architecture, existing progress/sync behavior, AI Coach, mobile navigation and mobile Coach layout.

## Required Netlify environment variables
- `GEMINI_API_KEY`
- `SYNC_KEY`, at least 12 characters (it is also the administrator that can add learners from Settings), and any existing `SYNC_KEY_<NAME>` variables used by the second device. Further learners no longer need a variable or a redeploy: add them in Settings, Learners and keys.

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
  "buildVersion": "14.56",
  "defaultModel": "gemini-3.5-flash-lite",
  "models": ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
  "budgetPolicy": {
    "dailyShared": 300,
    "perModelRollingMinute": 12
  }
}
```

The `budgetPolicy` object also includes the model list. If `buildVersion` is absent or not `14.56`, the new function bundle is not the one currently serving the site; redeploy the full project root to the correct linked Netlify site.

## Modes worth knowing about
- **Flash** (Home): a chain of flashing numbers with a running total. Visual only, so screen readers are not told the numbers. The answer uses the number pad; Pause and Esc stop a run; each setting keeps its own best (on this device). A run is saved as a session of kind `flash`: it keeps the streak going, counts toward the daily goal at 3 or more rounds right, has no skill ratings and stays out of the pace charts.
- **Your week** (Progress, Overview): the last seven days against the seven before, with copy and image sharing. Computed on the device.

## Daily leaderboard (opt-in)
Settings, Cloud sync, *Daily leaderboard*. A learner who joins picks a display name; from then on each finished Daily reports its points and answers to `/api/board`, and the Daily results screen and Settings show the day's board for everyone who joined. Learners who have not joined are never listed and never see the board. Only the display name, the day's best points and answers (right / asked) are stored, in the `mental-math-board` blob store, apart from anyone's progress. *Leave* deletes the name and every stored score; a learner whose key is turned off disappears from the board at once. Up to 25 names, two weeks of days kept. Joining needs a sync key; the board is shared by every learner of this deployment (Netlify variables and keys made in the app alike).

## Honest limitations
- The leaderboard trusts the browser: scores are range-checked (day within a day of the server's date, points and counts plausible) but not verified, so it suits a family or class, not a contest. A Daily finished while offline is not sent later.
- Automated tests use a mocked Blobs store and mocked Gemini responses; they cannot prove the user's live Netlify project, API key, Google model availability, or current provider capacity.
- Google applies its own per-project model RPM/TPM/RPD quotas and may return 429 or temporary 503 responses. The app's limits are conservative safeguards, not a guarantee that Google will never throttle or overload.
- The app never falls back to paid model tiers. If both allowed models fail, it displays an explicitly labelled local response.

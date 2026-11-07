import { createHash, timingSafeEqual } from 'node:crypto';

/** Shortest key the app will accept when one is chosen or changed. Keys made by the app itself are far longer. */
export const MIN_KEY_LENGTH = 12;
/** Returns '' when the key is acceptable, otherwise a sentence the user can act on. Keep in step with `keyProblem` in public/js/sync.js. */
export const keyProblem = (key) => {
  const k = String(key || '').trim();
  if (k.length < MIN_KEY_LENGTH) return `Use at least ${MIN_KEY_LENGTH} characters.`;
  if (new Set(k.toLowerCase()).size < 5) return 'Use a key with more variety than that.';
  return '';
};

// Every non-empty SYNC_KEY or SYNC_KEY_<NAME> environment variable is one learner.
// SYNC_KEY is also the administrator: it is the only key allowed to create or remove learners from inside the app.
export const users = () =>
  Object.entries(process.env)
    .filter(([name, value]) => value && (name === 'SYNC_KEY' || /^SYNC_KEY_[A-Z0-9_]+$/.test(name)))
    .map(([name, key]) => ({
      id: name === 'SYNC_KEY' ? 'primary' : name.slice(9).toLowerCase(),
      key,
      store: name === 'SYNC_KEY' ? 'mental-math' : 'mental-math-' + name.slice(9).toLowerCase().replace(/_/g, '-'),
      admin: name === 'SYNC_KEY',
      // Short keys configured before the length rule keep working (nobody gets locked out by an upgrade); the app tells the owner to replace them.
      weak: !!keyProblem(key),
    }));

export const digest = (value) => createHash('sha256').update(String(value || '')).digest();

/**
 * Match a key against the learners configured as environment variables only. Most callers want `authenticate` in gate.mjs,
 * which also knows the learners created inside the app and applies the failed-attempt limit.
 */
export const resolveEnvUser = (sent) => {
  const candidate = digest(sent);
  let match = null;
  for (const user of users()) {
    if (timingSafeEqual(candidate, digest(user.key)) && !match) match = user;
  }
  return match;
};

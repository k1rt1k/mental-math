import { createHash, timingSafeEqual } from 'node:crypto';

// Every non-empty SYNC_KEY or SYNC_KEY_<NAME> environment variable is one learner.
export const users = () =>
  Object.entries(process.env)
    .filter(([name, value]) => value && (name === 'SYNC_KEY' || /^SYNC_KEY_[A-Z0-9_]+$/.test(name)))
    .map(([name, key]) => ({
      id: name === 'SYNC_KEY' ? 'primary' : name.slice(9).toLowerCase(),
      key,
      store: name === 'SYNC_KEY' ? 'mental-math' : 'mental-math-' + name.slice(9).toLowerCase().replace(/_/g, '-'),
    }));

const digest = (value) => createHash('sha256').update(String(value || '')).digest();

/** Resolve a personal sync password without trusting any browser-supplied owner ID. */
export const resolveSyncUser = (sent) => {
  const candidate = digest(sent);
  let match = null;
  for (const user of users()) {
    if (timingSafeEqual(candidate, digest(user.key)) && !match) match = user;
  }
  return match;
};

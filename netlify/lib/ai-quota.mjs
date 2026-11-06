// Persistent project-wide safety budget for Gemini Standard Free-tier calls.
// Daily usage is shared across both models and devices. Rolling-minute limits
// are tracked separately per model so one model's RPM allowance does not consume
// the other model's independent Google RPM allowance.

const STORE_NAME = 'mental-math-ai-budget';
const DAILY_LIMIT = 300; // Shared across both devices and both allowed models.
const RPM_LIMIT_PER_MODEL = 12; // 20% headroom below Google's 15 RPM per model.
const WINDOW_MS = 60_000;
const MAX_CAS_ATTEMPTS = 16;
const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const DEFAULT_MODEL = MODELS[0];

let testStore = null;
let testStoreFactory = null;
export function setAiQuotaStoreForTests(store) { testStore = store; }
export function setAiQuotaStoreFactoryForTests(factory) { testStoreFactory = factory; }

async function openStore() {
  if (testStore) return testStore;
  if (testStoreFactory) return testStoreFactory(STORE_NAME);
  const { getStore } = await import('@netlify/blobs');
  // Netlify Blobs API signature is getStore(name, options), not getStore({name}).
  // Strong consistency is requested on each read in readState().
  return getStore(STORE_NAME);
}

function pacificDateKey(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function nextPacificMidnight(timestamp) {
  const current = pacificDateKey(timestamp);
  let low = timestamp;
  let high = timestamp + 36 * 60 * 60 * 1000;
  while (pacificDateKey(high) === current) high += 12 * 60 * 60 * 1000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (pacificDateKey(mid) === current) low = mid;
    else high = mid;
  }
  return high;
}

function quotaError(message, { status = 429, daily = false, rate = false, retryAt = 0, model = '' } = {}) {
  const err = new Error(message);
  err.status = status;
  err.dailyBudgetExhausted = daily;
  err.rateLimited = rate;
  err.modelRateLimited = rate && Boolean(model);
  err.retryAt = retryAt;
  err.model = model;
  return err;
}

async function readState(store, key) {
  const result = await store.getWithMetadata(key, { consistency: 'strong', type: 'json' });
  if (!result) return { state: { count: 0, modelTimestamps: {} }, etag: null };
  return { state: result.data || { count: 0, modelTimestamps: {} }, etag: result.etag || null };
}

async function saveCAS(store, key, state, etag) {
  if (etag) return store.setJSON(key, state, { onlyIfMatch: etag });
  return store.setJSON(key, state, { onlyIfNew: true });
}

function cleanTimes(values, now) {
  return Array.isArray(values)
    ? values.map(Number).filter((t) => Number.isFinite(t) && now - t >= 0 && now - t < WINDOW_MS)
    : [];
}

function sanitizeState(state, now) {
  const count = Number.isFinite(Number(state?.count)) ? Math.max(0, Number(state.count)) : 0;
  const stored = state?.modelTimestamps && typeof state.modelTimestamps === 'object' ? state.modelTimestamps : {};
  const modelTimestamps = Object.fromEntries(MODELS.map((model) => [model, cleanTimes(stored[model], now)]));
  // Older v14.6 records stored one aggregate `timestamps` array. It cannot be
  // attributed to a specific model, so it is intentionally not applied to the
  // new independent RPM buckets. The shared daily count is retained.
  return { count, modelTimestamps };
}

function aggregateTimes(modelTimestamps) {
  return MODELS.flatMap((model) => modelTimestamps[model] || []).sort((a, b) => a - b);
}

function statusFromState(state, now) {
  const perModel = Object.fromEntries(MODELS.map((model) => [model, {
    requestsLastMinute: state.modelTimestamps[model].length,
    perMinuteLimit: RPM_LIMIT_PER_MODEL,
    remainingThisMinute: Math.max(0, RPM_LIMIT_PER_MODEL - state.modelTimestamps[model].length),
  }]));
  const allTimes = aggregateTimes(state.modelTimestamps);
  return {
    available: true,
    usedToday: state.count,
    dailyLimit: DAILY_LIMIT,
    remainingToday: Math.max(0, DAILY_LIMIT - state.count),
    requestsLastMinute: allTimes.length,
    perMinuteLimit: RPM_LIMIT_PER_MODEL * MODELS.length,
    perModelRpmLimit: RPM_LIMIT_PER_MODEL,
    perModel,
    dailyResetAt: nextPacificMidnight(now),
    timezone: 'America/Los_Angeles',
  };
}

export async function reserveAiRequest({ model = DEFAULT_MODEL, now = Date.now() } = {}) {
  const selectedModel = MODELS.includes(model) ? model : DEFAULT_MODEL;
  let store;
  try { store = await openStore(); }
  catch (cause) {
    const err = new Error(`AI safety budget storage is unavailable; request blocked to protect the free-tier cap. ${cause?.message || ''}`.trim());
    err.status = 503; err.budgetStoreUnavailable = true; throw err;
  }

  const dayKey = `usage-${pacificDateKey(now)}`;
  try {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
      const { state: raw, etag } = await readState(store, dayKey);
      const state = sanitizeState(raw, now);
      if (state.count >= DAILY_LIMIT) {
        throw quotaError('Mental Math shared AI safety budget reached (300 upstream requests for the Pacific calendar day). It resets at the next Pacific midnight.', {
          daily: true, retryAt: nextPacificMidnight(now),
        });
      }

      const modelTimes = state.modelTimestamps[selectedModel];
      if (modelTimes.length >= RPM_LIMIT_PER_MODEL) {
        const oldest = Math.min(...modelTimes);
        throw quotaError(`Mental Math safety cap reached for ${selectedModel}: ${RPM_LIMIT_PER_MODEL} upstream attempts per rolling minute. The other Flash-Lite model has a separate limit and may still be available.`, {
          rate: true, model: selectedModel, retryAt: oldest + WINDOW_MS,
        });
      }

      const updated = {
        count: state.count + 1,
        modelTimestamps: {
          ...state.modelTimestamps,
          [selectedModel]: [...modelTimes, now],
        },
        updatedAt: now,
      };
      const written = await saveCAS(store, dayKey, updated, etag);
      // Blobs >=10 returns {modified:boolean}. Older clients (8.x) ignore the
      // conditional options and return void after a successful write; treating that
      // as a lost race made one request write 12+ times and trip the RPM cap.
      if (written === undefined || written === null || written.modified !== false) {
        const allTimes = aggregateTimes(updated.modelTimestamps);
        return {
          usedToday: updated.count,
          dailyLimit: DAILY_LIMIT,
          remainingToday: Math.max(0, DAILY_LIMIT - updated.count),
          model: selectedModel,
          requestsLastMinute: allTimes.length,
          perMinuteLimit: RPM_LIMIT_PER_MODEL * MODELS.length,
          perModelRpmLimit: RPM_LIMIT_PER_MODEL,
          modelRequestsLastMinute: updated.modelTimestamps[selectedModel].length,
          modelRemainingThisMinute: Math.max(0, RPM_LIMIT_PER_MODEL - updated.modelTimestamps[selectedModel].length),
          resetAt: nextPacificMidnight(now),
        };
      }
      // Another function instance changed the record after the read. Retry CAS.
    }
    throw new Error('Could not reserve a quota slot after concurrent updates.');
  } catch (cause) {
    if (cause?.dailyBudgetExhausted || cause?.rateLimited) throw cause;
    const err = new Error(`AI safety budget could not be updated; request blocked to avoid exceeding the free-tier limit. ${cause?.message || ''}`.trim());
    err.status = 503; err.budgetStoreUnavailable = true; throw err;
  }
}

export async function getAiBudgetStatus({ now = Date.now() } = {}) {
  try {
    const store = await openStore();
    const key = `usage-${pacificDateKey(now)}`;
    const { state: raw } = await readState(store, key);
    return statusFromState(sanitizeState(raw, now), now);
  } catch {
    return {
      available: false,
      error: 'Persistent AI budget status is unavailable; new AI requests fail closed.',
      dailyLimit: DAILY_LIMIT,
      perMinuteLimit: RPM_LIMIT_PER_MODEL * MODELS.length,
      perModelRpmLimit: RPM_LIMIT_PER_MODEL,
    };
  }
}

export const AI_BUDGET_LIMITS = Object.freeze({
  daily: DAILY_LIMIT,
  rpmPerModel: RPM_LIMIT_PER_MODEL,
  models: Object.freeze([...MODELS]),
  timezone: 'America/Los_Angeles',
});

import {
  validateModel,
  buildPromptParts,
  cleanReply,
  cleanContext,
  cleanQuestion,
  cleanSummary,
  ACTIONS,
  cleanHistory,
  parseSkillMap,
  parseRecommendation,
  checkArithmetic,
  quotedLearnerAnswers,
  callGeminiFreeApiWithMeta,
  generateLocalFallback,
  getCache,
  setCache,
  explanationCacheKey,
  DEFAULT_MODEL,
  FREE_MODELS,
} from '../lib/ailogic.mjs';
import { authenticate, lockedText } from '../lib/gate.mjs';

const AI_BUILD_VERSION = '14.89';

const J = (o, status = 200) =>
  Response.json(o, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-ai-inference-mode': 'allowlisted-standard-free-tier-models',
      'x-mental-math-ai-version': AI_BUILD_VERSION,
    },
  });

const T = (msg, status = 400) =>
  new Response(msg, {
    status,
    headers: { 'cache-control': 'no-store' },
  });

export default async (req) => {
  // Allow GET to check AI configuration & free-tier quota status
  if (req.method === 'GET') {
    const hasEnvKey = Boolean(process.env.GEMINI_API_KEY);
    let quota;
    try { quota = await (await import('../lib/ai-quota.mjs')).getAiBudgetStatus(); }
    catch { quota = { available: false, dailyLimit: 300, perMinuteLimit: 24, perModelRpmLimit: 12 }; }
    return J({
      configured: hasEnvKey,
      buildVersion: AI_BUILD_VERSION,
      quota,
      models: FREE_MODELS,
      defaultModel: DEFAULT_MODEL,
      freeTierEligibleModelsOnly: true,
      billingStatusVerifiableByApp: false,
      billingMustRemainDisabledInGoogleCloud: true,
      budgetPolicy: { dailyShared: 300, perModelRollingMinute: 12, models: FREE_MODELS },
    });
  }

  if (req.method !== 'POST') {
    return T('Method not allowed', 405);
  }

  // Gemini access is for the two intended learners, authenticated by the same
  // personal sync password that selects their isolated cloud progress store.
  // The browser never chooses or submits a trusted user/profile identifier.
  const gate = await authenticate(req);
  if (gate.denied === 'locked') {
    return Response.json({ error: lockedText(gate.retryAfter), locked: true }, { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(gate.retryAfter) } });
  }
  if (gate.denied) {
    return J({ error: 'A valid personal sync password is required. Set it in this device’s Settings.', authRequired: true }, 401);
  }
  const owner = gate.who;

  let body;
  try {
    const raw = await req.text();
    if (raw.length > 60_000) return T('Request too large', 413);
    body = JSON.parse(raw);
  } catch {
    return T('Invalid JSON body', 400);
  }

  const requestBody = body && typeof body === 'object' ? body : {};
  const {
    action = 'coach',
    summary = {},
    question = {},
    message = '',
    history = [],
    previousResponse = '',
    context = null,
    model = DEFAULT_MODEL,
  } = requestBody;

  // Only the app's own actions are served; anything else would spend free-tier quota on an unbounded generic prompt.
  if (!ACTIONS.includes(action)) return J({ error: 'Unknown AI action.' }, 400);
  const safeQuestion = cleanQuestion(question);

  // Hard safeguard against paid models
  let verifiedModel;
  try {
    verifiedModel = validateModel(model);
  } catch (err) {
    return J({ error: err.message, freeTierViolation: true }, 400);
  }

  // Gemini credentials are server-side only. Client-provided API keys are ignored.
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  // Only cache an exact, question-specific Gemini explanation. Analysis and plans
  // are intentionally fresh on every request so updated stats never show stale text.
  const cacheKey = action === 'explain' && safeQuestion.q && !requestBody.forceRefresh
    ? explanationCacheKey({ ownerId: owner.id, model: verifiedModel, question: safeQuestion })
    : null;

  if (cacheKey) {
    const cached = getCache(cacheKey, 4 * 60 * 60 * 1000);
    if (cached) {
      return J({
        ok: true,
        source: 'gemini',
        text: cached,
        cached: true,
        model: verifiedModel,
        user: owner.id,
        freeTier: true,
      });
    }
  }

  // If no Gemini API key is configured anywhere, return intelligent local fallback
  if (!apiKey) {
    const fallbackText = generateLocalFallback({ action, summary: cleanSummary(summary), question: safeQuestion, message, context: cleanContext(context) });
    return J({
      ok: true,
      source: 'local',
      fallback: true,
      unconfigured: true,
      text: fallbackText,
      model: verifiedModel,
      user: owner.id,
      message: 'Running in offline / local fallback mode. Add GEMINI_API_KEY in Netlify to connect live Gemini AI.',
    });
  }

  let prompt, system;
  try {
    ({ system, user: prompt } = buildPromptParts({
      action: String(action).slice(0, 20),
      summary: cleanSummary(summary),
      question: safeQuestion,
      message: String(message ?? '').slice(0, 1200),
      history: cleanHistory(history),
      previousResponse: String(previousResponse ?? '').slice(0, 1800),
      context: cleanContext(context),
    }));
  } catch (err) {
    return J({ error: 'The AI request was malformed and could not be read.', detail: String(err.message || err).slice(0, 120) }, 400);
  }

  try {
    const result = await callGeminiFreeApiWithMeta({
      apiKey,
      model: verifiedModel,
      prompt,
      system,
      jsonMode: action === 'recommend',
      action: String(action).slice(0, 20),
      quoted: quotedLearnerAnswers(cleanSummary(summary)),
      trackHealth: true,
      reserveQuota: async (attemptModel) => (await import('../lib/ai-quota.mjs')).reserveAiRequest({ model: attemptModel }),
    });

    // The recommendation comes back as JSON; validate it and give the app something it can act on.
    let finalText = result.text, structured = null;
    if (action === 'recommend') {
      const parsed = parseRecommendation(result.text, parseSkillMap(cleanSummary(summary).skillIds));
      if (parsed) {
        const checked = checkArithmetic(parsed.text, { quoted: quotedLearnerAnswers(cleanSummary(summary)) });
        finalText = checked.text; structured = parsed.structured;
      } else {
        // The model did not return usable JSON. Never show the raw JSON blob: say so and give the app's own suggestion.
        return J({
          ok: true, source: 'local', fallback: true, attempts: result.attempts, modelsTried: result.modelsTried, user: owner.id, budget: result.budget || null,
          text: generateLocalFallback({ action, summary: cleanSummary(summary), question: safeQuestion, message, context: cleanContext(context) }),
          message: 'Gemini returned a recommendation the app could not read. Showing the app’s own suggestion; tap Regenerate to try again.',
        });
      }
    }

    // Cache only when the requested model served the response. If failover was
    // needed, keep the real model identity visible and don't mislabel that cache.
    // Never cache a cut-off reply or one that carries an arithmetic warning: it would be served again for 4 hours.
    if (cacheKey && result.model === verifiedModel && !result.truncated && !(result.arithmeticFlags || []).length) {
      setCache(cacheKey, result.text);
    }

    return J({
      ok: true,
      source: 'gemini',
      text: finalText,
      structured,
      model: result.model,
      requestedModel: verifiedModel,
      modelFailover: result.failover,
      attempts: result.attempts,
      modelsTried: result.modelsTried,
      user: owner.id,
      freeTierEligible: true,
      budget: result.budget || null,
      cached: false,
      truncated: Boolean(result.truncated),
      arithmeticFlags: result.arithmeticFlags || [],
      message: result.failover ? `Gemini ${verifiedModel} was temporarily unavailable; this response was generated by free-tier ${result.model}.` : '',
    });
  } catch (err) {
    if (err.dailyBudgetExhausted || err.rateLimited || err.budgetStoreUnavailable || err.status === 429) {
      const fallbackText = generateLocalFallback({ action, summary: cleanSummary(summary), question: safeQuestion, message, context: cleanContext(context) });
      const daily = Boolean(err.dailyBudgetExhausted);
      const messageText = err.budgetStoreUnavailable
        ? 'The shared safety-budget store is unavailable. Gemini was not called; the request was blocked to protect the free-tier limit.'
        : daily
          ? 'Mental Math reached its shared 300-upstream-request daily safety budget. It resets at Pacific midnight.'
          : err.modelRateLimited
            ? `${err.message} The other model was also unavailable or rate-limited. Retry when a per-model slot opens; the rolling window clears automatically.`
            : err.rateLimited
              ? 'The local AI safety rate limit was reached. Please wait briefly and retry.'
              : `The eligible Flash-Lite models could not accept this request (HTTP 429). Check the per-model RPM/TPM/RPD details in AI Studio. ${err.message}`;
      return J({
        ok: true,
        source: 'local',
        fallback: true,
        quotaExhausted: daily,
        dailyBudgetExhausted: daily,
        rateLimited: Boolean(err.rateLimited || err.providerRateLimited),
        providerRateLimited: Boolean(err.providerRateLimited),
        budgetStoreUnavailable: Boolean(err.budgetStoreUnavailable),
        providerStatus: err.status || null,
        attempts: err.attempts || 0,
        modelsTried: err.modelsTried || [],
        text: fallbackText,
        resetAt: err.retryAt || 0,
        message: messageText,
        user: owner.id,
      });
    }

    // Preserve the actual provider failure so the UI never implies Gemini replied.
    const fallbackText = generateLocalFallback({ action, summary: cleanSummary(summary), question: safeQuestion, message, context: cleanContext(context) });
    const providerUnavailable = [500, 502, 503, 504].includes(err.status);
    return J({
      ok: true,
      source: 'local',
      fallback: true,
      error: err.message,
      providerStatus: err.status || null,
      retryable: Boolean(err.retryable || providerUnavailable),
      attempts: err.attempts || 1,
      modelsTried: err.modelsTried || [],
      text: fallbackText,
      message: providerUnavailable
        ? `Google Gemini is temporarily unavailable (HTTP ${err.status}) after ${err.attempts || 1} attempt(s). A local guide is shown; retry in a little while.`
        : err.code === 'SAFETY_BLOCK'
          ? 'Gemini blocked this response for safety; no AI answer was generated.'
          : err.message,
      user: owner.id,
    });
  }
};

export const config = { path: '/api/ai' };


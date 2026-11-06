// Content checks shared by tools/ai-selftest.mjs and the test-suite. They look for the kinds of problems
// that "it ran without error" misses: invented causes, false "your example" claims, headings in chat,
// answers leaked in quiz mode.

/** Phrases that state WHY the learner got something wrong, which the app cannot know. */
export const CAUSE_RE = /\byou (?:forgot|failed to|didn'?t|did not|likely|probably|lost|lose|mis(?:read|counted))\b|\b(?:focus|attention|concentration) (?:error|lapse|slip)\b|\black of focus\b|\b(?:lose|lost) focus\b|\bfailed to add the carry\b/i;

const norm = (x) => String(x).replace(/\s+/g, '').replace(/[x*]/g, '×').replace(/-/g, '−');

/** Expressions the reply calls the learner's own ("(your recent challenge)") although they are not in the supplied data. */
export function ownershipClaims(text, dataText) {
  const hay = norm(dataText);
  const bad = [];
  const re = /(\d+\s*[×÷+−x*-]\s*\d+)[^\n.]{0,50}?\(\s*your[^)]*\)|your (?:recent |own )?(?:challenge|miss(?:es)?|mistake)[^\n.]{0,40}?(\d+\s*[×÷+−x*-]\s*\d+)/gi;
  for (const m of String(text).matchAll(re)) {
    const expr = m[1] || m[2];
    if (expr && !hay.includes(norm(expr))) bad.push(expr);
  }
  return bad;
}

export const usesHeadings = (text) => /^#{1,6}\s/m.test(String(text));
export const leaksQuizAnswers = (text) => /answers?\s*[:=]|=\s*\d{3,}/i.test(String(text));

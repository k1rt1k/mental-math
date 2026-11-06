// Rolling per-model request scheduler used by tools/ai-selftest.mjs.
// The app allows 12 generation requests per model in any rolling 60 seconds. This records each
// request start and blocks the next one until the oldest leaves the window, so the self-test
// exercises the same pacing rule as production instead of relying on a fixed delay.
export class ModelPacer {
  constructor({
    limit = 12,
    windowMs = 60_000,
    now = Date.now,
    sleep = (ms) => new Promise((res) => setTimeout(res, ms)),
    onWait = null,
    enabled = true,
  } = {}) {
    this.limit = Math.max(1, Math.floor(limit));
    this.windowMs = windowMs;
    this.now = now;
    this.sleep = sleep;
    this.onWait = onWait;
    this.enabled = enabled;
    this.marks = new Map();
    this.counts = new Map();
  }

  count(model) { return this.counts.get(model) || 0; }
  get total() { return [...this.counts.values()].reduce((a, b) => a + b, 0); }

  /** Reserve one request slot for `model`, waiting only when the rolling window is full. */
  async acquire(model) {
    this.counts.set(model, this.count(model) + 1);
    if (!this.enabled) return;
    for (;;) {
      const now = this.now();
      const recent = (this.marks.get(model) || []).filter((t) => now - t < this.windowMs);
      this.marks.set(model, recent);
      if (recent.length < this.limit) { recent.push(now); return; }
      const waitMs = this.windowMs - (now - recent[0]) + 100;   // +100 ms guards the boundary
      if (this.onWait) this.onWait(model, recent.length, this.limit, waitMs);
      await this.sleep(waitMs);
    }
  }
}

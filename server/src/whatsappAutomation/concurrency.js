/**
 * Small in-process concurrency primitives used by the WhatsApp automation runtime.
 * They are intentionally dependency-free. State is per Node process: horizontally
 * scaled deployments need a shared store (e.g. Redis) for dedup and rate limits.
 */

/** Serialises async work per key while allowing different keys to run in parallel. */
class KeyedMutex {
  constructor() {
    this.tails = new Map();
  }

  async run(key, fn) {
    const previous = this.tails.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  get size() { return this.tails.size; }
}

/** Runs `fn` over `items` with at most `limit` in flight. Never rejects early; returns settled results. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** Remembers keys for `ttlMs`; `seen()` returns true when the key was already recorded. */
class TtlDedup {
  constructor({ ttlMs = 10 * 60 * 1000, maxEntries = 50000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  seen(key, now = Date.now()) {
    if (!key) return false;
    const expiresAt = this.entries.get(key);
    if (expiresAt && expiresAt > now) return true;
    this.entries.delete(key);
    this.entries.set(key, now + this.ttlMs);
    if (this.entries.size > this.maxEntries) this.sweep(now);
    return false;
  }

  sweep(now = Date.now()) {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }
}

/** Fixed-window counter keyed by an arbitrary string. */
class RateLimiter {
  constructor({ limit, windowMs, maxKeys = 50000 }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.windows = new Map();
  }

  /** @returns {boolean} true when the call is allowed. */
  allow(key, now = Date.now()) {
    let bucket = this.windows.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, bucket);
      if (this.windows.size > this.maxKeys) this.sweep(now);
    }
    bucket.count += 1;
    return bucket.count <= this.limit;
  }

  sweep(now = Date.now()) {
    for (const [key, bucket] of this.windows) {
      if (bucket.resetAt <= now) this.windows.delete(key);
    }
    while (this.windows.size > this.maxKeys) {
      this.windows.delete(this.windows.keys().next().value);
    }
  }
}

module.exports = { KeyedMutex, mapLimit, TtlDedup, RateLimiter };

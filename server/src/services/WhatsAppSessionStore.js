/**
 * WhatsAppSessionStore
 *
 * In-process store mapping `${instanceId}:${contactWaId}` -> active
 * ConversationManager + ChannelAdapter. Reuses the 24h rolling window
 * semantics from Meta's WhatsApp Cloud API. Sessions are evicted after
 * 24h of inactivity by a periodic interval.
 *
 * Trade-off: state lives only in memory. Server restarts lose in-flight
 * conversations. Acceptable for v1; swap for Redis if needed.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_EVICT_INTERVAL_MS = 5 * 60 * 1000; // every 5 min

class WhatsAppSessionStore {
  constructor({ ttlMs = DEFAULT_TTL_MS, evictIntervalMs = DEFAULT_EVICT_INTERVAL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();
    this._interval = setInterval(() => this.evictExpired(), evictIntervalMs);
    if (this._interval.unref) this._interval.unref();
  }

  _key(instanceId, contactWaId) {
    return `${instanceId}:${contactWaId}`;
  }

  get(instanceId, contactWaId) {
    const entry = this.sessions.get(this._key(instanceId, contactWaId));
    if (!entry) return null;
    if (Date.now() - entry.lastActivityAt > this.ttlMs) {
      this.sessions.delete(this._key(instanceId, contactWaId));
      return null;
    }
    return entry;
  }

  set(instanceId, contactWaId, payload) {
    const key = this._key(instanceId, contactWaId);
    this.sessions.set(key, {
      ...payload,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });
  }

  touch(instanceId, contactWaId) {
    const entry = this.sessions.get(this._key(instanceId, contactWaId));
    if (entry) entry.lastActivityAt = Date.now();
  }

  delete(instanceId, contactWaId) {
    return this.sessions.delete(this._key(instanceId, contactWaId));
  }

  list() {
    return Array.from(this.sessions.entries()).map(([key, value]) => ({
      key,
      ...value,
    }));
  }

  evictExpired() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.sessions.entries()) {
      if (now - entry.lastActivityAt > this.ttlMs) {
        try {
          if (entry.conversationManager && entry.conversationManager.endConversation) {
            entry.conversationManager.endConversation();
          }
        } catch (e) { /* ignore */ }
        this.sessions.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) console.log(`[WhatsAppSessionStore] Evicted ${evicted} expired session(s).`);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

const store = new WhatsAppSessionStore();

module.exports = { WhatsAppSessionStore, store };

const { dbService } = require('../services/DatabaseService');

class WhatsAppAutomationSessionStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000, maxSessions = 5000, sweepMs = 10 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
      if (this.sweepTimer.unref) this.sweepTimer.unref();
    }
  }
  sweep(now = Date.now()) {
    for (const [key, value] of this.sessions) {
      if (now - value.lastActivityAt > this.ttlMs) this.sessions.delete(key);
    }
    // Map keeps insertion order, so the oldest entries go first; DB copy stays for reload
    while (this.sessions.size > this.maxSessions) {
      this.sessions.delete(this.sessions.keys().next().value);
    }
  }
  key(connectionId, contactWaId) { return `${connectionId}:${contactWaId}`; }
  get(connectionId, contactWaId) {
    const value = this.sessions.get(this.key(connectionId, contactWaId));
    if (!value || Date.now() - value.lastActivityAt > this.ttlMs) return null;
    return value;
  }
  async load(connection, automation, contactWaId) {
    const session = await dbService.prisma.whatsAppAutomationSession.findUnique({
      where: { connectionId_contactWaId: { connectionId: connection.id, contactWaId } },
    });
    if (!session || Date.now() - session.lastActivityAt.getTime() > this.ttlMs) return null;
    return {
      connectionId: connection.id,
      automationId: automation.id,
      contactWaId,
      transcript: Array.isArray(session.transcript) ? session.transcript : [],
      status: session.status,
      createdAt: session.createdAt.getTime(),
      lastActivityAt: session.lastActivityAt.getTime(),
    };
  }
  async set(connection, automation, contactWaId, value) {
    const now = new Date();
    const key = this.key(connection.id, contactWaId);
    const existing = this.sessions.get(key);
    this.sessions.set(key, {
      ...value,
      connectionId: connection.id,
      automationId: automation.id,
      contactWaId,
      createdAt: existing?.createdAt || value.createdAt || Date.now(),
      lastActivityAt: Date.now(),
    });
    try {
      await dbService.prisma.whatsAppAutomationSession.upsert({
        where: { connectionId_contactWaId: { connectionId: connection.id, contactWaId } },
        create: { automationId: automation.id, connectionId: connection.id, contactWaId, transcript: value.conversationManager?.transcript || [] },
        update: { lastActivityAt: now, transcript: value.conversationManager?.transcript || [] },
      });
    } catch (err) {
      console.error('[WhatsAppAutomationSessionStore] persistence failed:', err.message);
      throw err;
    }
  }
  touch(connectionId, contactWaId) {
    const value = this.get(connectionId, contactWaId);
    if (value) value.lastActivityAt = Date.now();
    return value;
  }
  clearAutomation(automationId) {
    for (const [key, value] of this.sessions) {
      if (value.automationId === automationId) this.sessions.delete(key);
    }
  }
  list() { return [...this.sessions.entries()].map(([key, value]) => ({ key, ...value })); }
}

const store = new WhatsAppAutomationSessionStore();
module.exports = { WhatsAppAutomationSessionStore, store };

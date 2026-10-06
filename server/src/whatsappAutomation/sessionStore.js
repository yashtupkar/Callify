const { dbService } = require('../services/DatabaseService');

class WhatsAppAutomationSessionStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }
  key(connectionId, contactWaId) { return `${connectionId}:${contactWaId}`; }
  get(connectionId, contactWaId) {
    const value = this.sessions.get(this.key(connectionId, contactWaId));
    if (!value || Date.now() - value.lastActivityAt > this.ttlMs) return null;
    return value;
  }
  async set(connection, automation, contactWaId, value) {
    const now = new Date();
    const key = this.key(connection.id, contactWaId);
    this.sessions.set(key, { ...value, connectionId: connection.id, automationId: automation.id, contactWaId, createdAt: Date.now(), lastActivityAt: Date.now() });
    try {
      await dbService.prisma.whatsAppAutomationSession.upsert({
        where: { connectionId_contactWaId: { connectionId: connection.id, contactWaId } },
        create: { automationId: automation.id, connectionId: connection.id, contactWaId, transcript: value.conversationManager?.transcript || [] },
        update: { lastActivityAt: now, transcript: value.conversationManager?.transcript || [] },
      });
    } catch (err) { console.warn('[WhatsAppAutomationSessionStore] persistence failed:', err.message); }
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

const crypto = require('crypto');
const { CAMPAIGN_STATUS: C, RECIPIENT_STATUS: R, SKIP_REASON } = require('./constants');
const { nextRecipientState } = require('./state');

/** In-memory implementation of the campaign repo interface. Used by tests only. */
function createMemoryRepo({ now = () => new Date() } = {}) {
  const campaigns = new Map();
  const recipients = new Map();
  const stash = new Map();
  const optOuts = new Set();
  const connections = new Map();
  const key = (w, p) => `${w}:${p}`;
  const byCampaign = (id) => [...recipients.values()].filter((r) => r.campaignId === id);

  const repo = {
    _state: { campaigns, recipients, stash, optOuts, connections },
    addConnection(conn) { connections.set(conn.id, conn); },

    async createCampaign(data, items) {
      if (data.idempotencyKey) {
        const found = [...campaigns.values()].find((c) => c.workspaceId === data.workspaceId && c.idempotencyKey === data.idempotencyKey);
        if (found) return { campaign: found, existing: true };
      }
      const campaign = { id: crypto.randomUUID(), status: C.DRAFT, createdAt: now(), ...data };
      campaigns.set(campaign.id, campaign);
      for (const item of items) {
        const id = crypto.randomUUID();
        recipients.set(id, {
          id, campaignId: campaign.id, phone: item.phone ?? null, rawPhone: item.rawPhone ?? null, name: item.name ?? null,
          variables: item.variables ?? null, status: item.status || R.PENDING, skipReason: item.skipReason || null,
          attempts: 0, nextAttemptAt: null, lockedBy: null, lockedUntil: null, sendStartedAt: null, providerMessageId: null,
          errorCode: null, errorMessage: null, queuedAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
          createdAt: now(),
        });
      }
      return { campaign, existing: false };
    },
    async getCampaign(workspaceId, id) {
      const c = campaigns.get(id);
      return c && c.workspaceId === workspaceId ? c : null;
    },
    async getCampaignById(id) { return campaigns.get(id) || null; },
    async listCampaigns(workspaceId, { limit = 50, offset = 0 } = {}) {
      const all = [...campaigns.values()].filter((c) => c.workspaceId === workspaceId).sort((a, b) => b.createdAt - a.createdAt);
      return { items: all.slice(offset, offset + limit), total: all.length };
    },
    async counts(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      const out = {};
      for (const id of list) {
        out[id] = {};
        for (const r of byCampaign(id)) out[id][r.status] = (out[id][r.status] || 0) + 1;
      }
      return out;
    },
    async listRecipients(campaignId, { status, limit = 100, offset = 0 } = {}) {
      const all = byCampaign(campaignId).filter((r) => !status || r.status === status);
      return { items: all.slice(offset, offset + limit), total: all.length };
    },
    async transition(id, from, patch) {
      const c = campaigns.get(id);
      if (!c || !from.includes(c.status)) return false;
      Object.assign(c, patch);
      return true;
    },
    async queueRecipients(campaignId, at = now()) {
      let n = 0;
      for (const r of byCampaign(campaignId)) if (r.status === R.PENDING) { r.status = R.QUEUED; r.queuedAt = at; n += 1; }
      return n;
    },
    async skipUnsent(campaignId, reason) {
      let n = 0;
      for (const r of byCampaign(campaignId)) {
        if ([R.PENDING, R.QUEUED].includes(r.status) && !r.sendStartedAt) {
          Object.assign(r, { status: R.SKIPPED, skipReason: reason, lockedBy: null, lockedUntil: null });
          n += 1;
        }
      }
      return n;
    },
    async runningCampaigns() { return [...campaigns.values()].filter((c) => c.status === C.RUNNING); },
    async countQueued(campaignId) { return byCampaign(campaignId).filter((r) => r.status === R.QUEUED).length; },
    async claimRecipients(campaignId, { limit, workerId, leaseMs, now: at = now() }) {
      const claimed = byCampaign(campaignId)
        .filter((r) => r.status === R.QUEUED && !r.sendStartedAt
          && (!r.nextAttemptAt || r.nextAttemptAt <= at) && (!r.lockedUntil || r.lockedUntil < at))
        .slice(0, limit);
      for (const r of claimed) { r.lockedBy = workerId; r.lockedUntil = new Date(at.getTime() + leaseMs); }
      return claimed.map((r) => ({ ...r }));
    },
    async markSending(id, workerId, at = now()) {
      const r = recipients.get(id);
      if (!r || r.lockedBy !== workerId || r.status !== R.QUEUED || r.sendStartedAt) return false;
      r.sendStartedAt = at; r.attempts += 1;
      return true;
    },
    async markSent(id, workerId, providerMessageId, at = now()) {
      const r = recipients.get(id);
      if (!r || r.lockedBy !== workerId || r.status !== R.QUEUED) return false;
      Object.assign(r, { status: R.SENT, sentAt: at, providerMessageId: providerMessageId || null, lockedBy: null, lockedUntil: null, errorCode: null, errorMessage: null });
      return true;
    },
    async markFailed(id, workerId, { code, message }, at = now()) {
      const r = recipients.get(id);
      if (!r || r.lockedBy !== workerId || r.status !== R.QUEUED) return false;
      Object.assign(r, { status: R.FAILED, failedAt: at, errorCode: code, errorMessage: message, lockedBy: null, lockedUntil: null });
      return true;
    },
    async requeue(id, workerId, { nextAttemptAt, code, message, refundAttempt = false }) {
      const r = recipients.get(id);
      if (!r || r.lockedBy !== workerId || r.status !== R.QUEUED) return false;
      Object.assign(r, { nextAttemptAt: nextAttemptAt || null, sendStartedAt: null, lockedBy: null, lockedUntil: null, errorCode: code || null, errorMessage: message || null });
      if (refundAttempt) r.attempts -= 1;
      return true;
    },
    async markSkipped(id, workerId, reason) {
      const r = recipients.get(id);
      if (!r || r.lockedBy !== workerId || r.status !== R.QUEUED) return false;
      Object.assign(r, { status: R.SKIPPED, skipReason: reason, lockedBy: null, lockedUntil: null });
      return true;
    },
    async recoverExpired(at = now()) {
      let unknown = 0;
      for (const r of recipients.values()) {
        if (r.status === R.QUEUED && r.sendStartedAt && r.lockedUntil && r.lockedUntil < at) {
          Object.assign(r, { status: R.FAILED, failedAt: at, lockedBy: null, lockedUntil: null, errorCode: 'UNKNOWN_OUTCOME', errorMessage: 'Worker stopped while sending' });
          unknown += 1;
        }
      }
      return { unknown };
    },
    async countSentSince(connectionId, since) {
      return [...recipients.values()].filter((r) => r.sentAt && r.sentAt >= since && campaigns.get(r.campaignId)?.connectionId === connectionId).length;
    },
    async applyStatus(connectionId, update) {
      const r = [...recipients.values()].find((x) => x.providerMessageId === update.providerMessageId);
      if (!r) {
        if (!stash.has(update.providerMessageId)) stash.set(update.providerMessageId, { connectionId, ...update });
        return 'stashed';
      }
      if (campaigns.get(r.campaignId)?.connectionId !== connectionId) return 'noop';
      const patch = nextRecipientState(r, update);
      if (!patch) return 'noop';
      Object.assign(r, patch);
      return 'applied';
    },
    async consumeStashed(providerMessageId) {
      const e = stash.get(providerMessageId);
      stash.delete(providerMessageId);
      return e || null;
    },
    async optedOutPhones(workspaceId, phones) { return new Set(phones.filter((p) => optOuts.has(key(workspaceId, p)))); },
    async isOptedOut(workspaceId, phone) { return optOuts.has(key(workspaceId, phone)); },
    async addOptOut(workspaceId, phone) { optOuts.add(key(workspaceId, phone)); },
    async removeOptOut(workspaceId, phone) { optOuts.delete(key(workspaceId, phone)); },
    async skipOptedOutQueued(workspaceId, phone) {
      let n = 0;
      for (const r of recipients.values()) {
        if (r.phone === phone && [R.PENDING, R.QUEUED].includes(r.status) && !r.sendStartedAt && campaigns.get(r.campaignId)?.workspaceId === workspaceId) {
          Object.assign(r, { status: R.SKIPPED, skipReason: SKIP_REASON.OPTED_OUT, lockedBy: null, lockedUntil: null });
          n += 1;
        }
      }
      return n;
    },
    async getConnection(workspaceId, id) {
      const c = connections.get(id);
      return c && c.automation.workspaceId === workspaceId ? c : null;
    },
    async listConnections(workspaceId) { return [...connections.values()].filter((c) => c.automation.workspaceId === workspaceId); },
    async getConnectionForWorker(id) { return connections.get(id) || null; },
  };
  return repo;
}

module.exports = { createMemoryRepo };

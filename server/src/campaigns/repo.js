const crypto = require('crypto');
const { dbService } = require('../services/DatabaseService');
const { CAMPAIGN_STATUS: C, RECIPIENT_STATUS: R, SKIP_REASON } = require('./constants');
const { nextRecipientState } = require('./state');

const prisma = () => dbService.prisma;
const RECIPIENT_TABLE = '"WhatsAppCampaignRecipient"';
const STASH_TTL_MS = 7 * 24 * 3600 * 1000;
const RANK = { sent: 1, delivered: 2, read: 3, failed: 4 };

function recipientRows(campaignId, items) {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    campaignId,
    phone: item.phone ?? null,
    rawPhone: item.rawPhone ?? null,
    name: item.name ?? null,
    variables: item.variables ?? undefined,
    status: item.status || R.PENDING,
    skipReason: item.skipReason || null,
  }));
}

const repo = {
  async createCampaign(data, items) {
    const { workspaceId, idempotencyKey } = data;
    if (idempotencyKey) {
      const existing = await prisma().whatsAppCampaign.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
      });
      if (existing) return { campaign: existing, existing: true };
    }
    try {
      const campaign = await prisma().$transaction(async (tx) => {
        const created = await tx.whatsAppCampaign.create({ data });
        const rows = recipientRows(created.id, items);
        for (let i = 0; i < rows.length; i += 1000) {
          await tx.whatsAppCampaignRecipient.createMany({ data: rows.slice(i, i + 1000) });
        }
        return created;
      }, { timeout: 60000 });
      return { campaign, existing: false };
    } catch (error) {
      if (error.code === 'P2002' && idempotencyKey) {
        const existing = await prisma().whatsAppCampaign.findUnique({
          where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
        });
        if (existing) return { campaign: existing, existing: true };
      }
      throw error;
    }
  },

  getCampaign(workspaceId, id) {
    return prisma().whatsAppCampaign.findFirst({ where: { id, workspaceId } });
  },
  getCampaignById(id) {
    return prisma().whatsAppCampaign.findUnique({ where: { id } });
  },
  async listCampaigns(workspaceId, { limit = 50, offset = 0 } = {}) {
    const [items, total] = await Promise.all([
      prisma().whatsAppCampaign.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma().whatsAppCampaign.count({ where: { workspaceId } }),
    ]);
    return { items, total };
  },
  async counts(campaignIds) {
    const ids = Array.isArray(campaignIds) ? campaignIds : [campaignIds];
    const groups = await prisma().whatsAppCampaignRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    });
    const out = {};
    for (const id of ids) out[id] = {};
    for (const g of groups) out[g.campaignId][g.status] = g._count._all;
    return out;
  },
  async listRecipients(campaignId, { status, limit = 100, offset = 0 } = {}) {
    const where = { campaignId, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      prisma().whatsAppCampaignRecipient.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit, skip: offset }),
      prisma().whatsAppCampaignRecipient.count({ where }),
    ]);
    return { items, total };
  },

  async transition(id, fromStatuses, patch) {
    const result = await prisma().whatsAppCampaign.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: patch,
    });
    return result.count === 1;
  },

  async queueRecipients(campaignId, now = new Date()) {
    const result = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { campaignId, status: R.PENDING },
      data: { status: R.QUEUED, queuedAt: now },
    });
    return result.count;
  },

  /** Skips every recipient that has not yet been handed to the provider (used by cancel). */
  async skipUnsent(campaignId, reason) {
    const result = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { campaignId, status: { in: [R.PENDING, R.QUEUED] }, sendStartedAt: null },
      data: { status: R.SKIPPED, skipReason: reason, lockedBy: null, lockedUntil: null },
    });
    return result.count;
  },

  runningCampaigns() {
    return prisma().whatsAppCampaign.findMany({ where: { status: C.RUNNING } });
  },
  async countQueued(campaignId) {
    return prisma().whatsAppCampaignRecipient.count({ where: { campaignId, status: R.QUEUED } });
  },

  async claimRecipients(campaignId, { limit, workerId, leaseMs, now = new Date() }) {
    const lockedUntil = new Date(now.getTime() + leaseMs);
    return prisma().$queryRawUnsafe(
      `UPDATE ${RECIPIENT_TABLE} SET "lockedBy" = $1, "lockedUntil" = $2, "updatedAt" = $4
       WHERE id IN (
         SELECT id FROM ${RECIPIENT_TABLE}
         WHERE "campaignId" = $3 AND status = 'queued' AND "sendStartedAt" IS NULL
           AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= $4)
           AND ("lockedUntil" IS NULL OR "lockedUntil" < $4)
         ORDER BY "createdAt", id
         LIMIT $5
         FOR UPDATE SKIP LOCKED
       ) RETURNING *`,
      workerId, lockedUntil, campaignId, now, limit,
    );
  },

  async markSending(id, workerId, now = new Date()) {
    const r = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { id, lockedBy: workerId, status: R.QUEUED, sendStartedAt: null },
      data: { sendStartedAt: now, attempts: { increment: 1 } },
    });
    return r.count === 1;
  },
  async markSent(id, workerId, providerMessageId, now = new Date()) {
    const r = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { id, lockedBy: workerId, status: R.QUEUED },
      data: { status: R.SENT, sentAt: now, providerMessageId: providerMessageId || null, lockedBy: null, lockedUntil: null, errorCode: null, errorMessage: null },
    });
    return r.count === 1;
  },
  async markFailed(id, workerId, { code, message }, now = new Date()) {
    const r = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { id, lockedBy: workerId, status: R.QUEUED },
      data: { status: R.FAILED, failedAt: now, errorCode: code, errorMessage: String(message || '').slice(0, 500), lockedBy: null, lockedUntil: null },
    });
    return r.count === 1;
  },
  /** Puts a recipient back in the queue. `refundAttempt` is used when nothing was actually sent. */
  async requeue(id, workerId, { nextAttemptAt, code, message, refundAttempt = false }) {
    const r = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { id, lockedBy: workerId, status: R.QUEUED },
      data: {
        nextAttemptAt: nextAttemptAt || null,
        sendStartedAt: null,
        lockedBy: null,
        lockedUntil: null,
        errorCode: code || null,
        errorMessage: message ? String(message).slice(0, 500) : null,
        ...(refundAttempt ? { attempts: { decrement: 1 } } : {}),
      },
    });
    return r.count === 1;
  },
  async markSkipped(id, workerId, reason) {
    const r = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { id, lockedBy: workerId, status: R.QUEUED },
      data: { status: R.SKIPPED, skipReason: reason, lockedBy: null, lockedUntil: null },
    });
    return r.count === 1;
  },

  /** Rows whose worker died after calling the provider: outcome unknown, never auto-resent. */
  async recoverExpired(now = new Date()) {
    const unknown = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { status: R.QUEUED, sendStartedAt: { not: null }, lockedUntil: { lt: now } },
      data: {
        status: R.FAILED, failedAt: now, lockedBy: null, lockedUntil: null,
        errorCode: 'UNKNOWN_OUTCOME',
        errorMessage: 'Worker stopped while sending; the message may or may not have been sent. Not retried to avoid duplicates.',
      },
    });
    await prisma().whatsAppCampaignStatusEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - STASH_TTL_MS) } } });
    return { unknown: unknown.count };
  },

  async countSentSince(connectionId, since) {
    return prisma().whatsAppCampaignRecipient.count({
      where: { sentAt: { gte: since }, campaign: { connectionId } },
    });
  },

  async applyStatus(connectionId, update) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const recipient = await prisma().whatsAppCampaignRecipient.findUnique({
        where: { providerMessageId: update.providerMessageId },
        include: { campaign: { select: { connectionId: true } } },
      });
      if (!recipient) {
        if (!(update.status in RANK)) return 'noop';
        await prisma().whatsAppCampaignStatusEvent.upsert({
          where: { providerMessageId: update.providerMessageId },
          create: { connectionId, providerMessageId: update.providerMessageId, status: update.status, errorCode: update.errorCode || null, errorMessage: update.errorMessage || null, occurredAt: update.occurredAt || new Date() },
          update: {},
        });
        // The worker may have stored the id between our lookup and the stash; re-check once.
        const raced = await prisma().whatsAppCampaignRecipient.findUnique({ where: { providerMessageId: update.providerMessageId }, select: { id: true } });
        if (!raced) return 'stashed';
        continue;
      }
      if (recipient.campaign.connectionId !== connectionId) return 'noop';
      const patch = nextRecipientState(recipient, update);
      if (!patch) return 'noop';
      const r = await prisma().whatsAppCampaignRecipient.updateMany({
        where: { id: recipient.id, status: recipient.status },
        data: patch,
      });
      if (r.count === 1) return 'applied';
    }
    return 'noop';
  },
  async consumeStashed(providerMessageId) {
    const event = await prisma().whatsAppCampaignStatusEvent.findUnique({ where: { providerMessageId } });
    if (!event) return null;
    await prisma().whatsAppCampaignStatusEvent.deleteMany({ where: { id: event.id } });
    return event;
  },

  async optedOutPhones(workspaceId, phones) {
    if (!phones.length) return new Set();
    const rows = await prisma().whatsAppOptOut.findMany({ where: { workspaceId, phone: { in: phones } }, select: { phone: true } });
    return new Set(rows.map((r) => r.phone));
  },
  async isOptedOut(workspaceId, phone) {
    return !!(await prisma().whatsAppOptOut.findUnique({ where: { workspaceId_phone: { workspaceId, phone } }, select: { id: true } }));
  },
  async addOptOut(workspaceId, phone, source) {
    await prisma().whatsAppOptOut.upsert({
      where: { workspaceId_phone: { workspaceId, phone } },
      create: { workspaceId, phone, source },
      update: {},
    });
  },
  async removeOptOut(workspaceId, phone) {
    await prisma().whatsAppOptOut.deleteMany({ where: { workspaceId, phone } });
  },
  async skipOptedOutQueued(workspaceId, phone) {
    const r = await prisma().whatsAppCampaignRecipient.updateMany({
      where: { phone, status: { in: [R.PENDING, R.QUEUED] }, sendStartedAt: null, campaign: { workspaceId } },
      data: { status: R.SKIPPED, skipReason: SKIP_REASON.OPTED_OUT, lockedBy: null, lockedUntil: null },
    });
    return r.count;
  },

  /** Connection lookup scoped to the workspace via its automation. */
  getConnection(workspaceId, connectionId) {
    return prisma().whatsAppConnection.findFirst({
      where: { id: connectionId, automation: { workspaceId } },
      include: { automation: { select: { id: true, workspaceId: true, status: true } } },
    });
  },
  listConnections(workspaceId) {
    return prisma().whatsAppConnection.findMany({
      where: { automation: { workspaceId } },
      include: { automation: { select: { id: true, name: true, workspaceId: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },
  getConnectionForWorker(connectionId) {
    return prisma().whatsAppConnection.findUnique({
      where: { id: connectionId },
      include: { automation: { select: { id: true, workspaceId: true, status: true } } },
    });
  },
};

module.exports = { repo };

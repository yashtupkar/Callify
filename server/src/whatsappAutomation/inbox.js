/**
 * Durable inbox for inbound WhatsApp messages (Postgres via Prisma).
 *
 *  - claim():   INSERT with a unique (connectionId, providerMessageId) key. A unique
 *               violation means another delivery/instance already owns the message, so
 *               Meta retries are deduplicated across instances and restarts.
 *  - markDone / markDropped: finish the message.
 *  - recoverPending(): replays rows left 'pending' (crash after ACK) with at-least-once
 *               semantics, bounded by MAX_ATTEMPTS.
 *  - countRecent(): DB-backed per-contact rate limiting shared by all instances.
 */
const { dbService } = require('../services/DatabaseService');

const MAX_ATTEMPTS = Number(process.env.WHATSAPP_INBOX_MAX_ATTEMPTS || 3);
const STALE_MS = Number(process.env.WHATSAPP_INBOX_STALE_MS || 5 * 60 * 1000);

const table = () => dbService.prisma.whatsAppInboundMessage;

/** @returns {Promise<boolean>} true when this caller now owns the message. */
async function claim(connectionId, message) {
  try {
    await table().create({
      data: {
        connectionId,
        providerMessageId: String(message.providerMessageId),
        contactWaId: String(message.from),
        payload: JSON.parse(JSON.stringify(message)),
      },
    });
    return true;
  } catch (err) {
    if (err.code === 'P2002') return false;
    throw err;
  }
}

async function finish(connectionId, providerMessageIds, status) {
  const ids = providerMessageIds.filter(Boolean).map(String);
  if (!ids.length) return;
  await table().updateMany({
    where: { connectionId, providerMessageId: { in: ids } },
    data: { status },
  });
}

const markDone = (connectionId, ids) => finish(connectionId, ids, 'done');
const markDropped = (connectionId, ids) => finish(connectionId, ids, 'dropped');

async function countRecent(connectionId, contactWaId, windowMs) {
  return table().count({
    where: { connectionId, contactWaId: String(contactWaId), createdAt: { gte: new Date(Date.now() - windowMs) } },
  });
}

/**
 * Replays stale pending messages. `processFn` receives { connectionId, messages } and
 * must run the normal handling path. Rows are taken over atomically (guarded by the
 * previous updatedAt) so two instances never replay the same row.
 */
async function recoverPending(processFn, { now = Date.now() } = {}) {
  const cutoff = new Date(now - STALE_MS);
  const stale = await table().findMany({
    where: { status: 'pending', updatedAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const byConnection = new Map();
  for (const row of stale) {
    if (row.attempts >= MAX_ATTEMPTS) {
      await table().updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'failed' } });
      continue;
    }
    const taken = await table().updateMany({
      where: { id: row.id, status: 'pending', updatedAt: row.updatedAt },
      data: { attempts: { increment: 1 } },
    });
    if (!taken.count) continue;
    byConnection.set(row.connectionId, [...(byConnection.get(row.connectionId) || []), row.payload]);
  }
  let replayed = 0;
  for (const [connectionId, messages] of byConnection) {
    try {
      await processFn({ connectionId, messages });
      replayed += messages.length;
    } catch (err) {
      console.error('[WhatsAppInbox] Replay failed:', { connectionId, error: err.message });
    }
  }
  return replayed;
}

/** Deletes finished rows older than `olderThanMs` to keep the table small. */
async function purge(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
  const result = await table().deleteMany({
    where: { status: { in: ['done', 'dropped', 'failed'] }, updatedAt: { lt: new Date(Date.now() - olderThanMs) } },
  });
  return result.count;
}

module.exports = { claim, markDone, markDropped, countRecent, recoverPending, purge, MAX_ATTEMPTS, STALE_MS };

const { OPT_OUT_KEYWORDS, OPT_IN_KEYWORDS } = require('./constants');

const normalizeText = (text) => String(text || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Returns 'opt_out', 'opt_in' or null. Only whole-message keywords count, so "please don't stop" is ignored. */
function detectKeyword(text) {
  const t = normalizeText(text);
  if (!t) return null;
  if (OPT_OUT_KEYWORDS.includes(t)) return 'opt_out';
  if (OPT_IN_KEYWORDS.includes(t)) return 'opt_in';
  return null;
}

/**
 * Applies inbound STOP/START keywords for a workspace. Safe to call for every inbound message;
 * never throws into the messaging pipeline.
 */
async function handleInboundOptOut({ repo, workspaceId, from, text, logger = console }) {
  try {
    const keyword = detectKeyword(text);
    const phone = String(from || '').replace(/\D/g, '');
    if (!keyword || !workspaceId || !phone) return null;
    if (keyword === 'opt_out') {
      await repo.addOptOut(workspaceId, phone, 'inbound_keyword');
      await repo.skipOptedOutQueued(workspaceId, phone);
      return 'opted_out';
    }
    await repo.removeOptOut(workspaceId, phone);
    return 'opted_in';
  } catch (error) {
    logger.error?.('[Campaigns] Opt-out handling failed:', error.message);
    return null;
  }
}

/** Applies Meta status webhooks (sent/delivered/read/failed) to campaign recipients of this connection. */
async function applyStatusUpdates({ repo, connection, updates, logger = console }) {
  let applied = 0;
  for (const update of updates || []) {
    try {
      if (!update?.providerMessageId || !['sent', 'delivered', 'read', 'failed'].includes(update.status)) continue;
      const err = update.errors?.[0];
      const result = await repo.applyStatus(connection.id, {
        providerMessageId: update.providerMessageId,
        status: update.status,
        errorCode: err?.code !== undefined ? `META_${err.code}` : undefined,
        errorMessage: err ? [err.title, err.message].filter(Boolean).join(': ') : undefined,
        occurredAt: update.timestamp ? new Date(Number(update.timestamp) * 1000) : new Date(),
      });
      if (result === 'applied') applied += 1;
    } catch (error) {
      logger.error?.('[Campaigns] Failed to apply status update:', error.message);
    }
  }
  return applied;
}

module.exports = { detectKeyword, handleInboundOptOut, applyStatusUpdates };

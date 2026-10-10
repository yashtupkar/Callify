const crypto = require('crypto');
const { CAMPAIGN_STATUS: C, SKIP_REASON, CHANNEL } = require('./constants');
const { TokenBucket } = require('./state');
const { classifyError, backoffMs } = require('./errors');
const { buildTemplateComponents, renderPlainText, MissingVariableError } = require('./templates');

const DAY_MS = 24 * 3600 * 1000;

/**
 * Background sender. It claims recipients from the database queue (leases + SKIP LOCKED), so it is safe
 * across restarts and duplicate ticks. Rate limiting is in-process: run ONE worker instance per deployment.
 */
function createWorker({
  repo,
  createProvider,
  now = () => new Date(),
  workerId = `worker-${crypto.randomUUID()}`,
  tickMs = 2000,
  leaseMs = 5 * 60 * 1000,
  rateLimitCooldownMs = 60 * 1000,
  random = Math.random,
  logger = console,
} = {}) {
  const buckets = new Map();
  const cooldowns = new Map();
  let timer = null;
  let running = false;
  let inFlight = null;

  const bucketFor = (campaign) => {
    let bucket = buckets.get(campaign.id);
    if (!bucket) {
      bucket = new TokenBucket({ ratePerMinute: campaign.ratePerMinute, burst: Math.max(1, Math.min(campaign.concurrency, campaign.ratePerMinute)), now: () => now().getTime() });
      buckets.set(campaign.id, bucket);
    }
    return bucket;
  };

  async function pauseCampaign(campaign, note) {
    await repo.transition(campaign.id, [C.RUNNING], { status: C.PAUSED, pausedAt: now(), statusNote: note });
  }

  async function handleFailure(campaign, recipient, error) {
    const info = classifyError(error);
    const attempts = recipient.attempts + 1; // markSending already incremented the stored value
    if (info.action === 'pause') {
      await repo.requeue(recipient.id, workerId, { code: info.code, message: info.message, refundAttempt: true });
      await pauseCampaign(campaign, `Paused automatically: ${info.message}`);
      return;
    }
    if (info.action === 'retry') {
      if (info.rateLimited) cooldowns.set(campaign.id, now().getTime() + rateLimitCooldownMs);
      if (attempts >= campaign.maxAttempts) {
        await repo.markFailed(recipient.id, workerId, { code: info.code, message: `${info.message} (gave up after ${attempts} attempts)` }, now());
      } else {
        await repo.requeue(recipient.id, workerId, {
          nextAttemptAt: new Date(now().getTime() + backoffMs(attempts, { random })),
          code: info.code,
          message: info.message,
        });
      }
      return;
    }
    await repo.markFailed(recipient.id, workerId, { code: info.code, message: info.message }, now());
  }

  async function sendOne(campaign, connection, provider, recipient) {
    if (await repo.isOptedOut(campaign.workspaceId, recipient.phone)) {
      await repo.markSkipped(recipient.id, workerId, SKIP_REASON.OPTED_OUT);
      return;
    }
    let send;
    try {
      const person = { phone: recipient.phone, name: recipient.name, variables: recipient.variables || {} };
      const config = { variableMap: campaign.variableMap || {}, headerMediaUrl: campaign.headerMediaUrl };
      if (campaign.channel === CHANNEL.CLOUD_API) {
        const components = buildTemplateComponents(campaign.templateSnapshot, config, person);
        send = () => provider.sendTemplate(recipient.phone, campaign.templateName, campaign.templateLanguage, components);
      } else {
        const text = renderPlainText(campaign.messageText, config, person);
        send = () => provider.sendText(recipient.phone, text);
      }
    } catch (error) {
      if (error instanceof MissingVariableError) {
        await repo.markSkipped(recipient.id, workerId, SKIP_REASON.MISSING_VARIABLE);
        return;
      }
      await repo.markFailed(recipient.id, workerId, { code: 'BUILD_FAILED', message: error.message }, now());
      return;
    }

    // From here the provider may receive the request; a crash leaves the outcome unknown (never auto-resent).
    if (!(await repo.markSending(recipient.id, workerId, now()))) return;
    let response;
    try {
      response = await send();
    } catch (error) {
      await handleFailure(campaign, recipient, error);
      return;
    }
    const providerMessageId = typeof response === 'string' ? response : response?.messages?.[0]?.id || response?.id || null;
    const stored = await repo.markSent(recipient.id, workerId, providerMessageId, now());
    if (!stored) {
      logger.warn?.(`[Campaigns] Lost lease after sending to recipient ${recipient.id}`);
      return;
    }
    if (providerMessageId) {
      // A delivery/read webhook may have beaten us here.
      const early = await repo.consumeStashed(providerMessageId);
      if (early) {
        await repo.applyStatus(connection.id, {
          providerMessageId, status: early.status, errorCode: early.errorCode, errorMessage: early.errorMessage, occurredAt: early.occurredAt,
        });
      }
    }
  }

  async function processCampaign(campaign) {
    if ((cooldowns.get(campaign.id) || 0) > now().getTime()) return;
    const connection = await repo.getConnectionForWorker(campaign.connectionId);
    if (!connection || !connection.enabled || connection.automation?.workspaceId !== campaign.workspaceId) {
      await pauseCampaign(campaign, 'Paused automatically: WhatsApp connection is missing or disabled');
      return;
    }

    let provider;
    try {
      provider = createProvider(connection);
    } catch (error) {
      await pauseCampaign(campaign, `Paused automatically: ${error.message}`);
      return;
    }
    if (campaign.channel === CHANNEL.BAILEYS && provider.connectionStatus !== 'connected') return;

    const sentToday = await repo.countSentSince(connection.id, new Date(now().getTime() - DAY_MS));
    const dailyRoom = campaign.dailyLimit ? campaign.dailyLimit - sentToday : Infinity;

    const bucket = bucketFor(campaign);
    bucket.setRate(campaign.ratePerMinute, Math.max(1, Math.min(campaign.concurrency, campaign.ratePerMinute)));
    const wanted = Math.min(campaign.concurrency, dailyRoom);
    const granted = wanted > 0 ? bucket.take(wanted) : 0;
    let rows = [];
    if (granted > 0) {
      rows = await repo.claimRecipients(campaign.id, { limit: granted, workerId, leaseMs, now: now() });
      bucket.tokens += granted - rows.length;
    }

    if (rows.length) {
      const fresh = await repo.getCampaignById(campaign.id);
      if (!fresh || fresh.status !== C.RUNNING) {
        for (const r of rows) await repo.requeue(r.id, workerId, { nextAttemptAt: r.nextAttemptAt });
        return;
      }
      await Promise.all(rows.map((r) => sendOne(campaign, connection, provider, r).catch((error) => {
        // Leave the row alone: lease expiry either re-queues it (never sent) or marks it UNKNOWN_OUTCOME.
        logger.error?.('[Campaigns] Unexpected error sending recipient', r.id, error.message);
      })));
    }

    if ((await repo.countQueued(campaign.id)) === 0) {
      await repo.transition(campaign.id, [C.RUNNING], { status: C.COMPLETED, completedAt: now(), statusNote: null });
      buckets.delete(campaign.id);
      cooldowns.delete(campaign.id);
    }
  }

  async function tick() {
    await repo.recoverExpired(now());
    const campaigns = await repo.runningCampaigns();
    // Campaigns sharing one connection run one after another so a connection is never over-driven.
    const groups = new Map();
    for (const campaign of campaigns) {
      const list = groups.get(campaign.connectionId) || [];
      list.push(campaign);
      groups.set(campaign.connectionId, list);
    }
    await Promise.all([...groups.values()].map(async (list) => {
      for (const campaign of list) {
        try {
          await processCampaign(campaign);
        } catch (error) {
          logger.error?.(`[Campaigns] Campaign ${campaign.id} tick failed:`, error.message);
        }
      }
    }));
  }

  function schedule() {
    if (!running) return;
    timer = setTimeout(async () => {
      inFlight = tick().catch((e) => logger.error?.('[Campaigns] Worker tick failed:', e.message));
      await inFlight;
      inFlight = null;
      schedule();
    }, tickMs);
    timer.unref?.();
  }

  return {
    tick,
    workerId,
    start() {
      if (running) return;
      running = true;
      logger.log?.(`[Campaigns] Worker ${workerId} started`);
      schedule();
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      if (inFlight) await inFlight;
    },
  };
}

module.exports = { createWorker };

const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: 'draft',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

const RECIPIENT_STATUS = Object.freeze({
  PENDING: 'pending',
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

const SKIP_REASON = Object.freeze({
  INVALID_NUMBER: 'invalid_number',
  OPTED_OUT: 'opted_out',
  NO_OPT_IN: 'no_opt_in',
  MISSING_VARIABLE: 'missing_variable',
  CANCELLED: 'cancelled',
});

const CHANNEL = Object.freeze({ CLOUD_API: 'cloud_api', BAILEYS: 'baileys' });

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// Provider-specific ceilings. Baileys is an unofficial protocol: keep it slow and small.
const limits = () => ({
  [CHANNEL.CLOUD_API]: {
    maxRecipients: num('CAMPAIGN_MAX_RECIPIENTS_CLOUD', 10000),
    maxConcurrency: 10,
    maxRatePerMinute: 600,
    defaultConcurrency: 2,
    defaultRatePerMinute: 30,
    defaultDailyCap: num('CAMPAIGN_DAILY_CAP_CLOUD', 250),
  },
  [CHANNEL.BAILEYS]: {
    maxRecipients: num('CAMPAIGN_MAX_RECIPIENTS_BAILEYS', 500),
    maxConcurrency: 1,
    maxRatePerMinute: 20,
    defaultConcurrency: 1,
    defaultRatePerMinute: 6,
    defaultDailyCap: num('CAMPAIGN_DAILY_CAP_BAILEYS', 200),
  },
});

const OPT_OUT_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out', 'opt-out'];
const OPT_IN_KEYWORDS = ['start', 'unstop', 'subscribe'];

module.exports = { CAMPAIGN_STATUS, RECIPIENT_STATUS, SKIP_REASON, CHANNEL, limits, OPT_OUT_KEYWORDS, OPT_IN_KEYWORDS };

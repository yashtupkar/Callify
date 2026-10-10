const { CAMPAIGN_STATUS: C, RECIPIENT_STATUS: R } = require('./constants');

// Allowed campaign transitions. Every transition is applied as a conditional update (compare-and-set)
// so concurrent requests (double clicks, two server instances) cannot race.
const TRANSITIONS = {
  launch: { from: [C.DRAFT], to: C.RUNNING },
  pause: { from: [C.RUNNING], to: C.PAUSED },
  resume: { from: [C.PAUSED], to: C.RUNNING },
  cancel: { from: [C.DRAFT, C.RUNNING, C.PAUSED], to: C.CANCELLED },
  complete: { from: [C.RUNNING], to: C.COMPLETED },
  fail: { from: [C.RUNNING, C.PAUSED], to: C.FAILED },
  autoPause: { from: [C.RUNNING], to: C.PAUSED },
};

const RANK = { [R.SENT]: 1, [R.DELIVERED]: 2, [R.READ]: 3 };

/**
 * Decides how a provider status webhook changes a recipient. Returns a patch or null (no-op).
 * Handles duplicates, out-of-order delivery (read before delivered) and late failures, and
 * never downgrades a status. Acceptance by the API is only ever recorded as "sent".
 */
function nextRecipientState(current, update) {
  const at = update.occurredAt instanceof Date ? update.occurredAt : new Date(update.occurredAt || Date.now());
  if (update.status === R.FAILED) {
    if (current.status !== R.SENT) return null;
    return {
      status: R.FAILED,
      failedAt: at,
      errorCode: update.errorCode ? String(update.errorCode) : 'DELIVERY_FAILED',
      errorMessage: update.errorMessage || 'Delivery failed',
    };
  }
  const incoming = RANK[update.status];
  const existing = RANK[current.status];
  if (!incoming || !existing || incoming <= existing) return null;
  const patch = { status: update.status };
  if (incoming >= RANK[R.SENT] && !current.sentAt) patch.sentAt = at;
  if (incoming >= RANK[R.DELIVERED] && !current.deliveredAt) patch.deliveredAt = at;
  if (incoming >= RANK[R.READ]) patch.readAt = at;
  return patch;
}

/** Token bucket for per-minute rate limiting. Clock is injectable for tests. */
class TokenBucket {
  constructor({ ratePerMinute, burst, now = Date.now }) {
    this.setRate(ratePerMinute, burst);
    this.now = now;
    this.tokens = this.capacity;
    this.updatedAt = this.now();
  }

  setRate(ratePerMinute, burst) {
    this.ratePerMs = ratePerMinute / 60000;
    this.capacity = Math.max(1, burst || Math.ceil(ratePerMinute / 6));
  }

  /** Takes up to `wanted` tokens and returns how many were granted. */
  take(wanted) {
    const now = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.updatedAt) * this.ratePerMs);
    this.updatedAt = now;
    const granted = Math.min(wanted, Math.floor(this.tokens));
    this.tokens -= granted;
    return granted;
  }
}

module.exports = { TRANSITIONS, nextRecipientState, TokenBucket };

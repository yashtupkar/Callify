/**
 * Classifies provider failures so the worker knows whether to retry, give up on the
 * recipient, pause the whole campaign, or treat the outcome as unknown.
 *
 *  retry      - provider definitely did not accept the message; safe to try again later
 *  fail       - permanent for this recipient
 *  pause      - problem affects every recipient (bad token, template disabled, disconnected)
 *  unknown    - the request may have reached the provider; never retried to avoid double sends
 */
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17, 80007, 130429, 131000, 131016, 131056, 133004]);
const PAUSE_META_CODES = new Set([100, 190, 368, 131031, 131042, 132001, 132007, 132015, 132016, 130497]);
const RATE_LIMIT_META_CODES = new Set([4, 17, 80007, 130429, 131056]);

function classifyError(error) {
  const meta = error?.metaError;
  const message = String(error?.message || 'Unknown error').slice(0, 500);

  if (meta?.code !== undefined) {
    const code = Number(meta.code);
    const base = { code: `META_${code}`, message };
    if (PAUSE_META_CODES.has(code)) return { ...base, action: 'pause' };
    if (RETRYABLE_META_CODES.has(code)) return { ...base, action: 'retry', rateLimited: RATE_LIMIT_META_CODES.has(code) };
    return { ...base, action: 'fail' };
  }

  if (/not connected|socket.*closed|connection closed|Connection Closed/i.test(message)) {
    return { code: 'CONNECTION_DOWN', message: 'WhatsApp connection is not connected', action: 'pause' };
  }
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return { code: 'NETWORK_UNREACHABLE', message, action: 'retry' };
  }
  if (/timeout|timed out|ECONNRESET|ECONNABORTED|socket hang up|EPIPE/i.test(message)) {
    return { code: 'UNKNOWN_OUTCOME', message: `${message} (outcome unknown; not retried to avoid duplicate messages)`, action: 'unknown' };
  }
  if (/rate.?limit|too many/i.test(message)) return { code: 'RATE_LIMITED', message, action: 'retry', rateLimited: true };
  return { code: 'SEND_FAILED', message, action: 'fail' };
}

/** Exponential backoff with +/-20% jitter. `attempt` is the number of attempts already made (>=1). */
function backoffMs(attempt, { baseMs = 30000, maxMs = 15 * 60 * 1000, random = Math.random } = {}) {
  const raw = Math.min(baseMs * 2 ** Math.max(0, attempt - 1), maxMs);
  return Math.round(raw * (0.8 + random() * 0.4));
}

module.exports = { classifyError, backoffMs };

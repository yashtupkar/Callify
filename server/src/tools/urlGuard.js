/**
 * Outbound URL safety for tenant-configured webhook tools (SSRF protection).
 * Only http(s) is allowed and every resolved address must be public. The vetted
 * address is pinned through a custom `lookup` so DNS rebinding cannot swap it.
 */
const dns = require('dns');
const net = require('net');

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }));

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const value = ipv4ToInt(address);
    return BLOCKED_V4.some(({ base, mask }) => ((value & mask) >>> 0) === ((base & mask) >>> 0));
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd')
      || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  return true;
}

function allowPrivate() {
  return process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS === 'true' && process.env.NODE_ENV !== 'production';
}

/** Resolves and validates the host. Returns the vetted `{ address, family }` list. */
async function resolveSafeHost(hostname, { resolver = dns.promises.lookup } = {}) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const records = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await resolver(host, { all: true });
  if (!records.length) throw new Error('Webhook host could not be resolved');
  if (!allowPrivate() && records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Webhook URL resolves to a private or reserved address');
  }
  return records;
}

function assertHttpUrl(parsedUrl) {
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Webhook URL must use http or https');
  if (parsedUrl.username || parsedUrl.password) throw new Error('Webhook URL must not contain credentials');
}

/** Builds a `lookup` function that only ever returns the pre-validated records. */
function pinnedLookup(records) {
  return (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const wantAll = typeof options === 'object' && options && options.all;
    if (wantAll) return cb(null, records);
    return cb(null, records[0].address, records[0].family);
  };
}

module.exports = { isPrivateAddress, resolveSafeHost, assertHttpUrl, pinnedLookup };

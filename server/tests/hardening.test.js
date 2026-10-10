const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');

const src = (rel) => path.join(__dirname, '..', 'src', rel);
const stub = (rel, exports) => {
  const resolved = require.resolve(src(rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

// Fake of the WhatsAppInboundMessage table with a real unique key and guarded updates
const rows = [];
let seq = 0;
const matches = (row, where) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('in' in v) return v.in.includes(row[k]);
    if ('gte' in v) return row[k] >= v.gte;
    if ('lt' in v) return row[k] < v.lt;
  }
  if (v instanceof Date) return row[k].getTime() === v.getTime();
  return row[k] === v;
});
const inboxTable = {
  create: async ({ data }) => {
    if (rows.some((r) => r.connectionId === data.connectionId && r.providerMessageId === data.providerMessageId)) {
      const e = new Error('Unique constraint'); e.code = 'P2002'; throw e;
    }
    rows.push({ id: `r${++seq}`, status: 'pending', attempts: 0, createdAt: new Date(), updatedAt: new Date(), ...data });
  },
  updateMany: async ({ where, data }) => {
    const hit = rows.filter((r) => matches(r, where));
    for (const r of hit) {
      for (const [k, v] of Object.entries(data)) r[k] = v && v.increment ? r[k] + v.increment : v;
      r.updatedAt = new Date(r.updatedAt.getTime() + 1);
    }
    return { count: hit.length };
  },
  findMany: async ({ where }) => rows.filter((r) => matches(r, where)),
  count: async ({ where }) => rows.filter((r) => matches(r, where)).length,
  deleteMany: async ({ where }) => ({ count: rows.filter((r) => matches(r, where)).length }),
};
stub('services/DatabaseService.js', { dbService: { prisma: { whatsAppInboundMessage: inboxTable } } });
const inbox = require('../src/whatsappAutomation/inbox');
const secretBox = require('../src/whatsappAutomation/secretBox');

test('inbox.claim dedups across "instances" (shared DB) and per connection', async () => {
  rows.length = 0;
  const m = { providerMessageId: 'wamid.1', from: 'u1', type: 'text', text: 'hi' };
  assert.equal(await inbox.claim('c1', m), true);
  assert.equal(await inbox.claim('c1', m), false);
  assert.equal(await inbox.claim('c2', m), true);
});

test('inbox.claim rethrows non-unique DB errors so the runtime can fail open', async () => {
  const orig = inboxTable.create;
  inboxTable.create = async () => { throw new Error('connection refused'); };
  await assert.rejects(inbox.claim('c1', { providerMessageId: 'x', from: 'u' }), /connection refused/);
  inboxTable.create = orig;
});

test('crash recovery replays stale pending rows once, never finished ones, and stops after max attempts', async () => {
  rows.length = 0;
  await inbox.claim('c1', { providerMessageId: 'p1', from: 'u1', text: 'a' });
  await inbox.claim('c1', { providerMessageId: 'p2', from: 'u2', text: 'b' });
  await inbox.markDone('c1', ['p2']);
  const future = Date.now() + inbox.STALE_MS + 1000;

  const seen = [];
  const replayed = await inbox.recoverPending(async ({ connectionId, messages }) => seen.push({ connectionId, ids: messages.map((x) => x.providerMessageId) }), { now: future });
  assert.equal(replayed, 1);
  assert.deepEqual(seen, [{ connectionId: 'c1', ids: ['p1'] }]);

  // two instances racing: the second one cannot take over the same row in the same pass
  rows.find((r) => r.providerMessageId === 'p1').attempts = 0;
  const [a, b] = await Promise.all([
    inbox.recoverPending(async () => {}, { now: future * 2 }),
    inbox.recoverPending(async () => {}, { now: future * 2 }),
  ]);
  assert.ok(a + b >= 1);

  // exhausted rows are parked as failed instead of replaying forever
  const row = rows.find((r) => r.providerMessageId === 'p1');
  row.attempts = inbox.MAX_ATTEMPTS; row.status = 'pending';
  await inbox.recoverPending(async () => assert.fail('must not replay'), { now: future * 4 });
  assert.equal(row.status, 'failed');
});

test('DB-backed rate limit counts recent claims per contact and connection', async () => {
  rows.length = 0;
  for (let i = 0; i < 5; i += 1) await inbox.claim('c1', { providerMessageId: `r${i}`, from: 'spam' });
  await inbox.claim('c1', { providerMessageId: 'other', from: 'ok' });
  await inbox.claim('c2', { providerMessageId: 'r0', from: 'spam' });
  assert.equal(await inbox.countRecent('c1', 'spam', 60000), 5);
  assert.equal(await inbox.countRecent('c1', 'ok', 60000), 1);
});

test('secrets are encrypted with AES-256-GCM, round-trip, and tampering is detected', () => {
  process.env.WHATSAPP_SECRETS_KEY = crypto.randomBytes(32).toString('hex');
  const enc = secretBox.encrypt('EAAG-super-secret-token');
  assert.ok(enc.startsWith('enc:v1:'));
  assert.ok(!enc.includes('super-secret'));
  assert.notEqual(secretBox.encrypt('same'), secretBox.encrypt('same'), 'random IV per value');
  assert.equal(secretBox.decrypt(enc), 'EAAG-super-secret-token');
  assert.equal(secretBox.decrypt('legacy-plaintext'), 'legacy-plaintext');
  const parts = enc.split(':'); parts[4] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => secretBox.decrypt(parts.join(':')));
  const row = secretBox.encryptConnectionSecrets({ apiToken: 'tok', appSecret: 'sec', verifyToken: 'v' });
  assert.ok(secretBox.isEncrypted(row.apiToken) && secretBox.isEncrypted(row.appSecret));
  assert.equal(row.verifyToken, 'v');
  assert.deepEqual(secretBox.decryptConnectionSecrets(row), { apiToken: 'tok', appSecret: 'sec', verifyToken: 'v' });
  delete process.env.WHATSAPP_SECRETS_KEY;
});

test('production refuses to store secrets without a key and rejects a malformed key', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.throws(() => secretBox.encrypt('tok'), /WHATSAPP_SECRETS_KEY/);
  process.env.NODE_ENV = prev;
  process.env.WHATSAPP_SECRETS_KEY = 'too-short';
  assert.throws(() => secretBox.encrypt('tok'), /32 bytes/);
  delete process.env.WHATSAPP_SECRETS_KEY;
});
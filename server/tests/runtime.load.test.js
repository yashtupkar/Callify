// Multi-connection / concurrency harness. Everything external is faked: no database,
// no LLM, no WhatsApp network calls, so no real customer can receive a message.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'src');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stub = (rel, exports) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

const sent = []; // { connectionId, to, text }
const active = new Map();
let peakPerContact = 0;
const concurrencyByContact = new Map();

const rows = { sessions: new Map(), connections: [] };
const prisma = {
  whatsAppAutoReplyRule: { findMany: async () => [] },
  whatsAppAutomationLog: { create: async () => ({}) },
  whatsAppAutomationSession: {
    findUnique: async ({ where }) => rows.sessions.get(JSON.stringify(where)) || null,
    upsert: async ({ where, create }) => { rows.sessions.set(JSON.stringify(where), { ...create, status: 'active', createdAt: new Date(), lastActivityAt: new Date() }); },
    updateMany: async () => ({ count: 1 }),
  },
  whatsAppConnection: {
    findMany: async ({ where }) => rows.connections.filter((c) => c.enabled && (!where.phoneNumberId || c.phoneNumberId === where.phoneNumberId) && (!where.id || c.id === where.id) && (!where.verifyToken || c.verifyToken === where.verifyToken) && (!where.businessId || c.businessId === where.businessId)),
    findFirst: async ({ where }) => rows.connections.find((c) => c.id === where.id && c.enabled) || null,
  },
};
stub('services/DatabaseService.js', { dbService: { prisma } });
stub('tools/ToolRegistry.js', {
  ToolRegistry: class {
    injectInternalCrmTools() {} remove() {} isBuiltIn() { return true; } injectDataCollectionTool() {}
    registerWebhook() {} registerCustom() {} getAllSchemas() { return []; }
  },
});
stub('whatsappAutomation/promptBuilder.js', { buildWhatsAppPrompt: () => 'prompt' });
stub('whatsappAutomation/channelAdapter.js', {
  WhatsAppAutomationChannelAdapter: class {
    constructor(opts) { Object.assign(this, opts); }
  },
});
stub('whatsappAutomation/conversationManager.js', {
  WhatsAppConversationManager: class {
    constructor(adapter) { this.adapter = adapter; this.transcript = []; this.toolExecutor = {}; this.isHandoff = false; this.isActive = true; }
    async start() {}
    async handleUserUtterance(text) {
      const key = `${this.adapter.instanceId}:${this.adapter.contactWaId}`;
      const now = (concurrencyByContact.get(key) || 0) + 1;
      concurrencyByContact.set(key, now);
      peakPerContact = Math.max(peakPerContact, now);
      this.transcript.push({ role: 'user', content: text });
      await sleep(15 + Math.floor(Math.random() * 10));
      sent.push({ connectionId: this.adapter.instanceId, to: this.adapter.contactWaId, text: `echo:${text}` });
      concurrencyByContact.set(key, now - 1);
    }
  },
});

const { handleMessages } = require('../src/whatsappAutomation/runtime');

const automation = (id) => ({ id, name: id, tools: [], workspaceId: `ws-${id}` });
const fakeProvider = () => ({ verifyInbound: () => true });
const msg = (from, text, id) => ({ from, text, type: 'text', providerMessageId: id });

test('N connections x M contacts: every message handled once, no cross-connection leakage, concurrent speed-up', async () => {
  const CONNECTIONS = 5; const CONTACTS = 20; const PER_CONTACT = 3;
  const jobs = [];
  const start = Date.now();
  for (let c = 0; c < CONNECTIONS; c += 1) {
    const connection = { id: `conn-${c}`, provider: 'cloud_api', phoneNumber: `+1000${c}` };
    const messages = [];
    for (let u = 0; u < CONTACTS; u += 1) {
      for (let m = 0; m < PER_CONTACT; m += 1) messages.push(msg(`c${c}-user${u}`, `m${m}`, `wamid-${c}-${u}-${m}`));
    }
    jobs.push(handleMessages({ automation: automation(`auto-${c}`), connection, provider: fakeProvider(), messages }));
  }
  await Promise.all(jobs);
  const elapsed = Date.now() - start;

  const expected = CONNECTIONS * CONTACTS * PER_CONTACT;
  assert.equal(sent.length, expected, 'each inbound message produced exactly one reply');
  for (const reply of sent) {
    assert.ok(reply.to.startsWith(`${reply.connectionId.replace('conn-', 'c')}-`), `reply ${reply.to} leaked to ${reply.connectionId}`);
  }
  // per-contact ordering preserved
  const byContact = new Map();
  for (const r of sent) byContact.set(`${r.connectionId}:${r.to}`, [...(byContact.get(`${r.connectionId}:${r.to}`) || []), r.text]);
  for (const texts of byContact.values()) assert.deepEqual(texts, ['echo:m0', 'echo:m1', 'echo:m2']);
  assert.equal(peakPerContact, 1, 'a single contact is never processed concurrently');
  const serialMs = expected * 15;
  assert.ok(elapsed < serialMs / 3, `elapsed ${elapsed}ms should be far below serial ${serialMs}ms`);
  console.log(`LOAD RESULT: ${expected} messages, ${CONNECTIONS} connections, ${CONNECTIONS * CONTACTS} contacts in ${elapsed}ms (serial lower bound ${serialMs}ms)`);
});

test('duplicate webhook deliveries (Meta retries) are processed once', async () => {
  sent.length = 0;
  const connection = { id: 'conn-dup', provider: 'cloud_api', phoneNumber: '+1999' };
  const args = { automation: automation('auto-dup'), connection, provider: fakeProvider(), messages: [msg('dup-user', 'hello', 'wamid-same')] };
  await Promise.all([handleMessages(args), handleMessages(args), handleMessages(args)]);
  await handleMessages(args);
  assert.equal(sent.length, 1);
});

test('same wamid on two different connections is NOT treated as a duplicate', async () => {
  sent.length = 0;
  for (const id of ['conn-x', 'conn-y']) {
    await handleMessages({ automation: automation(`auto-${id}`), connection: { id, provider: 'cloud_api', phoneNumber: id }, provider: fakeProvider(), messages: [msg('u', 'hi', 'wamid-shared')] });
  }
  assert.equal(sent.length, 2);
});

test('same contact messaging the same business concurrently is serialised (no transcript race)', async () => {
  sent.length = 0; peakPerContact = 0;
  const connection = { id: 'conn-race', provider: 'cloud_api', phoneNumber: '+1' };
  await Promise.all(Array.from({ length: 10 }, (_, i) => handleMessages({
    automation: automation('auto-race'), connection, provider: fakeProvider(), messages: [msg('racer', `r${i}`, `wamid-race-${i}`)],
  })));
  assert.equal(sent.length, 10);
  assert.equal(peakPerContact, 1);
});

test('per-contact inbound flood is rate limited', async () => {
  sent.length = 0;
  const connection = { id: 'conn-flood', provider: 'cloud_api', phoneNumber: '+2' };
  for (let i = 0; i < 40; i += 1) {
    await handleMessages({ automation: automation('auto-flood'), connection, provider: fakeProvider(), messages: [msg('spammer', `s${i}`, `wamid-flood-${i}`)] });
  }
  assert.ok(sent.length <= 30, `expected <=30 replies, got ${sent.length}`);
  assert.ok(sent.length >= 29);
});

test('one failing contact does not block others', async () => {
  sent.length = 0;
  const connection = { id: 'conn-iso', provider: 'cloud_api', phoneNumber: '+3' };
  const original = prisma.whatsAppAutomationSession.upsert;
  prisma.whatsAppAutomationSession.upsert = async (args) => {
    if (args.create.contactWaId === 'bad-user') throw new Error('db down for one row');
    return original(args);
  };
  await handleMessages({ automation: automation('auto-iso'), connection, provider: fakeProvider(), messages: [msg('bad-user', 'x', 'w-bad'), msg('good-user', 'y', 'w-good')] });
  prisma.whatsAppAutomationSession.upsert = original;
  assert.deepEqual(sent.map((s) => s.to), ['good-user']);
});

// ---------- Inbound router ----------
const { WhatsAppAutomationInboundRouter } = require('../src/whatsappAutomation/inboundRouter');
const factory = require('../src/whatsappAutomation/factory');
const { CloudApiProvider } = require('../src/integrations/whatsapp/CloudApiProvider');

const res = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = b; r.headersSent = true; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
};

test('router: GET verification needs a matching token; unknown tokens get 403', async () => {
  rows.connections = [{ id: 'conn-v', enabled: true, verifyToken: 'tok-123', phoneNumberId: 'pn-v' }];
  const ok = res();
  await WhatsAppAutomationInboundRouter.handle({ method: 'GET', params: {}, query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok-123', 'hub.challenge': 'abc' } }, ok);
  assert.equal(ok.code, 200); assert.equal(ok.body, 'abc');
  const bad = res();
  await WhatsAppAutomationInboundRouter.handle({ method: 'GET', params: {}, query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'abc' } }, bad);
  assert.equal(bad.code, 403);
});

test('router: bad signature is rejected, valid signature accepted, and each tenant only gets its own entry', async () => {
  const { CloudApiProvider: Real } = require('../src/integrations/whatsapp/CloudApiProvider');
  assert.ok(Real);
  rows.connections = [
    { id: 'tenantA', enabled: true, provider: 'cloud_api', phoneNumberId: 'pnA', phoneNumber: '+1', appSecret: 'secretA', apiToken: 't', automation: { id: 'autoA', tools: [] } },
    { id: 'tenantB', enabled: true, provider: 'cloud_api', phoneNumberId: 'pnB', phoneNumber: '+2', appSecret: 'secretB', apiToken: 't', automation: { id: 'autoB', tools: [] } },
  ];
  sent.length = 0;
  const body = {
    object: 'whatsapp_business_account',
    entry: ['A', 'B'].map((t) => ({ id: `waba${t}`, changes: [{ field: 'messages', value: { metadata: { phone_number_id: `pn${t}` }, contacts: [{ wa_id: `user${t}`, profile: { name: t } }], messages: [{ id: `wamid.${t}`, from: `user${t}`, type: 'text', text: { body: `hello ${t}` } }] } }] })),
  };
  const raw = JSON.stringify(body);
  const sig = (secret) => 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

  const forged = res();
  await WhatsAppAutomationInboundRouter.handle({ method: 'POST', params: {}, query: {}, body, rawBody: raw, headers: { 'x-hub-signature-256': sig('wrong') } }, forged);
  assert.equal(forged.code, 401);
  assert.equal(sent.length, 0);

  const good = res();
  await WhatsAppAutomationInboundRouter.handle({ method: 'POST', params: {}, query: {}, body, rawBody: raw, headers: { 'x-hub-signature-256': sig('secretA') } }, good);
  assert.equal(good.code, 200);
  assert.deepEqual(sent.map((s) => `${s.connectionId}:${s.to}`), ['tenantA:userA'], 'only tenant A traffic, signed with A secret');
});

test('Cloud API provider fails closed without app secret in production', () => {
  const prev = process.env.NODE_ENV;
  const provider = new CloudApiProvider({ phoneNumberId: 'p', apiToken: 't' });
  process.env.NODE_ENV = 'production';
  assert.equal(provider.verifyInbound({ headers: {}, rawBody: '{}' }), false);
  process.env.NODE_ENV = 'development';
  assert.equal(provider.verifyInbound({ headers: {}, rawBody: '{}' }), true);
  process.env.NODE_ENV = prev;
});

test('Cloud API retries only on 429/5xx and never on timeouts', async () => {
  const provider = new CloudApiProvider({ phoneNumberId: 'p', apiToken: 't' });
  let calls = 0;
  const out = await provider._withRetry(async () => { calls += 1; if (calls < 3) { const e = new Error('x'); e.response = { status: 503 }; throw e; } return 'ok'; }, { baseDelayMs: 1 });
  assert.equal(out, 'ok'); assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(provider._withRetry(async () => { calls += 1; const e = new Error('timeout'); e.code = 'ECONNABORTED'; throw e; }, { baseDelayMs: 1 }));
  assert.equal(calls, 1);
});

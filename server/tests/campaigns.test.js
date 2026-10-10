const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { normalizePhone } = require('../src/campaigns/phone');
const { parseRecipients } = require('../src/campaigns/recipients');
const T = require('../src/campaigns/templates');
const { classifyError, backoffMs } = require('../src/campaigns/errors');
const { nextRecipientState, TokenBucket } = require('../src/campaigns/state');
const { createMemoryRepo } = require('../src/campaigns/memoryRepo');
const { createService } = require('../src/campaigns/service');
const { createWorker } = require('../src/campaigns/worker');
const { createCampaignsRouter } = require('../src/campaigns/routes');
const { detectKeyword, handleInboundOptOut, applyStatusUpdates } = require('../src/campaigns/hooks');

const silent = { log() {}, warn() {}, error() {} };

// ---------- phone / recipients ----------
test('normalizePhone handles formats, spreadsheet artefacts and rejects ambiguity', () => {
  assert.deepEqual(normalizePhone('+91 98765-43210'), { ok: true, phone: '919876543210' });
  assert.deepEqual(normalizePhone('0091 9876543210'), { ok: true, phone: '919876543210' });
  assert.deepEqual(normalizePhone('9876543210', { defaultCountryCode: '91' }), { ok: true, phone: '919876543210' });
  assert.deepEqual(normalizePhone('919876543210', { defaultCountryCode: '91' }), { ok: true, phone: '919876543210' });
  assert.deepEqual(normalizePhone('9.19876543210E+11'), { ok: false, reason: 'missing_country_code' });
  assert.deepEqual(normalizePhone('9.19876543210E+11', { defaultCountryCode: '91' }), { ok: true, phone: '919876543210' });
  assert.deepEqual(normalizePhone('919876543210.0', { defaultCountryCode: '91' }), { ok: true, phone: '919876543210' });
  assert.equal(normalizePhone('9876543210').reason, 'missing_country_code');
  assert.equal(normalizePhone('abc').reason, 'invalid_characters');
  assert.equal(normalizePhone('+12').reason, 'too_short');
  assert.equal(normalizePhone('+1234567890123456').reason, 'too_long');
  assert.equal(normalizePhone('').reason, 'empty');
});

test('parseRecipients de-duplicates, validates, honours consent and blocks prototype keys', () => {
  const result = parseRecipients({
    file: {
      columns: ['Phone', 'Name', 'Opt-in', '__proto__'],
      rows: [
        { Phone: '9876543210', Name: 'A', 'Opt-in': 'yes' },
        { Phone: '+91 98765 43210', Name: 'A dup' },
        { Phone: '12', Name: 'bad' },
        { Phone: '9876500000', Name: 'B', 'Opt-in': 'no' },
        { Phone: '', Name: '' },
      ],
    },
    manualNumbers: '+14155550101\n919876543210',
    defaultCountryCode: '91',
  });
  assert.equal(result.valid.length, 2);
  assert.equal(result.duplicates, 2);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.noConsent.length, 1);
  assert.ok(!result.columns.includes('__proto__'));
});

test('parseRecipients errors', () => {
  assert.throws(() => parseRecipients({ file: { columns: ['x'], rows: [{ x: 1 }] } }), { code: 'NO_PHONE_COLUMN' });
  assert.throws(() => parseRecipients({}), { code: 'NO_RECIPIENTS' });
  assert.throws(() => parseRecipients({ manualNumbers: '+14155550101,+14155550102', maxRecipients: 1 }), { code: 'TOO_MANY_RECIPIENTS' });
});

// ---------- templates ----------
const metaTemplate = (extra = {}) => T.normalizeMetaTemplate({
  name: 'promo', language: 'en', status: 'APPROVED', category: 'MARKETING',
  components: [
    { type: 'BODY', text: 'Hi {{1}}, use code {{2}}' },
    { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Open', url: 'https://x.com/{{1}}' }] },
  ],
  ...extra,
});

test('template normalisation flags unsupported templates', () => {
  assert.equal(metaTemplate().supported, true);
  assert.equal(metaTemplate({ category: 'AUTHENTICATION' }).supported, false);
  const carousel = T.normalizeMetaTemplate({ name: 'c', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'CAROUSEL', cards: [] }] });
  assert.equal(carousel.supported, false);
});

test('template components, preview, sanitising and missing variables', () => {
  const tpl = metaTemplate();
  const config = { variableMap: { body: { 1: { source: 'name', fallback: 'there' }, 2: { source: 'column', value: 'code' } }, buttons: { 0: { source: 'static', value: 'sale' } } } };
  const comps = T.buildTemplateComponents(tpl, config, { phone: '1', name: 'Ann\nLee', variables: { code: 'A\tB' } });
  assert.deepEqual(comps[0], { type: 'body', parameters: [{ type: 'text', text: 'Ann Lee' }, { type: 'text', text: 'A B' }] });
  assert.equal(comps[1].sub_type, 'url');
  assert.equal(T.buildTemplateComponents(tpl, config, { name: null, variables: { code: 'Z' } })[0].parameters[0].text, 'there');
  assert.throws(() => T.buildTemplateComponents(tpl, config, { name: 'x', variables: {} }), T.MissingVariableError);
  assert.equal(T.renderTemplatePreview(tpl, config, { name: 'Ann', variables: { code: 'Z' } }).body, 'Hi Ann, use code Z');
});

test('template config validation', () => {
  const tpl = metaTemplate({ status: 'PENDING' });
  const problems = T.validateTemplateConfig(tpl, { variableMap: {} }, { columns: [] });
  assert.ok(problems.some((p) => /only APPROVED/.test(p)));
  assert.ok(problems.some((p) => /not configured/.test(p)));
  const ok = T.validateTemplateConfig(metaTemplate(), { variableMap: { body: { 1: { source: 'name' }, 2: { source: 'static', value: 'x' } }, buttons: { 0: { source: 'static', value: 'a' } } } });
  assert.deepEqual(ok, []);
});

// ---------- errors / state ----------
test('error classification', () => {
  assert.equal(classifyError({ metaError: { code: 131056 } }).action, 'retry');
  assert.equal(classifyError({ metaError: { code: 190 } }).action, 'pause');
  assert.equal(classifyError({ metaError: { code: 131026 } }).action, 'fail');
  assert.equal(classifyError(new Error('timeout of 30000ms exceeded')).action, 'unknown');
  assert.equal(classifyError(new Error('Baileys socket not connected')).action, 'pause');
  assert.ok(backoffMs(1, { random: () => 0.5 }) === 30000);
  assert.ok(backoffMs(20, { random: () => 0.5 }) === 15 * 60 * 1000);
});

test('status transitions are monotonic and idempotent', () => {
  const sent = { status: 'sent', sentAt: new Date() };
  assert.equal(nextRecipientState(sent, { status: 'sent' }), null);
  assert.equal(nextRecipientState({ ...sent, status: 'read' }, { status: 'delivered' }), null);
  const read = nextRecipientState(sent, { status: 'read' });
  assert.equal(read.status, 'read');
  assert.ok(read.deliveredAt && read.readAt);
  assert.equal(nextRecipientState({ status: 'queued' }, { status: 'delivered' }), null);
  assert.equal(nextRecipientState({ status: 'delivered' }, { status: 'failed' }), null);
  assert.equal(nextRecipientState(sent, { status: 'failed', errorCode: 'META_131026' }).errorCode, 'META_131026');
});

test('token bucket enforces rate', () => {
  let t = 0;
  const b = new TokenBucket({ ratePerMinute: 60, burst: 2, now: () => t });
  assert.equal(b.take(5), 2);
  assert.equal(b.take(1), 0);
  t += 1000;
  assert.equal(b.take(5), 1);
});

// ---------- service + worker ----------
const WS_A = 'ws-a';
const WS_B = 'ws-b';

function setup({ provider, templates, connStatus = 'connected', start = new Date('2026-01-01T00:00:00Z') } = {}) {
  let current = start.getTime();
  const now = () => new Date(current);
  const repo = createMemoryRepo({ now });
  const sends = [];
  const cloud = provider || {
    async listTemplates() { return templates || [{ name: 'promo', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hi {{1}}' }] }]; },
    async sendTemplate(to, name, lang, components) { sends.push({ to, name, lang, components }); return { messages: [{ id: `wamid.${to}` }] }; },
  };
  repo.addConnection({ id: 'conn-a', provider: 'cloud_api', phoneNumber: '1', enabled: true, automation: { id: 'auto-a', name: 'A', workspaceId: WS_A } });
  repo.addConnection({ id: 'conn-b', provider: 'cloud_api', phoneNumber: '2', enabled: true, automation: { id: 'auto-b', name: 'B', workspaceId: WS_B } });
  const bailey = { connectionStatus: connStatus, async sendText(to, text) { sends.push({ to, text }); return `bail.${to}`; } };
  repo.addConnection({ id: 'conn-bail', provider: 'baileys', phoneNumber: '3', enabled: true, automation: { id: 'auto-a', name: 'A', workspaceId: WS_A } });
  const createProvider = (c) => (c.provider === 'baileys' ? bailey : cloud);
  const service = createService({ repo, createProvider, now });
  const worker = createWorker({ repo, createProvider, now, workerId: 'w1', logger: silent, random: () => 0.5 });
  return { repo, service, worker, sends, advance: (ms) => { current += ms; }, now, cloud, bailey };
}

const baseInput = (over = {}) => ({
  name: 'Promo', connectionId: 'conn-a',
  recipients: { manualNumbers: '+14155550101\n+14155550102\n+14155550103', defaultCountryCode: '1' },
  templateName: 'promo', templateLanguage: 'en',
  variableMap: { body: { 1: { source: 'static', value: 'friend' } } },
  optIn: { confirmed: true, source: 'Website signup form' },
  ratePerMinute: 600, concurrency: 5,
  ...over,
});
const user = { id: 'u1' };

test('creation requires opt-in attestation and approved template', async () => {
  const { service } = setup();
  await assert.rejects(service.createCampaign(WS_A, user, baseInput({ optIn: { confirmed: false } })), { code: 'OPT_IN_REQUIRED' });
  await assert.rejects(service.createCampaign(WS_A, user, baseInput({ templateName: 'nope' })), { code: 'TEMPLATE_NOT_FOUND' });
  const pending = setup({ templates: [{ name: 'promo', language: 'en', status: 'PENDING', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hi' }] }] });
  await assert.rejects(pending.service.createCampaign(WS_A, user, baseInput()), { code: 'INVALID_TEMPLATE_CONFIG' });
});

test('full flow: create, launch (count confirm), send, webhook status, completion', async () => {
  const { service, worker, sends, repo } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput());
  await assert.rejects(service.launch(WS_A, campaign.id, { confirmRecipientCount: 2 }), { code: 'COUNT_MISMATCH' });
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 });
  await assert.rejects(service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 }), { code: 'INVALID_STATE' });
  await worker.tick();
  assert.equal(sends.length, 3);
  let status = await service.getStatus(WS_A, campaign.id);
  assert.equal(status.status, 'completed');
  assert.equal(status.counts.sent, 3);
  assert.equal(status.counts.delivered, 0);

  const conn = { id: 'conn-a' };
  await applyStatusUpdates({ repo, connection: conn, updates: [
    { providerMessageId: 'wamid.14155550101', status: 'read', timestamp: 1 },
    { providerMessageId: 'wamid.14155550101', status: 'delivered', timestamp: 2 },
    { providerMessageId: 'wamid.14155550102', status: 'failed', timestamp: 3, errors: [{ code: 131026, title: 'Undeliverable' }] },
  ] });
  status = await service.getStatus(WS_A, campaign.id);
  assert.equal(status.counts.read, 1);
  assert.equal(status.counts.failed, 1);
  const report = await service.report(WS_A, campaign.id);
  assert.equal(report.failureReasons.META_131026, 1);
  assert.match(await service.reportCsv(WS_A, campaign.id), /META_131026/);
});

test('webhook from another connection cannot modify a campaign recipient', async () => {
  const { service, worker, repo } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput());
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 });
  await worker.tick();
  await applyStatusUpdates({ repo, connection: { id: 'conn-b' }, updates: [{ providerMessageId: 'wamid.14155550101', status: 'read' }] });
  assert.equal((await service.getStatus(WS_A, campaign.id)).counts.read, 0);
});

test('webhook arriving before sent is stored and applied afterwards', async () => {
  const { service, worker, repo, cloud } = setup();
  const original = cloud.sendTemplate;
  cloud.sendTemplate = async (to, ...rest) => {
    const res = await original(to, ...rest);
    await repo.applyStatus('conn-a', { providerMessageId: `wamid.${to}`, status: 'delivered' });
    return res;
  };
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ recipients: { manualNumbers: '+14155550101' } }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 1 });
  await worker.tick();
  assert.equal((await service.getStatus(WS_A, campaign.id)).counts.delivered, 1);
});

test('opted-out, invalid, missing-variable and no-consent recipients are never sent', async () => {
  const { service, worker, sends, repo } = setup();
  await repo.addOptOut(WS_A, '14155550101', 'manual');
  const { campaign, summary } = await service.createCampaign(WS_A, user, baseInput({
    recipients: { manualNumbers: '+14155550101\n+14155550102\nnot-a-number', defaultCountryCode: '1' },
  }));
  assert.equal(summary.optedOut, 1);
  assert.equal(summary.invalid, 1);
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 1 });
  await worker.tick();
  assert.deepEqual(sends.map((s) => s.to), ['14155550102']);
  const status = await service.getStatus(WS_A, campaign.id);
  assert.equal(status.counts.skipped, 2);
});

test('opt-out arriving after launch is honoured before sending', async () => {
  const { service, worker, sends, repo } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput());
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 });
  assert.equal(await handleInboundOptOut({ repo, workspaceId: WS_A, from: '14155550102', text: ' STOP! ', logger: silent }), 'opted_out');
  await worker.tick();
  assert.equal(sends.length, 2);
  assert.ok(!sends.some((s) => s.to === '14155550102'));
  assert.equal(await handleInboundOptOut({ repo, workspaceId: WS_A, from: '14155550102', text: 'start', logger: silent }), 'opted_in');
  assert.equal(await handleInboundOptOut({ repo, workspaceId: WS_A, from: '1', text: "don't stop", logger: silent }), null);
  assert.equal(detectKeyword('Unsubscribe'), 'opt_out');
});

test('opt-out is scoped to the workspace', async () => {
  const { repo } = setup();
  await repo.addOptOut(WS_A, '14155550101', 'manual');
  assert.equal(await repo.isOptedOut(WS_B, '14155550101'), false);
});

test('rate limit and concurrency cap each tick; pause, resume and cancel work', async () => {
  const { service, worker, sends, advance } = setup();
  const numbers = Array.from({ length: 10 }, (_, i) => `+1415555${String(1000 + i)}`).join('\n');
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ recipients: { manualNumbers: numbers }, ratePerMinute: 60, concurrency: 2 }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 10 });
  await worker.tick();
  assert.equal(sends.length, 2); // burst capped by concurrency
  await worker.tick();
  assert.equal(sends.length, 2); // no tokens yet
  advance(2000);
  await service.pause(WS_A, campaign.id);
  await worker.tick();
  assert.equal(sends.length, 2); // paused: nothing sent
  await service.resume(WS_A, campaign.id);
  await worker.tick();
  assert.equal(sends.length, 4);
  await service.cancel(WS_A, campaign.id);
  advance(60000);
  await worker.tick();
  assert.equal(sends.length, 4);
  const status = await service.getStatus(WS_A, campaign.id);
  assert.equal(status.status, 'cancelled');
  assert.equal(status.counts.skipped, 6);
  assert.equal(status.counts.sent, 4);
});

test('retryable failures back off then succeed; attempts are capped', async () => {
  let calls = 0;
  const { service, worker, advance, repo } = setup({
    provider: {
      async listTemplates() { return [{ name: 'promo', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hi {{1}}' }] }]; },
      async sendTemplate(to) {
        calls += 1;
        if (calls < 3) { const e = new Error('rate'); e.metaError = { code: 130429 }; throw e; }
        return { messages: [{ id: 'm1' }] };
      },
    },
  });
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ recipients: { manualNumbers: '+14155550101' } }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 1 });
  await worker.tick();
  assert.equal(calls, 1);
  assert.equal((await service.getStatus(WS_A, campaign.id)).counts.queued, 1);
  await worker.tick(); // still backing off / cooling down
  assert.equal(calls, 1);
  advance(10 * 60 * 1000);
  await worker.tick();
  assert.equal(calls, 2);
  advance(10 * 60 * 1000);
  await worker.tick();
  assert.equal(calls, 3);
  assert.equal((await service.getStatus(WS_A, campaign.id)).counts.sent, 1);
  assert.ok(repo);
});

test('retries stop at maxAttempts and record the failure', async () => {
  const { service, worker, advance } = setup({
    provider: {
      async listTemplates() { return [{ name: 'promo', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hi {{1}}' }] }]; },
      async sendTemplate() { const e = new Error('x'); e.metaError = { code: 131000 }; throw e; },
    },
  });
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ recipients: { manualNumbers: '+14155550101' }, maxAttempts: 2 }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 1 });
  for (let i = 0; i < 4; i += 1) { await worker.tick(); advance(20 * 60 * 1000); }
  const status = await service.getStatus(WS_A, campaign.id);
  assert.equal(status.counts.failed, 1);
  assert.equal(status.status, 'completed');
});

test('auth-style provider error pauses the campaign without losing the recipient', async () => {
  const { service, worker } = setup({
    provider: {
      async listTemplates() { return [{ name: 'promo', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hi {{1}}' }] }]; },
      async sendTemplate() { const e = new Error('token'); e.metaError = { code: 190 }; throw e; },
    },
  });
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ recipients: { manualNumbers: '+14155550101' } }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 1 });
  await worker.tick();
  const status = await service.getStatus(WS_A, campaign.id);
  assert.equal(status.status, 'paused');
  assert.equal(status.counts.queued, 1);
  assert.match(status.statusNote, /Paused automatically/);
});

test('timeouts are marked UNKNOWN_OUTCOME and never retried', async () => {
  let calls = 0;
  const { service, worker, advance, repo } = setup({
    provider: {
      async listTemplates() { return [{ name: 'promo', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hi {{1}}' }] }]; },
      async sendTemplate() { calls += 1; throw new Error('timeout of 30000ms exceeded'); },
    },
  });
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ recipients: { manualNumbers: '+14155550101' } }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 1 });
  await worker.tick();
  advance(3600000);
  await worker.tick();
  assert.equal(calls, 1);
  const { items } = await repo.listRecipients(campaign.id, { status: 'failed' });
  assert.equal(items[0].errorCode, 'UNKNOWN_OUTCOME');
});

test('crash after sendStartedAt is recovered as UNKNOWN_OUTCOME (no double send); unsent leases are reclaimed', async () => {
  const { service, worker, advance, repo, sends } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ recipients: { manualNumbers: '+14155550101\n+14155550102' } }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 2 });
  const claimed = await repo.claimRecipients(campaign.id, { limit: 2, workerId: 'dead', leaseMs: 1000, now: new Date('2026-01-01T00:00:00Z') });
  await repo.markSending(claimed[0].id, 'dead', new Date('2026-01-01T00:00:00Z')); // crashed mid-send
  advance(60000);
  await worker.tick();
  const status = await service.getStatus(WS_A, campaign.id);
  assert.equal(status.counts.failed, 1);
  assert.equal(status.counts.sent, 1);
  assert.equal(sends.length, 1);
});

test('two workers cannot claim the same recipient', async () => {
  const { service, repo } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput());
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 });
  const a = await repo.claimRecipients(campaign.id, { limit: 10, workerId: 'a', leaseMs: 60000 });
  const b = await repo.claimRecipients(campaign.id, { limit: 10, workerId: 'b', leaseMs: 60000 });
  assert.equal(a.length, 3);
  assert.equal(b.length, 0);
  assert.equal(await repo.markSent(a[0].id, 'b', 'x'), false);
});

test('idempotency key prevents duplicate campaigns', async () => {
  const { service } = setup();
  const first = await service.createCampaign(WS_A, user, baseInput({ idempotencyKey: 'k1' }));
  const second = await service.createCampaign(WS_A, user, baseInput({ idempotencyKey: 'k1' }));
  assert.equal(second.existing, true);
  assert.equal(first.campaign.id, second.campaign.id);
});

test('workspace isolation: other tenants cannot see or control campaigns, connections or templates', async () => {
  const { service } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput());
  await assert.rejects(service.getStatus(WS_B, campaign.id), { code: 'CAMPAIGN_NOT_FOUND' });
  await assert.rejects(service.launch(WS_B, campaign.id, { confirmRecipientCount: 3 }), { code: 'CAMPAIGN_NOT_FOUND' });
  await assert.rejects(service.cancel(WS_B, campaign.id), { code: 'CAMPAIGN_NOT_FOUND' });
  await assert.rejects(service.report(WS_B, campaign.id), { code: 'CAMPAIGN_NOT_FOUND' });
  await assert.rejects(service.listRecipients(WS_B, campaign.id), { code: 'CAMPAIGN_NOT_FOUND' });
  await assert.rejects(service.createCampaign(WS_B, user, baseInput()), { code: 'CONNECTION_NOT_FOUND' });
  await assert.rejects(service.listTemplates(WS_B, 'conn-a'), { code: 'CONNECTION_NOT_FOUND' });
  assert.equal((await service.listCampaigns(WS_B)).total, 0);
  assert.deepEqual((await service.listConnections(WS_B)).map((c) => c.id), ['conn-b']);
});

test('worker pauses a campaign whose connection belongs to another workspace', async () => {
  const { service, worker, repo } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput());
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 });
  repo._state.campaigns.get(campaign.id).connectionId = 'conn-b';
  await worker.tick();
  assert.equal((await service.getStatus(WS_A, campaign.id)).status, 'paused');
});

test('daily limit stops sending without failing the campaign', async () => {
  const { service, worker, sends } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({ dailyLimit: 2 }));
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 });
  await worker.tick();
  await worker.tick();
  assert.equal(sends.length, 2);
  assert.equal((await service.getStatus(WS_A, campaign.id)).status, 'running');
});

test('baileys: text only, risk acknowledgement, hard limits, waits when disconnected', async () => {
  const { service, worker, sends, bailey } = setup({ connStatus: 'disconnected' });
  const input = baseInput({
    connectionId: 'conn-bail', templateName: undefined, templateLanguage: undefined,
    messageText: 'Hello {{1}}', variableMap: { body: { 1: { source: 'static', value: 'there' } } },
    concurrency: 9, ratePerMinute: 999,
  });
  await assert.rejects(service.createCampaign(WS_A, user, input), { code: 'UNOFFICIAL_RISK_NOT_ACCEPTED' });
  const { campaign } = await service.createCampaign(WS_A, user, { ...input, acceptUnofficialRisk: true });
  assert.equal(campaign.concurrency, 1);
  assert.equal(campaign.ratePerMinute, 20);
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3, acceptUnofficialRisk: true });
  await worker.tick();
  assert.equal(sends.length, 0);
  bailey.connectionStatus = 'connected';
  await worker.tick();
  assert.equal(sends.length, 1);
  assert.equal(sends[0].text, 'Hello there');
  assert.equal((await service.getStatus(WS_A, campaign.id)).tracksDelivery, false);
});

test('preview endpoints', async () => {
  const { service } = setup();
  const prev = await service.previewRecipients(WS_A, { connectionId: 'conn-a', manualNumbers: '+14155550101,+14155550101,zzz' });
  assert.equal(prev.validCount, 1);
  assert.equal(prev.duplicateCount, 1);
  assert.equal(prev.invalidCount, 1);
  const msg = await service.previewMessage(WS_A, { connectionId: 'conn-a', templateName: 'promo', templateLanguage: 'en', variableMap: { body: { 1: { source: 'name', fallback: 'friend' } } } });
  assert.equal(msg.preview.body, 'Hi friend');
});

test('csv report neutralises formula injection', async () => {
  const { service, repo } = setup();
  const { campaign } = await service.createCampaign(WS_A, user, baseInput({
    recipients: { file: { columns: ['phone', 'name'], rows: [{ phone: '+14155550101', name: '=HYPERLINK("x")' }] } },
    variableMap: { body: { 1: { source: 'name' } } },
  }));
  const csv = await service.reportCsv(WS_A, campaign.id);
  assert.match(csv, /'=HYPERLINK/);
  assert.ok(repo);
});

// ---------- HTTP routes ----------
test('HTTP routes enforce auth and workspace isolation', async () => {
  const { service } = setup();
  const app = express();
  const authenticate = (req, res, next) => {
    const id = req.headers['x-user'];
    if (!id) return res.status(401).json({ error: 'Not authenticated' });
    req.user = { id, workspaceId: id === 'a' ? WS_A : WS_B };
    next();
  };
  app.use('/api/campaigns', createCampaignsRouter({ service, authenticate, resolveWorkspaceId: async (u) => u.workspaceId }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/campaigns`;
  const call = (path, { user: u, method = 'GET', body } = {}) => fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(u ? { 'x-user': u } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    assert.equal((await call('/')).status, 401);
    const created = await call('/', { user: 'a', method: 'POST', body: baseInput() });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.equal((await call(`/${id}`, { user: 'a' })).status, 200);
    assert.equal((await call(`/${id}`, { user: 'b' })).status, 404);
    assert.equal((await call(`/${id}/cancel`, { user: 'b', method: 'POST' })).status, 404);
    assert.equal((await call(`/${id}/launch`, { user: 'a', method: 'POST', body: { confirmRecipientCount: 1 } })).status, 409);
    const bad = await call('/', { user: 'a', method: 'POST', body: baseInput({ optIn: {} }) });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, 'OPT_IN_REQUIRED');
    const csv = await call(`/${id}/report?format=csv`, { user: 'a' });
    assert.match(csv.headers.get('content-type'), /text\/csv/);
  } finally {
    server.close();
  }
});

test('editing: draft message/settings editable, recipients untouched, launched message locked, isolated', async () => {
  const { service, worker, sends } = setup({ templates: [
    { name: 'promo', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hi {{1}}' }] },
    { name: 'promo2', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hello {{1}}' }] },
    { name: 'pend', language: 'en', status: 'PENDING', category: 'MARKETING', components: [{ type: 'BODY', text: 'Yo {{1}}' }] },
  ] });
  const { campaign } = await service.createCampaign(WS_A, user, baseInput());
  await assert.rejects(service.updateCampaign(WS_B, campaign.id, { name: 'x' }), { code: 'CAMPAIGN_NOT_FOUND' });
  await assert.rejects(service.updateCampaign(WS_A, campaign.id, { name: '  ' }), { code: 'INVALID_NAME' });
  await assert.rejects(service.updateCampaign(WS_A, campaign.id, { templateName: 'pend' }), { code: 'INVALID_TEMPLATE_CONFIG' });
  const edited = await service.updateCampaign(WS_A, campaign.id, { name: 'Renamed', templateName: 'promo2', ratePerMinute: 30 });
  assert.equal(edited.name, 'Renamed');
  assert.equal(edited.templateName, 'promo2');
  assert.equal(edited.ratePerMinute, 30);
  assert.equal(edited.counts.total, 3);
  await service.launch(WS_A, campaign.id, { confirmRecipientCount: 3 });
  await assert.rejects(service.updateCampaign(WS_A, campaign.id, { templateName: 'promo' }), { code: 'INVALID_STATE' });
  await service.pause(WS_A, campaign.id);
  await assert.rejects(service.updateCampaign(WS_A, campaign.id, { templateName: 'promo' }), { code: 'MESSAGE_LOCKED' });
  await service.updateCampaign(WS_A, campaign.id, { ratePerMinute: 600 });
  await service.resume(WS_A, campaign.id);
  await worker.tick();
  assert.equal(sends.length, 3);
  assert.equal(sends[0].name, 'promo2');
});

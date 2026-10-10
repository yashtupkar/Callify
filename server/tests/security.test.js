const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateAddress, resolveSafeHost, assertHttpUrl } = require('../src/tools/urlGuard');
const { executeWebhookTool } = require('../src/tools/WebhookToolExecutor');
const { extractPhoneNumberIds, scopeBodyToConnection, bodyHasStatuses } = require('../src/whatsappAutomation/webhookScope');

test('SSRF guard blocks private, loopback, link-local and metadata addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.255', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('resolveSafeHost rejects hostnames that resolve to private IPs', async () => {
  await assert.rejects(resolveSafeHost('evil.example', { resolver: async () => [{ address: '10.0.0.8', family: 4 }] }), /private/);
  const ok = await resolveSafeHost('good.example', { resolver: async () => [{ address: '93.184.216.34', family: 4 }] });
  assert.equal(ok[0].address, '93.184.216.34');
});

test('assertHttpUrl rejects non-http schemes and embedded credentials', () => {
  assert.throws(() => assertHttpUrl(new URL('file:///etc/passwd')));
  assert.throws(() => assertHttpUrl(new URL('ftp://example.com')));
  assert.throws(() => assertHttpUrl(new URL('https://user:pw@example.com')));
  assert.doesNotThrow(() => assertHttpUrl(new URL('https://example.com/x')));
});

test('executeWebhookTool refuses loopback/metadata targets without sending a request', async () => {
  await assert.rejects(executeWebhookTool({ webhookUrl: 'http://127.0.0.1:9/x', method: 'POST' }, {}), /private|reserved/);
  await assert.rejects(executeWebhookTool({ webhookUrl: 'http://169.254.169.254/latest/meta-data', method: 'GET' }, {}), /private|reserved/);
});

test('webhook env interpolation cannot read non-allow-listed server secrets', async () => {
  process.env.JWT_SECRET_TEST_ONLY = 'super-secret';
  const seen = [];
  const http = require('http');
  const server = http.createServer((req, res) => { seen.push({ url: req.url, headers: req.headers }); res.end('{}'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = 'true';
  process.env.TOOL_OK = 'allowed-value';
  try {
    await executeWebhookTool({
      webhookUrl: `http://127.0.0.1:${server.address().port}/hook`,
      method: 'POST',
      headers: { 'X-A': '{{JWT_SECRET_TEST_ONLY}}', 'X-B': '{{TOOL_OK}}' },
    }, {});
  } finally {
    server.close();
    delete process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers['x-a'], '');
  assert.equal(seen[0].headers['x-b'], 'allowed-value');
});

const payload = (...scopes) => ({
  object: 'whatsapp_business_account',
  entry: scopes.map(([waba, pn, text]) => ({
    id: waba,
    changes: [{ field: 'messages', value: { metadata: { phone_number_id: pn }, messages: [{ id: `w-${pn}-${text}`, from: '1', type: 'text', text: { body: text } }] } }],
  })),
});

test('batched Meta payloads are scoped to the owning connection only', () => {
  const body = payload(['wabaA', 'pnA', 'hi-A'], ['wabaB', 'pnB', 'hi-B']);
  assert.deepEqual(extractPhoneNumberIds(body).sort(), ['pnA', 'pnB']);
  const a = scopeBodyToConnection(body, { phoneNumberId: 'pnA' });
  assert.equal(a.entry.length, 1);
  assert.equal(a.entry[0].changes[0].value.metadata.phone_number_id, 'pnA');
  assert.equal(scopeBodyToConnection(body, { phoneNumberId: 'pnZ' }).entry.length, 0);
});

test('status detection looks at every entry', () => {
  const body = payload(['w', 'p1', 'x'], ['w', 'p2', 'y']);
  body.entry[1].changes[0].value.statuses = [{ id: 's', status: 'read' }];
  assert.equal(bodyHasStatuses(body), true);
});

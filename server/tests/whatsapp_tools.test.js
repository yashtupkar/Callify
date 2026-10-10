const test = require('node:test');
const assert = require('node:assert');
const { WhatsAppToolRegistry, WhatsAppToolExecutor } = require('../src/whatsappAutomation/tools');

function setup() {
  const registry = new WhatsAppToolRegistry().register({
    name: 'ping', description: 'ping', handler: async () => ({ success: true, pong: true }),
  });
  const calls = [];
  const transcript = [];
  const llm = { generateResponse: (...args) => calls.push(args) };
  const executor = new WhatsAppToolExecutor({ registry, llm, transcript, getRecentTranscript: () => transcript });
  return { executor, calls, transcript };
}

test('runs a registered tool and re-prompts with the schema list', async () => {
  const { executor, calls, transcript } = setup();
  await executor.handle('ping', {}, '', 'c1');
  assert.strictEqual(JSON.parse(transcript[1].content).pong, true);
  assert.strictEqual(calls[0][1].length, 1);
});

test('rejects tools that are not registered', async () => {
  const { executor, transcript } = setup();
  await executor.handle('send_money', {}, '', 'c2');
  const result = JSON.parse(transcript[1].content);
  assert.strictEqual(result.success, false);
  assert.match(result.message, /ping/);
});

test('stops offering tools after the per-turn budget', async () => {
  const { executor, calls } = setup();
  executor.maxRoundsPerTurn = 1;
  await executor.handle('ping', {}, '', 'a');
  await executor.handle('ping', {}, '', 'b');
  assert.strictEqual(calls[1][1].length, 0);
  assert.strictEqual(calls[1][2], 'none');
});

test('custom tool from a simple form: schema, validation and CRM writes', async () => {
  const { buildRegistryForAutomation } = require('../src/whatsappAutomation/tools');
  const crm = require('../src/whatsappAutomation/tools/crmService');
  const saved = [];
  const original = { ...crm };
  crm.ensureContact = async () => ({ id: 'c1' });
  crm.updateContact = async (id, f) => saved.push(['contact', f]);
  crm.setStage = async (id, s) => saved.push(['stage', s]);
  crm.createTask = async (t) => { saved.push(['task', t]); return { id: 't1' }; };
  crm.addNote = async () => {};
  try {
    const registry = buildRegistryForAutomation({ tools: [{
      name: 'book_site_survey', enabled: true,
      config: { type: 'custom', title: 'Site survey', description: 'Customer wants a site visit',
        fields: [{ label: 'Name' }, { label: 'Address' }, { label: 'Notes', required: false }],
        askWhen: true, stage: 'qualified', replyMessage: 'Booked {{ref}}' },
    }] });
    assert.ok(registry.has('book_site_survey'));
    assert.match(registry.validate('book_site_survey', { name: 'A' }), /required|address/i);
    const out = await registry.execute('book_site_survey',
      { name: 'Ravi', address: '12 MG Road', when: '2026-11-01T10:00:00+05:30' },
      { workspaceId: 'w', contactWaId: '91' });
    assert.strictEqual(out.success, true);
    assert.match(out.message, /Booked [A-Z]+-/);
    assert.deepStrictEqual(saved.find((s) => s[0] === 'stage'), ['stage', 'qualified']);
    assert.strictEqual(saved.find((s) => s[0] === 'task')[1].kind, 'book_site_survey');
    assert.deepStrictEqual(saved.find((s) => s[0] === 'contact')[1], { name: 'Ravi' });
  } finally { Object.assign(crm, original); }
});

test('sanitizeToolPairs removes orphaned tool calls and tool replies', () => {
  const { sanitizeToolPairs } = require('../src/whatsappAutomation/tools/sanitizeToolPairs');
  const call = (id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'x', arguments: '{}' } }] });
  const out = sanitizeToolPairs([
    { role: 'tool', tool_call_id: 'z', content: '{}' },
    { role: 'user', content: 'a' },
    call('1'), { role: 'user', content: 'interleaved' }, { role: 'tool', tool_call_id: '1', content: '{}' },
    call('2'), { role: 'tool', tool_call_id: '2', content: '{}' },
    { role: 'assistant', content: 'ok' },
  ]);
  assert.deepStrictEqual(out.map((m) => m.role), ['user', 'user', 'assistant', 'tool', 'assistant']);
  assert.strictEqual(out[2].tool_calls[0].id, '2');
});

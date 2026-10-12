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

test('WhatsAppToolExecutor halts tool execution and forces text reply on NOT_CONFIRMED', async () => {
  const { WhatsAppToolExecutor } = require('../src/whatsappAutomation/tools/WhatsAppToolExecutor');
  let repromptSchemas = null;
  let repromptToolChoice = null;
  const fakeLlm = {
    generateResponse: async (_transcript, schemas, toolChoice) => {
      repromptSchemas = schemas;
      repromptToolChoice = toolChoice;
      return 'Please confirm the details';
    },
  };
  const registry = {
    has: () => true,
    validate: () => null,
    execute: async () => ({ success: false, error: 'NOT_CONFIRMED', message: 'Ask user for confirmation' }),
    getAllSchemas: () => [{ type: 'function', function: { name: 'book_survey' } }],
    names: () => ['book_survey'],
  };
  const executor = new WhatsAppToolExecutor({
    registry,
    llm: fakeLlm,
    transcript: [],
    getRecentTranscript: () => [],
  });

  await executor.handle('book_survey', { user_confirmed: false }, null, 'call_1');

  // Must have passed empty schemas and tool_choice: 'none' to force text output to user
  assert.deepStrictEqual(repromptSchemas, []);
  assert.strictEqual(repromptToolChoice, 'none');
});

test('consecutive requests from same customer: each requires fresh details and confirmation', async () => {
  const { buildCustomTool } = require('../src/whatsappAutomation/tools/customTool');
  const tool = buildCustomTool({
    name: 'book_inspection',
    title: 'Site Inspection',
    fields: [{ label: 'Name' }, { label: 'Address' }],
    askWhen: true,
  });

  // Turn 1: First request conversation
  const transcript1 = [
    { role: 'user', content: 'Hi, I want a site inspection. Name: Yash Tupkar, Address: 12 MG Road, tomorrow at 10am' },
    { role: 'assistant', content: 'I have noted: Yash Tupkar at 12 MG Road for tomorrow at 10am. Should I confirm this booking?' },
    { role: 'user', content: 'Yes, please confirm it' },
  ];

  // Request 1 execution succeeds because user confirmed
  const res1 = await tool.handler(
    { name: 'Yash Tupkar', address: '12 MG Road', when: 'tomorrow at 10am' },
    { getRecentTranscript: () => transcript1, contactName: 'Yash Tupkar', contactWaId: '917898297769' }
  );
  assert.strictEqual(res1.success, true);
  assert.match(res1.reference, /BOO-[A-Z0-9-]+/);

  // Completed Turn 1 assistant message recorded in transcript
  const transcriptAfterReq1 = [
    ...transcript1,
    { role: 'assistant', content: `Booked ${res1.reference}. Your inspection has been scheduled!` },
  ];

  // Turn 2: Customer starts SECOND request without providing address/date
  const transcript2Unfinished = [
    ...transcriptAfterReq1,
    { role: 'user', content: 'I need another inspection for my warehouse' },
  ];

  // If assistant attempts to call tool reusing previous address '12 MG Road' and time 'tomorrow at 10am'
  const res2Stale = await tool.handler(
    { name: 'Yash Tupkar', address: '12 MG Road', when: 'tomorrow at 10am' },
    { getRecentTranscript: () => transcript2Unfinished, contactName: 'Yash Tupkar', contactWaId: '917898297769' }
  );
  // Must reject because address was NOT provided in the fresh request scope!
  assert.strictEqual(res2Stale.success, false);
  assert.strictEqual(res2Stale.error, 'UNPROVIDED_CUSTOMER_DETAILS');

  // Turn 3: Customer provides fresh details for second request
  const transcript2Provided = [
    ...transcript2Unfinished,
    { role: 'assistant', content: 'Sure, what is the address and preferred date/time for the warehouse inspection?' },
    { role: 'user', content: 'Warehouse address is Sector 4 Plot 9, on Friday 4pm' },
  ];

  // If tool is called before confirmation
  const res2Unconfirmed = await tool.handler(
    { name: 'Yash Tupkar', address: 'Sector 4 Plot 9', when: 'Friday 4pm' },
    { getRecentTranscript: () => transcript2Provided, contactName: 'Yash Tupkar', contactWaId: '917898297769' }
  );
  assert.strictEqual(res2Unconfirmed.success, false);
  assert.strictEqual(res2Unconfirmed.error, 'NEED_USER_CONFIRMATION');

  // Turn 4: Assistant summarizes and user confirms the second request
  const transcript2Confirmed = [
    ...transcript2Provided,
    { role: 'assistant', content: 'Summary: Warehouse inspection at Sector 4 Plot 9 on Friday 4pm. Confirm?' },
    { role: 'user', content: 'Yes, confirm it' },
  ];

  const res2Success = await tool.handler(
    { name: 'Yash Tupkar', address: 'Sector 4 Plot 9', when: 'Friday 4pm' },
    { getRecentTranscript: () => transcript2Confirmed, contactName: 'Yash Tupkar', contactWaId: '917898297769' }
  );
  assert.strictEqual(res2Success.success, true);
  assert.notStrictEqual(res2Success.reference, res1.reference);
});

test('modifying details invalidates previous confirmation', async () => {
  const { buildCustomTool } = require('../src/whatsappAutomation/tools/customTool');
  const tool = buildCustomTool({
    name: 'book_survey',
    title: 'Site Survey',
    fields: [{ label: 'Name' }, { label: 'Address' }],
  });

  const transcript = [
    { role: 'user', content: 'Name: Ravi, Address: 5th Cross Road' },
    { role: 'assistant', content: 'Summary: Ravi at 5th Cross Road. Confirm?' },
    { role: 'user', content: 'Actually, change the address to 8th Main Road instead' },
  ];

  const out = await tool.handler(
    { name: 'Ravi', address: '8th Main Road' },
    { getRecentTranscript: () => transcript, contactName: 'Ravi', contactWaId: '91' }
  );

  // Must reject because change of details invalidates previous confirmation
  assert.strictEqual(out.success, false);
  assert.strictEqual(out.error, 'NEED_USER_CONFIRMATION');
});

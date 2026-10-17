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

test('crmService: isRecordOld correctly identifies recent vs old records', () => {
  const crm = require('../src/whatsappAutomation/tools/crmService');

  // Record with future dueDate -> NOT old (active upcoming)
  const futureRecord = {
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
  };
  assert.strictEqual(crm.isRecordOld(futureRecord), false);

  // Record with past dueDate -> OLD (overdue)
  const overdueRecord = {
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  };
  assert.strictEqual(crm.isRecordOld(overdueRecord), true);

  // Record without dueDate created 3 hours ago -> NOT old (< 24h)
  const recentRecord = {
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  };
  assert.strictEqual(crm.isRecordOld(recentRecord), false);

  // Record without dueDate created 36 hours ago -> OLD (>= 24h)
  const oldRecord = {
    createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
  };
  assert.strictEqual(crm.isRecordOld(oldRecord), true);
});

test('crmService: categorizeRecordType normalizes tool types and titles', () => {
  const crm = require('../src/whatsappAutomation/tools/crmService');
  assert.strictEqual(crm.categorizeRecordType('book_site_survey'), 'booking');
  assert.strictEqual(crm.categorizeRecordType('Book Appointment'), 'booking');
  assert.strictEqual(crm.categorizeRecordType('doctor_visit'), 'booking');
  assert.strictEqual(crm.categorizeRecordType('register_complaint'), 'complaint');
  assert.strictEqual(crm.categorizeRecordType('Customer Issue'), 'complaint');
  assert.strictEqual(crm.categorizeRecordType('callback_request'), 'callback');
  assert.strictEqual(crm.categorizeRecordType('create_lead'), 'lead');
});

test('crmService: hasUserConfirmedRebook detects rebooking intent', () => {
  const crm = require('../src/whatsappAutomation/tools/crmService');

  // Explicit rebook phrase
  assert.strictEqual(crm.hasUserConfirmedRebook([
    { role: 'user', content: 'Please book again' },
  ]), true);

  assert.strictEqual(crm.hasUserConfirmedRebook([
    { role: 'user', content: 'I want to rebook for tomorrow' },
  ]), true);

  // Rebook after assistant offered option
  const transcriptAfterPrompt = [
    { role: 'assistant', content: 'You have an open booking from 3 days ago. Would you like to book again or follow up?' },
    { role: 'user', content: 'Yes, please' },
  ];
  assert.strictEqual(crm.hasUserConfirmedRebook(transcriptAfterPrompt), true);

  // User declining rebook
  const transcriptDeclined = [
    { role: 'assistant', content: 'You have an open booking from 3 days ago. Would you like to book again or follow up?' },
    { role: 'user', content: 'No, just check status' },
  ];
  assert.strictEqual(crm.hasUserConfirmedRebook(transcriptDeclined), false);
});

test('custom tool: blocks duplicate booking when recent open record exists', async () => {
  const { buildCustomTool } = require('../src/whatsappAutomation/tools/customTool');
  const crm = require('../src/whatsappAutomation/tools/crmService');

  const tool = buildCustomTool({
    name: 'book_service',
    title: 'Book Service',
    fields: [{ label: 'Name' }, { label: 'Address' }],
  });

  const originalFind = crm.findActiveOpenRecord;
  const originalEnsure = crm.ensureContact;
  try {
    crm.ensureContact = async () => ({ id: 'contact_1' });
    // Mock open record: recent (created 2 hours ago)
    crm.findActiveOpenRecord = async () => ({
      reference: 'BOO-RECENT-123',
      type: 'book_service',
      title: 'Book Service',
      status: 'open',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const transcript = [
      { role: 'user', content: 'Name: Yash, Address: 12 Main St' },
      { role: 'assistant', content: 'Summary: Yash at 12 Main St. Confirm?' },
      { role: 'user', content: 'Yes, confirm' },
    ];

    const res = await tool.handler(
      { name: 'Yash', address: '12 Main St' },
      {
        getRecentTranscript: () => transcript,
        contactName: 'Yash',
        contactWaId: '919876543210',
        automationId: 'auto_1',
      }
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'EXISTING_OPEN_RECORD');
    assert.strictEqual(res.hasOpenRecord, true);
    assert.strictEqual(res.isOld, false);
    assert.match(res.message, /already have an open/i);
    assert.match(res.message, /BOO-RECENT-123/);
    assert.match(res.message, /team.*reach out/i);
  } finally {
    crm.findActiveOpenRecord = originalFind;
    crm.ensureContact = originalEnsure;
  }
});

test('custom tool: offers option to rebook when open record is older, and allows rebook when confirmed', async () => {
  const { buildCustomTool } = require('../src/whatsappAutomation/tools/customTool');
  const crm = require('../src/whatsappAutomation/tools/crmService');

  const tool = buildCustomTool({
    name: 'book_appointment',
    title: 'Book Appointment',
    fields: [{ label: 'Name' }, { label: 'Address' }],
  });

  const originalFind = crm.findActiveOpenRecord;
  const originalEnsure = crm.ensureContact;
  const originalCreateRecord = crm.createRecord;
  try {
    crm.ensureContact = async () => ({ id: 'contact_1' });
    crm.createRecord = async (data) => ({ reference: 'BOO-NEW-999', ...data });

    // Mock open record: older (created 3 days ago)
    crm.findActiveOpenRecord = async () => ({
      reference: 'BOO-OLD-456',
      type: 'book_appointment',
      title: 'Book Appointment',
      status: 'open',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    // 1. Without rebook confirmation: should reject with EXISTING_OLD_RECORD
    const transcriptWithoutRebook = [
      { role: 'user', content: 'Name: Yash, Address: 12 Main St' },
      { role: 'assistant', content: 'Summary: Yash at 12 Main St. Confirm?' },
      { role: 'user', content: 'Yes, proceed' },
    ];

    const resOld = await tool.handler(
      { name: 'Yash', address: '12 Main St' },
      {
        getRecentTranscript: () => transcriptWithoutRebook,
        contactName: 'Yash',
        contactWaId: '919876543210',
        automationId: 'auto_1',
      }
    );

    assert.strictEqual(resOld.success, false);
    assert.strictEqual(resOld.error, 'EXISTING_OLD_RECORD');
    assert.strictEqual(resOld.isOld, true);
    assert.match(resOld.message, /existing open/i);
    assert.match(resOld.message, /book again/i);

    // 2. With rebook confirmation: should succeed!
    const transcriptWithRebook = [
      ...transcriptWithoutRebook,
      { role: 'assistant', content: 'You have an open booking BOO-OLD-456. Would you like to book again?' },
      { role: 'user', content: 'Yes, please book again' },
    ];

    const resRebooked = await tool.handler(
      { name: 'Yash', address: '12 Main St' },
      {
        getRecentTranscript: () => transcriptWithRebook,
        contactName: 'Yash',
        contactWaId: '919876543210',
        automationId: 'auto_1',
      }
    );

    assert.strictEqual(resRebooked.success, true);
    assert.strictEqual(resRebooked.reference, 'BOO-NEW-999');
  } finally {
    crm.findActiveOpenRecord = originalFind;
    crm.ensureContact = originalEnsure;
    crm.createRecord = originalCreateRecord;
  }
});

test('crm_create_record: enforces existing open booking / complaint checks', async () => {
  const { BUILT_IN_TOOLS } = require('../src/whatsappAutomation/tools/builtinTools');
  const crm = require('../src/whatsappAutomation/tools/crmService');
  const createRecordTool = BUILT_IN_TOOLS.find((t) => t.name === 'crm_create_record');

  const originalFind = crm.findActiveOpenRecord;
  const originalEnsure = crm.ensureContact;
  const originalCreate = crm.createRecord;

  try {
    crm.ensureContact = async () => ({ id: 'contact_1' });
    crm.createRecord = async (data) => ({ reference: 'COM-NEW-111', ...data });

    // 1. Recent open complaint exists -> blocks creation
    crm.findActiveOpenRecord = async () => ({
      reference: 'COM-101',
      type: 'complaint',
      title: 'Water leakage',
      status: 'open',
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    });

    const transcript = [
      { role: 'user', content: 'I have a complaint about leaking pipes' },
      { role: 'assistant', content: 'Summary: Complaint about water leakage. Confirm?' },
      { role: 'user', content: 'Yes, confirm' },
    ];

    const resRecent = await createRecordTool.handler(
      { title: 'Water leakage', type: 'complaint' },
      {
        automationId: 'auto_1',
        contactWaId: '919876543210',
        crmContactId: 'contact_1',
        getRecentTranscript: () => transcript,
      }
    );

    assert.strictEqual(resRecent.success, false);
    assert.strictEqual(resRecent.error, 'EXISTING_OPEN_RECORD');
    assert.match(resRecent.message, /already have an open/i);

    // 2. Old open complaint exists -> offers re-file
    crm.findActiveOpenRecord = async () => ({
      reference: 'COM-OLD-001',
      type: 'complaint',
      title: 'Water leakage',
      status: 'open',
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
    });

    const resOld = await createRecordTool.handler(
      { title: 'Water leakage', type: 'complaint' },
      {
        automationId: 'auto_1',
        contactWaId: '919876543210',
        crmContactId: 'contact_1',
        getRecentTranscript: () => transcript,
      }
    );

    assert.strictEqual(resOld.success, false);
    assert.strictEqual(resOld.error, 'EXISTING_OLD_RECORD');

    // 3. User confirms rebooking / re-filing -> succeeds
    const transcriptRefile = [
      ...transcript,
      { role: 'assistant', content: 'You have an open complaint COM-OLD-001. Would you like to file again?' },
      { role: 'user', content: 'Yes, file again please' },
    ];

    const resSuccess = await createRecordTool.handler(
      { title: 'Water leakage', type: 'complaint' },
      {
        automationId: 'auto_1',
        contactWaId: '919876543210',
        crmContactId: 'contact_1',
        getRecentTranscript: () => transcriptRefile,
      }
    );

    assert.strictEqual(resSuccess.success, true);
    assert.strictEqual(resSuccess.reference, 'COM-NEW-111');
  } finally {
    crm.findActiveOpenRecord = originalFind;
    crm.ensureContact = originalEnsure;
    crm.createRecord = originalCreate;
  }
});


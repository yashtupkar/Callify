/**
 * Tests for AutoReplyService routing logic.
 * Run with: node --test tests/auto_reply.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const { AutoReplyService, MATCH_MODES } = require('../src/whatsappAutomation/autoReplyService');

// --- Helpers ---
function rule(overrides) {
  return {
    id: overrides.id || 'r1',
    enabled: true,
    priority: overrides.priority ?? 0,
    name: overrides.name || 'Test rule',
    triggerType: overrides.triggerType,
    triggerKey: overrides.triggerKey ?? null,
    triggerValue: overrides.triggerValue ?? null,
    matchMode: overrides.matchMode || 'exact',
    response: overrides.response || 'Auto-reply text',
    responseType: 'text',
    responseConfig: null,
  };
}
function svc(rules) { return new AutoReplyService(rules); }

// --- hasFirstMessageRule / hasAlwaysRule ---
test('hasFirstMessageRule false when no first_message rule', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword', triggerKey: 'hello' })]).hasFirstMessageRule(), false);
});
test('hasFirstMessageRule true when first_message rule exists', () => {
  assert.strictEqual(svc([rule({ triggerType: 'first_message' })]).hasFirstMessageRule(), true);
});
test('hasAlwaysRule false when no always rule', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword' })]).hasAlwaysRule(), false);
});
test('hasAlwaysRule true when always rule exists', () => {
  assert.strictEqual(svc([rule({ triggerType: 'always' })]).hasAlwaysRule(), true);
});

// --- first_message rules ---
test('first_message rule fires when isFirstMessage=true', () => {
  const r = svc([rule({ triggerType: 'first_message', response: 'Welcome!' })]).match({ triggerType: 'keyword', userText: 'hi', isFirstMessage: true });
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.rule.triggerType, 'first_message');
});
test('first_message rule does NOT fire when isFirstMessage=false', () => {
  assert.strictEqual(svc([rule({ triggerType: 'first_message' })]).match({ triggerType: 'keyword', userText: 'hello' }).matched, false);
});
test('first_message takes priority over keyword on first message', () => {
  const service = svc([
    rule({ id: 'kw', triggerType: 'keyword', triggerValue: 'hello', matchMode: 'exact', priority: 0 }),
    rule({ id: 'fm', triggerType: 'first_message', priority: 1 }),
  ]);
  assert.strictEqual(service.match({ triggerType: 'keyword', userText: 'hello', isFirstMessage: true }).rule.triggerType, 'first_message');
});

// --- keyword rules ---
test('exact keyword match fires', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword', triggerValue: 'hello', matchMode: 'exact' })]).match({ triggerType: 'keyword', userText: 'hello' }).matched, true);
});
test('exact keyword does NOT fire for partial', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword', triggerValue: 'hello', matchMode: 'exact' })]).match({ triggerType: 'keyword', userText: 'hello world' }).matched, false);
});
test('contains keyword match fires', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword', triggerValue: 'price', matchMode: 'contains' })]).match({ triggerType: 'keyword', userText: 'what is the price?' }).matched, true);
});
test('prefix keyword match fires', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword', triggerValue: 'order', matchMode: 'prefix' })]).match({ triggerType: 'keyword', userText: 'order status' }).matched, true);
});
test('regex keyword match fires', () => {
  const service = svc([rule({ triggerType: 'keyword', triggerValue: '^hi|^hey', matchMode: 'regex' })]);
  assert.strictEqual(service.match({ triggerType: 'keyword', userText: 'hi there' }).matched, true);
  assert.strictEqual(service.match({ triggerType: 'keyword', userText: 'bye' }).matched, false);
});

// --- button_press / list_row rules ---
test('button_press matches by trigger key', () => {
  assert.strictEqual(svc([rule({ triggerType: 'button_press', triggerValue: 'btn_book' })]).match({ triggerType: 'button_press', triggerKey: 'btn_book', triggerValue: 'Book' }).matched, true);
});
test('button_press does NOT fire for wrong id', () => {
  assert.strictEqual(svc([rule({ triggerType: 'button_press', triggerValue: 'btn_book' })]).match({ triggerType: 'button_press', triggerKey: 'btn_cancel', triggerValue: 'Cancel' }).matched, false);
});
test('list_row matches by row id', () => {
  assert.strictEqual(svc([rule({ triggerType: 'list_row', triggerValue: 'row_support' })]).match({ triggerType: 'list_row', triggerKey: 'row_support', triggerValue: 'Support' }).matched, true);
});

// --- always rules ---
test('always rule fires for keyword message', () => {
  const r = svc([rule({ triggerType: 'always' })]).match({ triggerType: 'keyword', userText: 'hello' });
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.rule.triggerType, 'always');
});
test('always rule fires for button_press', () => {
  assert.strictEqual(svc([rule({ triggerType: 'always' })]).match({ triggerType: 'button_press', triggerKey: 'btn', triggerValue: 'Book' }).matched, true);
});
test('always rule fires when triggerType is null (media/location)', () => {
  assert.strictEqual(svc([rule({ triggerType: 'always' })]).match({ triggerType: null }).matched, true);
});
test('always rule does NOT fire when disabled', () => {
  const service = new AutoReplyService([{ ...rule({ triggerType: 'always' }), enabled: false }]);
  assert.strictEqual(service.match({ triggerType: 'keyword', userText: 'hello' }).matched, false);
});

// --- priority ordering ---
test('lower priority number wins', () => {
  const service = svc([
    rule({ id: 'hi', triggerType: 'keyword', triggerValue: 'hello', matchMode: 'exact', priority: 10 }),
    rule({ id: 'lo', triggerType: 'keyword', triggerValue: 'hello', matchMode: 'exact', priority: 1 }),
  ]);
  assert.strictEqual(service.match({ triggerType: 'keyword', userText: 'hello' }).rule.id, 'lo');
});
test('specific keyword beats always when keyword matches', () => {
  const service = svc([
    rule({ id: 'specific', triggerType: 'keyword', triggerValue: 'hello', matchMode: 'exact', priority: 0 }),
    rule({ id: 'catchall', triggerType: 'always', priority: 1 }),
  ]);
  assert.strictEqual(service.match({ triggerType: 'keyword', userText: 'hello' }).rule.id, 'specific');
});
test('always fires for unmatched keyword when specific rule does not match', () => {
  const service = svc([
    rule({ id: 'specific', triggerType: 'keyword', triggerValue: 'support', matchMode: 'exact', priority: 0 }),
    rule({ id: 'catchall', triggerType: 'always', priority: 1 }),
  ]);
  assert.strictEqual(service.match({ triggerType: 'keyword', userText: 'hello' }).rule.id, 'catchall');
});

// --- LLM fallback (no match) ---
test('returns matched=false when no rule matches (LLM fallback)', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword', triggerValue: 'support', matchMode: 'exact' })]).match({ triggerType: 'keyword', userText: 'hello' }).matched, false);
});
test('returns matched=false for empty rule set', () => {
  assert.strictEqual(svc([]).match({ triggerType: 'keyword', userText: 'hello' }).matched, false);
});
test('returns matched=false for button_press with no applicable rules', () => {
  assert.strictEqual(svc([rule({ triggerType: 'keyword', triggerValue: 'hello', matchMode: 'exact' })]).match({ triggerType: 'button_press', triggerKey: 'btn', triggerValue: 'Book' }).matched, false);
});

// --- always fires on first message when no first_message rule configured ---
test('always rule fires on first message when no first_message rule exists', () => {
  const r = svc([rule({ triggerType: 'always', response: 'Out of office' })]).match({ triggerType: 'keyword', userText: 'hi', isFirstMessage: true });
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.rule.triggerType, 'always');
});

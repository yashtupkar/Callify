/**
 * test_whatsapp_responses.js
 *
 * Test suite for WhatsApp response normalizer, Meta payload builder, and dispatcher.
 * Run with: node test/test_whatsapp_responses.js
 *
 * No external test framework required — uses Node's built-in assert module.
 */

'use strict';

const assert = require('assert');

// ─── Import modules under test ────────────────────────────────────────────────
const {
  normalizeWhatsAppResponse,
  extractJsonFromText,
  extractPlainText,
  isValidHttpUrl,
  VALID_RESPONSE_TYPES,
} = require('../src/whatsappAutomation/responseNormalizer');

const {
  buildMetaPayload,
  cleanRecipient,
} = require('../src/whatsappAutomation/metaPayloadBuilder');

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── normalizeWhatsAppResponse tests ─────────────────────────────────────────
console.log('\n[1] normalizeWhatsAppResponse — text');

test('returns text response for { _type: "text", text: "hello" }', () => {
  const r = normalizeWhatsAppResponse({ _type: 'text', text: 'Hello' });
  assert.strictEqual(r._type, 'text');
  assert.strictEqual(r.text, 'Hello');
});

test('returns text response for plain string input', () => {
  const r = normalizeWhatsAppResponse('Hello world');
  assert.strictEqual(r._type, 'text');
  assert.strictEqual(r.text, 'Hello world');
});

test('returns fallback for null input', () => {
  const r = normalizeWhatsAppResponse(null);
  assert.strictEqual(r._type, 'text');
  assert(r.text.length > 0);
});

test('returns fallback for empty string', () => {
  const r = normalizeWhatsAppResponse('');
  assert.strictEqual(r._type, 'text');
});

test('returns fallback for unsupported _type', () => {
  const r = normalizeWhatsAppResponse({ _type: 'carousel', body: 'something' });
  assert.strictEqual(r._type, 'text');
});

test('extracts JSON from markdown code fence', () => {
  const raw = '```json\n{"_type":"text","text":"Hello"}\n```';
  const obj = extractJsonFromText(raw);
  assert.strictEqual(obj._type, 'text');
});

test('extracts JSON embedded in surrounding text', () => {
  const raw = 'Here is the response: {"_type":"text","text":"Hi"} done.';
  const obj = extractJsonFromText(raw);
  assert.strictEqual(obj._type, 'text');
});

test('returns null for invalid JSON', () => {
  const obj = extractJsonFromText('not json at all');
  assert.strictEqual(obj, null);
});

// ─── Button response ──────────────────────────────────────────────────────────
console.log('\n[2] normalizeWhatsAppResponse — button');

test('validates a proper 3-button response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'button',
    body: 'Choose an option',
    buttons: [
      { id: 'opt_a', title: 'Option A' },
      { id: 'opt_b', title: 'Option B' },
      { id: 'opt_c', title: 'Option C' },
    ],
  });
  assert.strictEqual(r._type, 'button');
  assert.strictEqual(r.buttons.length, 3);
  assert.strictEqual(r.buttons[0].id, 'opt_a');
});

test('caps buttons at 3', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'button',
    body: 'Choose',
    buttons: [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
      { id: 'd', title: 'D' },
    ],
  });
  assert.strictEqual(r.buttons.length, 3);
});

test('de-duplicates button IDs', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'button',
    body: 'Choose',
    buttons: [
      { id: 'get_quote', title: 'Get Quote' },
      { id: 'get_quote', title: 'Get Quote 2' },
    ],
  });
  const ids = r.buttons.map(b => b.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('falls back to text when buttons array is empty', () => {
  const r = normalizeWhatsAppResponse({ _type: 'button', body: 'Hello', buttons: [] });
  assert.strictEqual(r._type, 'text');
});

test('falls back to text when body is missing', () => {
  const r = normalizeWhatsAppResponse({ _type: 'button', buttons: [] });
  assert.strictEqual(r._type, 'text');
});

test('truncates button titles to 20 chars', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'button',
    body: 'Pick',
    buttons: [{ id: 'a', title: 'A very long button title that exceeds limit' }],
  });
  assert(r.buttons[0].title.length <= 20);
});

// ─── List response ────────────────────────────────────────────────────────────
console.log('\n[3] normalizeWhatsAppResponse — list');

test('validates a proper list response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'list',
    body: 'Choose a service',
    buttonLabel: 'View Services',
    sections: [
      {
        title: 'Services',
        rows: [
          { id: 'solar_install', title: 'Solar Installation', description: 'New system' },
          { id: 'repair', title: 'Repair', description: 'Fix existing system' },
        ],
      },
    ],
  });
  assert.strictEqual(r._type, 'list');
  assert.strictEqual(r.sections[0].rows.length, 2);
  assert.strictEqual(r.sections[0].rows[0].id, 'solar_install');
});

test('de-duplicates row IDs across sections', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'list',
    body: 'Choose',
    buttonLabel: 'Go',
    sections: [
      { title: 'A', rows: [{ id: 'opt', title: 'Option' }] },
      { title: 'B', rows: [{ id: 'opt', title: 'Option 2' }] },
    ],
  });
  const allIds = r.sections.flatMap(s => s.rows.map(r2 => r2.id));
  assert.strictEqual(new Set(allIds).size, allIds.length);
});

test('caps total rows at 10', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));
  const r = normalizeWhatsAppResponse({
    _type: 'list',
    body: 'Choose',
    buttonLabel: 'Go',
    sections: [{ title: 'All', rows }],
  });
  const total = r.sections.reduce((sum, s) => sum + s.rows.length, 0);
  assert(total <= 10);
});

test('falls back to text when sections are empty', () => {
  const r = normalizeWhatsAppResponse({ _type: 'list', body: 'Choose', sections: [] });
  assert.strictEqual(r._type, 'text');
});

// ─── CTA URL response ─────────────────────────────────────────────────────────
console.log('\n[4] normalizeWhatsAppResponse — cta_url');

test('validates a proper cta_url response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'cta_url',
    body: 'Book here:',
    button: { title: 'Book Now', url: 'https://example.com/book' },
  });
  assert.strictEqual(r._type, 'cta_url');
  assert.strictEqual(r.button.url, 'https://example.com/book');
});

test('falls back to text for invalid URL', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'cta_url',
    body: 'Book here:',
    button: { title: 'Book', url: 'javascript:alert(1)' },
  });
  assert.strictEqual(r._type, 'text');
});

test('falls back to text for missing URL', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'cta_url',
    body: 'Click below',
    button: { title: 'Go' },
  });
  assert.strictEqual(r._type, 'text');
});

test('rejects ftp:// URL', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'cta_url',
    body: 'Download:',
    button: { title: 'Download', url: 'ftp://files.example.com/doc.pdf' },
  });
  assert.strictEqual(r._type, 'text');
});

// ─── Media response ───────────────────────────────────────────────────────────
console.log('\n[5] normalizeWhatsAppResponse — media');

test('validates image media response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'media',
    mediaType: 'image',
    url: 'https://example.com/img.jpg',
    caption: 'Our work',
  });
  assert.strictEqual(r._type, 'media');
  assert.strictEqual(r.mediaType, 'image');
  assert.strictEqual(r.url, 'https://example.com/img.jpg');
});

test('validates video media response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'media',
    mediaType: 'video',
    url: 'https://example.com/vid.mp4',
  });
  assert.strictEqual(r.mediaType, 'video');
});

test('validates document media response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'media',
    mediaType: 'document',
    url: 'https://example.com/doc.pdf',
    filename: 'brochure.pdf',
  });
  assert.strictEqual(r.mediaType, 'document');
  assert.strictEqual(r.filename, 'brochure.pdf');
});

test('falls back to text for missing media URL and mediaId', () => {
  const r = normalizeWhatsAppResponse({ _type: 'media', mediaType: 'image' });
  assert.strictEqual(r._type, 'text');
});

test('falls back to text for invalid media URL', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'media',
    mediaType: 'image',
    url: 'not-a-url',
  });
  assert.strictEqual(r._type, 'text');
});

test('accepts mediaId in place of URL', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'media',
    mediaType: 'image',
    mediaId: 'META_MEDIA_ID_123',
  });
  assert.strictEqual(r._type, 'media');
  assert.strictEqual(r.mediaId, 'META_MEDIA_ID_123');
  assert(!r.url);
});

// ─── Template response ────────────────────────────────────────────────────────
console.log('\n[6] normalizeWhatsAppResponse — template');

test('validates a proper template response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'template',
    name: 'order_confirmation',
    language: 'en_US',
    parameters: { customer_name: 'Yash', order_id: 'ORD123' },
  });
  assert.strictEqual(r._type, 'template');
  assert.strictEqual(r.name, 'order_confirmation');
  assert.strictEqual(r.language, 'en_US');
});

test('falls back to text when template name is missing', () => {
  const r = normalizeWhatsAppResponse({ _type: 'template', language: 'en_US' });
  assert.strictEqual(r._type, 'text');
});

// ─── Flow response ────────────────────────────────────────────────────────────
console.log('\n[7] normalizeWhatsAppResponse — flow');

test('validates a proper flow response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'flow',
    flowId: 'FLOW_ABC123',
    cta: 'Start',
    body: 'Please complete the form.',
  });
  assert.strictEqual(r._type, 'flow');
  assert.strictEqual(r.flowId, 'FLOW_ABC123');
  assert.strictEqual(r.cta, 'Start');
});

test('falls back to text when flowId is missing', () => {
  const r = normalizeWhatsAppResponse({ _type: 'flow', cta: 'Start', body: 'Complete' });
  assert.strictEqual(r._type, 'text');
});

// ─── Location response ────────────────────────────────────────────────────────
console.log('\n[8] normalizeWhatsAppResponse — location');

test('validates a proper location response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'location',
    latitude: 23.2599,
    longitude: 77.4126,
    name: 'ABC Solar',
    address: 'Bhopal, MP',
  });
  assert.strictEqual(r._type, 'location');
  assert.strictEqual(r.latitude, 23.2599);
});

test('falls back to text for invalid coordinates (NaN)', () => {
  const r = normalizeWhatsAppResponse({ _type: 'location', latitude: 'abc', longitude: 77.0 });
  assert.strictEqual(r._type, 'text');
});

test('falls back to text for out-of-range latitude', () => {
  const r = normalizeWhatsAppResponse({ _type: 'location', latitude: 200, longitude: 77.0 });
  assert.strictEqual(r._type, 'text');
});

test('falls back to text for out-of-range longitude', () => {
  const r = normalizeWhatsAppResponse({ _type: 'location', latitude: 23.0, longitude: 400 });
  assert.strictEqual(r._type, 'text');
});

// ─── Handoff response ─────────────────────────────────────────────────────────
console.log('\n[9] normalizeWhatsAppResponse — handoff');

test('validates a proper handoff response', () => {
  const r = normalizeWhatsAppResponse({
    _type: 'handoff',
    message: "I'll connect you now.",
  });
  assert.strictEqual(r._type, 'handoff');
  assert.strictEqual(r.message, "I'll connect you now.");
});

test('uses default message when handoff message is missing', () => {
  const r = normalizeWhatsAppResponse({ _type: 'handoff' });
  assert.strictEqual(r._type, 'handoff');
  assert(r.message.length > 0);
});

// ─── buildMetaPayload tests ───────────────────────────────────────────────────
console.log('\n[10] buildMetaPayload — all types');

test('builds text payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: { _type: 'text', text: 'Hello there!' },
  });
  assert.strictEqual(p.type, 'text');
  assert.strictEqual(p.text.body, 'Hello there!');
  assert.strictEqual(p.to, '919876543210');
  assert.strictEqual(p.messaging_product, 'whatsapp');
});

test('builds interactive button payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'button',
      body: 'Choose:',
      buttons: [
        { id: 'opt_a', title: 'Option A' },
        { id: 'opt_b', title: 'Option B' },
      ],
    },
  });
  assert.strictEqual(p.type, 'interactive');
  assert.strictEqual(p.interactive.type, 'button');
  assert.strictEqual(p.interactive.action.buttons.length, 2);
  assert.strictEqual(p.interactive.action.buttons[0].type, 'reply');
  assert.strictEqual(p.interactive.action.buttons[0].reply.id, 'opt_a');
});

test('builds interactive list payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'list',
      body: 'Pick a service:',
      buttonLabel: 'View',
      sections: [
        {
          title: 'Services',
          rows: [
            { id: 'solar', title: 'Solar', description: 'Installation' },
          ],
        },
      ],
    },
  });
  assert.strictEqual(p.type, 'interactive');
  assert.strictEqual(p.interactive.type, 'list');
  assert.strictEqual(p.interactive.action.button, 'View');
  assert.strictEqual(p.interactive.action.sections[0].rows[0].id, 'solar');
});

test('builds cta_url payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'cta_url',
      body: 'Book here:',
      button: { title: 'Book Now', url: 'https://example.com/book' },
    },
  });
  assert.strictEqual(p.type, 'interactive');
  assert.strictEqual(p.interactive.type, 'cta_url');
  assert.strictEqual(p.interactive.action.name, 'cta_url');
  assert.strictEqual(p.interactive.action.parameters.url, 'https://example.com/book');
  assert.strictEqual(p.interactive.action.parameters.display_text, 'Book Now');
});

test('builds image payload with link', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'media',
      mediaType: 'image',
      url: 'https://example.com/img.jpg',
      caption: 'Solar panel',
    },
  });
  assert.strictEqual(p.type, 'image');
  assert.strictEqual(p.image.link, 'https://example.com/img.jpg');
  assert.strictEqual(p.image.caption, 'Solar panel');
});

test('builds image payload with mediaId', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'media',
      mediaType: 'image',
      mediaId: 'META_MEDIA_123',
    },
  });
  assert.strictEqual(p.type, 'image');
  assert.strictEqual(p.image.id, 'META_MEDIA_123');
  assert(!p.image.link);
});

test('builds video payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'media',
      mediaType: 'video',
      url: 'https://example.com/video.mp4',
    },
  });
  assert.strictEqual(p.type, 'video');
  assert.strictEqual(p.video.link, 'https://example.com/video.mp4');
});

test('builds document payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'media',
      mediaType: 'document',
      url: 'https://example.com/doc.pdf',
      filename: 'brochure.pdf',
    },
  });
  assert.strictEqual(p.type, 'document');
  assert.strictEqual(p.document.link, 'https://example.com/doc.pdf');
  assert.strictEqual(p.document.filename, 'brochure.pdf');
});

test('builds template payload with object parameters', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'template',
      name: 'order_confirmation',
      language: 'en_US',
      parameters: { customer_name: 'Yash', order_id: 'ORD123' },
    },
  });
  assert.strictEqual(p.type, 'template');
  assert.strictEqual(p.template.name, 'order_confirmation');
  assert.strictEqual(p.template.language.code, 'en_US');
  assert.strictEqual(p.template.components[0].type, 'body');
  assert.strictEqual(p.template.components[0].parameters[0].type, 'text');
});

test('builds flow payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'flow',
      flowId: 'FLOW_ABC',
      cta: 'Start',
      body: 'Fill the form.',
    },
  });
  assert.strictEqual(p.type, 'interactive');
  assert.strictEqual(p.interactive.type, 'flow');
  assert.strictEqual(p.interactive.action.name, 'flow');
  assert.strictEqual(p.interactive.action.parameters.flow_id, 'FLOW_ABC');
  assert.strictEqual(p.interactive.action.parameters.flow_cta, 'Start');
  assert(typeof p.interactive.action.parameters.flow_token === 'string');
});

test('builds location payload', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: {
      _type: 'location',
      latitude: 23.2599,
      longitude: 77.4126,
      name: 'ABC Solar',
      address: 'Bhopal, MP',
    },
  });
  assert.strictEqual(p.type, 'location');
  assert.strictEqual(p.location.latitude, 23.2599);
  assert.strictEqual(p.location.longitude, 77.4126);
  assert.strictEqual(p.location.name, 'ABC Solar');
});

test('returns null payload for handoff type', () => {
  const p = buildMetaPayload({
    recipient: '919876543210',
    response: { _type: 'handoff', message: 'Connecting you now.' },
  });
  assert.strictEqual(p, null);
});

test('throws error for missing recipient', () => {
  assert.throws(() => {
    buildMetaPayload({ recipient: '', response: { _type: 'text', text: 'Hi' } });
  });
});

// ─── Invalid provider / edge cases ────────────────────────────────────────────
console.log('\n[11] Edge cases');

test('cleanRecipient strips @ suffix', () => {
  assert.strictEqual(cleanRecipient('9199xxxx@s.whatsapp.net'), '9199xxxx');
});

test('cleanRecipient strips + prefix', () => {
  assert.strictEqual(cleanRecipient('+919876543210'), '919876543210');
});

test('isValidHttpUrl accepts https', () => {
  assert(isValidHttpUrl('https://example.com'));
});

test('isValidHttpUrl accepts http', () => {
  assert(isValidHttpUrl('http://example.com'));
});

test('isValidHttpUrl rejects javascript:', () => {
  assert(!isValidHttpUrl('javascript:void(0)'));
});

test('isValidHttpUrl rejects empty string', () => {
  assert(!isValidHttpUrl(''));
});

test('extractPlainText from button returns numbered list', () => {
  const text = extractPlainText({
    _type: 'button',
    body: 'Choose:',
    buttons: [{ id: 'a', title: 'Option A' }, { id: 'b', title: 'Option B' }],
  });
  assert(text.includes('Option A'));
  assert(text.includes('Option B'));
});

test('extractPlainText from location includes coordinates', () => {
  const text = extractPlainText({
    _type: 'location',
    latitude: 23.2599,
    longitude: 77.4126,
    name: 'ABC Solar',
  });
  assert(text.includes('23.2599'));
  assert(text.includes('77.4126'));
});

test('extractPlainText from cta_url includes URL', () => {
  const text = extractPlainText({
    _type: 'cta_url',
    body: 'Book here:',
    button: { title: 'Book', url: 'https://example.com/book' },
  });
  assert(text.includes('https://example.com/book'));
});

// ─── CloudApiProvider parseInbound — interactive responses ────────────────────
console.log('\n[12] CloudApiProvider.parseInbound — interactive messages');

const { CloudApiProvider } = require('../src/integrations/whatsapp/CloudApiProvider');

function makeCloudProvider() {
  return new CloudApiProvider({
    phoneNumberId: 'TEST_PHONE_ID',
    apiToken: 'TEST_TOKEN',
  });
}

function makeWebhookReq(messages = []) {
  return {
    headers: {},
    body: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA123',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: 'TEST_PHONE_ID', display_phone_number: '15550123456' },
                contacts: [{ wa_id: '919876543210', profile: { name: 'Test User' } }],
                messages,
              },
            },
          ],
        },
      ],
    },
    query: {},
  };
}

test('parses text message', () => {
  const provider = makeCloudProvider();
  const req = makeWebhookReq([{
    from: '919876543210', id: 'MSG001',
    timestamp: '1700000000', type: 'text',
    text: { body: 'Hello' },
  }]);
  const out = provider.parseInbound(req);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'text');
  assert.strictEqual(out[0].text, 'Hello');
  assert.strictEqual(out[0].profileName, 'Test User');
});

test('parses button_reply (interactive)', () => {
  const provider = makeCloudProvider();
  const req = makeWebhookReq([{
    from: '919876543210', id: 'MSG002',
    timestamp: '1700000001', type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: { id: 'get_quote', title: 'Get a Quote' },
    },
  }]);
  const out = provider.parseInbound(req);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'interactive_response');
  assert.strictEqual(out[0].interactionType, 'button_reply');
  assert.strictEqual(out[0].id, 'get_quote');
  assert.strictEqual(out[0].title, 'Get a Quote');
});

test('parses list_reply (interactive)', () => {
  const provider = makeCloudProvider();
  const req = makeWebhookReq([{
    from: '919876543210', id: 'MSG003',
    timestamp: '1700000002', type: 'interactive',
    interactive: {
      type: 'list_reply',
      list_reply: { id: 'solar_install', title: 'Solar Installation', description: 'New system' },
    },
  }]);
  const out = provider.parseInbound(req);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'interactive_response');
  assert.strictEqual(out[0].interactionType, 'list_reply');
  assert.strictEqual(out[0].id, 'solar_install');
  assert.strictEqual(out[0].description, 'New system');
});

test('parses image message', () => {
  const provider = makeCloudProvider();
  const req = makeWebhookReq([{
    from: '919876543210', id: 'MSG004',
    timestamp: '1700000003', type: 'image',
    image: { id: 'IMG001', mime_type: 'image/jpeg', caption: 'My photo' },
  }]);
  const out = provider.parseInbound(req);
  assert.strictEqual(out[0].type, 'image');
  assert.strictEqual(out[0].media.providerMediaId, 'IMG001');
  assert.strictEqual(out[0].text, 'My photo');
});

test('parses document message', () => {
  const provider = makeCloudProvider();
  const req = makeWebhookReq([{
    from: '919876543210', id: 'MSG005',
    timestamp: '1700000004', type: 'document',
    document: { id: 'DOC001', mime_type: 'application/pdf', filename: 'contract.pdf' },
  }]);
  const out = provider.parseInbound(req);
  assert.strictEqual(out[0].type, 'document');
  assert.strictEqual(out[0].media.filename, 'contract.pdf');
});

test('parses location message', () => {
  const provider = makeCloudProvider();
  const req = makeWebhookReq([{
    from: '919876543210', id: 'MSG006',
    timestamp: '1700000005', type: 'location',
    location: { latitude: 23.25, longitude: 77.41, name: 'Office', address: 'Bhopal' },
  }]);
  const out = provider.parseInbound(req);
  assert.strictEqual(out[0].type, 'location');
  assert.strictEqual(out[0].location.latitude, 23.25);
});

test('parses status updates', () => {
  const provider = makeCloudProvider();
  const req = {
    body: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA123',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  { id: 'MSG999', status: 'delivered', timestamp: '1700000010', recipient_id: '919876543210' },
                ],
              },
            },
          ],
        },
      ],
    },
  };
  const statuses = provider.parseStatusUpdates(req);
  assert.strictEqual(statuses.length, 1);
  assert.strictEqual(statuses[0].status, 'delivered');
  assert.strictEqual(statuses[0].providerMessageId, 'MSG999');
});

test('returns empty array for non-whatsapp webhook payload', () => {
  const provider = makeCloudProvider();
  const req = { body: { object: 'other_type' }, headers: {} };
  const out = provider.parseInbound(req);
  assert.deepStrictEqual(out, []);
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Tests complete: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n❌ Some tests failed.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
}

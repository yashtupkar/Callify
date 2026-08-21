// Built-in tool catalog and executor factory.
// Each agent stores an array of tool configs: { type, name?, description?, config: {...} }.
// buildTools() converts them into OpenAI function schemas + async executors.

const DEMO_SLOTS = [
  '2026-08-24T10:00:00Z',
  '2026-08-24T14:30:00Z',
  '2026-08-25T09:00:00Z',
  '2026-08-25T16:00:00Z',
  '2026-08-26T11:00:00Z',
];
const demoBookings = [];

const TOOL_CATALOG = [
  {
    type: 'google_sheets',
    label: 'Google Sheets',
    description: 'Append a row to a Google Sheet (via Apps Script webhook URL).',
    configFields: [
      { key: 'webhookUrl', label: 'Apps Script Webhook URL', required: true },
      { key: 'columns', label: 'Column names (comma separated)', required: false },
    ],
  },
  {
    type: 'calendar',
    label: 'Calendar',
    description: 'Check availability and book appointments (webhook URL, or built-in demo calendar).',
    configFields: [
      { key: 'webhookUrl', label: 'Calendar Webhook URL (optional, demo calendar used if empty)', required: false },
    ],
  },
  {
    type: 'api_request',
    label: 'Custom API Request',
    description: 'Call any HTTP endpoint with model-provided parameters.',
    configFields: [
      { key: 'name', label: 'Tool name (snake_case)', required: true },
      { key: 'description', label: 'What this tool does (shown to the model)', required: true },
      { key: 'url', label: 'URL', required: true },
      { key: 'method', label: 'HTTP method', required: false },
      { key: 'headers', label: 'Headers (JSON)', required: false },
      { key: 'parameters', label: 'Parameters JSON schema', required: false },
    ],
  },
  {
    type: 'end_call',
    label: 'End Call',
    description: 'Lets the agent end the call gracefully when the conversation is over.',
    configFields: [],
  },
];

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: text.slice(0, 500) };
  }
  try { return { ok: true, data: JSON.parse(text) }; } catch { return { ok: true, data: text.slice(0, 500) }; }
}

function buildGoogleSheetsTool(toolConfig) {
  const cfg = toolConfig.config || {};
  const columns = (cfg.columns || '').split(',').map((c) => c.trim()).filter(Boolean);
  const properties = {};
  for (const col of columns) {
    properties[col] = { type: 'string', description: `Value for the "${col}" column` };
  }
  const hasSchema = columns.length > 0;
  return {
    schema: {
      type: 'function',
      function: {
        name: toolConfig.name || 'save_to_google_sheet',
        description: toolConfig.description || 'Save collected information as a new row in the Google Sheet. Use once you have gathered the required details.',
        parameters: hasSchema
          ? { type: 'object', properties, required: columns }
          : {
              type: 'object',
              properties: { row: { type: 'object', description: 'Key/value pairs to save as a row', additionalProperties: { type: 'string' } } },
              required: ['row'],
            },
      },
    },
    execute: async (args) => {
      if (!cfg.webhookUrl) return { error: 'Google Sheets webhook URL is not configured for this agent.' };
      const row = hasSchema ? args : args.row || args;
      return postJson(cfg.webhookUrl, { action: 'append', row });
    },
  };
}

function buildCalendarTools(toolConfig) {
  const cfg = toolConfig.config || {};
  const checkAvailability = {
    schema: {
      type: 'function',
      function: {
        name: 'check_calendar_availability',
        description: 'Get available appointment slots. Call this before offering times to the caller.',
        parameters: {
          type: 'object',
          properties: { date: { type: 'string', description: 'Preferred date (YYYY-MM-DD), optional' } },
        },
      },
    },
    execute: async (args) => {
      if (cfg.webhookUrl) return postJson(cfg.webhookUrl, { action: 'check_availability', ...args });
      const booked = demoBookings.map((b) => b.slot);
      let slots = DEMO_SLOTS.filter((s) => !booked.includes(s));
      if (args.date) slots = slots.filter((s) => s.startsWith(args.date));
      return { available_slots: slots };
    },
  };
  const book = {
    schema: {
      type: 'function',
      function: {
        name: 'book_appointment',
        description: 'Book an appointment slot after confirming the time and caller details.',
        parameters: {
          type: 'object',
          properties: {
            slot: { type: 'string', description: 'ISO datetime of the chosen slot' },
            name: { type: 'string', description: 'Caller name' },
            contact: { type: 'string', description: 'Phone or email' },
            notes: { type: 'string', description: 'Reason for the appointment' },
          },
          required: ['slot', 'name'],
        },
      },
    },
    execute: async (args) => {
      if (cfg.webhookUrl) return postJson(cfg.webhookUrl, { action: 'book', ...args });
      demoBookings.push(args);
      return { ok: true, confirmation: `Booked ${args.slot} for ${args.name}` };
    },
  };
  return [checkAvailability, book];
}

function buildApiRequestTool(toolConfig) {
  const cfg = toolConfig.config || {};
  let parameters = { type: 'object', properties: {} };
  try {
    if (cfg.parameters) parameters = typeof cfg.parameters === 'string' ? JSON.parse(cfg.parameters) : cfg.parameters;
  } catch (e) {
    console.warn('[toolRegistry] Invalid parameters schema for api_request tool:', e.message);
  }
  let headers = {};
  try {
    if (cfg.headers) headers = typeof cfg.headers === 'string' ? JSON.parse(cfg.headers) : cfg.headers;
  } catch (e) {
    console.warn('[toolRegistry] Invalid headers JSON for api_request tool:', e.message);
  }
  return {
    schema: {
      type: 'function',
      function: {
        name: cfg.name || toolConfig.name || 'api_request',
        description: cfg.description || toolConfig.description || 'Make an API request.',
        parameters,
      },
    },
    execute: async (args) => {
      if (!cfg.url) return { error: 'API request URL is not configured.' };
      const method = (cfg.method || 'POST').toUpperCase();
      if (method === 'GET') {
        const qs = new URLSearchParams(args).toString();
        const res = await fetch(`${cfg.url}${qs ? (cfg.url.includes('?') ? '&' : '?') + qs : ''}`, { headers });
        const text = await res.text();
        try { return { ok: res.ok, data: JSON.parse(text) }; } catch { return { ok: res.ok, data: text.slice(0, 500) }; }
      }
      return postJson(cfg.url, args, headers);
    },
  };
}

function buildEndCallTool() {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'end_call',
        description: 'End the call. Only use after saying goodbye and the caller has nothing else.',
        parameters: { type: 'object', properties: { reason: { type: 'string' } } },
      },
    },
    execute: async () => ({ ok: true, ending_call: true }),
  };
}

// Returns { schemas: [...], executors: { name: fn } }
function buildTools(toolConfigs = []) {
  const built = [];
  for (const tc of toolConfigs) {
    if (tc.enabled === false) continue;
    switch (tc.type) {
      case 'google_sheets': built.push(buildGoogleSheetsTool(tc)); break;
      case 'calendar': built.push(...buildCalendarTools(tc)); break;
      case 'api_request': built.push(buildApiRequestTool(tc)); break;
      case 'end_call': built.push(buildEndCallTool()); break;
      default: console.warn(`[toolRegistry] Unknown tool type: ${tc.type}`);
    }
  }
  const schemas = built.map((t) => t.schema);
  const executors = {};
  for (const t of built) executors[t.schema.function.name] = t.execute;
  return { schemas, executors };
}

module.exports = { buildTools, TOOL_CATALOG };

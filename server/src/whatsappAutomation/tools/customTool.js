const crm = require('./crmService');

const slug = (value, max = 40) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max);
const CONTACT_KEYS = new Set(['name', 'email', 'company', 'city']);

/**
 * Normalise the simple form a user fills in:
 * { name, description, fields:[{label, required}], askWhen, stage, replyMessage }
 * Returns null when the definition is unusable.
 */
function normalizeCustomConfig(input = {}) {
  const name = slug(input.name, 50);
  if (!name) return null;
  const seen = new Set();
  const fields = (Array.isArray(input.fields) ? input.fields : [])
    .map((field) => {
      const label = String(typeof field === 'string' ? field : field?.label || '').trim().slice(0, 60);
      return { label, key: slug(label, 30), required: typeof field === 'object' ? field.required !== false : true };
    })
    .filter((field) => field.key && !seen.has(field.key) && seen.add(field.key))
    .slice(0, 12);
  return {
    type: 'custom',
    name,
    title: String(input.title || name.replace(/_/g, ' ')).trim().slice(0, 80),
    description: String(input.description || '').trim().slice(0, 500),
    fields,
    askWhen: Boolean(input.askWhen),
    stage: crm.STAGES.includes(input.stage) ? input.stage : '',
    replyMessage: String(input.replyMessage || '').trim().slice(0, 300),
  };
}

/** Turn a custom-tool config into a registry tool definition. */
function buildCustomTool(rawConfig) {
  const config = normalizeCustomConfig(rawConfig);
  if (!config) return null;
  const properties = {};
  const required = [];
  for (const field of config.fields) {
    properties[field.key] = { type: 'string', description: field.label };
    if (field.required) required.push(field.key);
  }
  if (config.askWhen) {
    properties.when = { type: 'string', description: 'Requested date and time, ISO 8601 in the business timezone' };
    required.push('when');
  }

  return {
    name: config.name,
    category: 'custom',
    description: config.description || `Record a "${config.title}" request for the business team.`,
    parameters: { type: 'object', properties, required, additionalProperties: false },
    handler: async (args, ctx) => {
      const reference = `${slug(config.name, 3).toUpperCase() || 'REQ'}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

      return {
        success: true,
        reference,
        message: (config.replyMessage || 'Your request has been recorded and our team will follow up.').replace(/\{\{\s*ref\s*\}\}/gi, reference),
      };
    },
  };
}

module.exports = { buildCustomTool, normalizeCustomConfig };

const { executeWebhookTool } = require('../../tools/WebhookToolExecutor');

/**
 * Registry of every tool the WhatsApp LLM is allowed to call.
 * The schemas returned by getAllSchemas() are the only tools the model ever
 * sees, and the executor refuses any name that is not registered here.
 */
class WhatsAppToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  /**
   * @param {{name:string, description:string, category?:string, parameters?:object,
   *          handler?:(args:object, ctx:object)=>Promise<object>, webhook?:object}} def
   */
  register(def) {
    if (!def?.name) throw new Error('Tool name is required');
    this._tools.set(def.name, {
      category: 'general',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      ...def,
    });
    return this;
  }

  registerWebhook(name, schema, config) {
    const fn = schema?.function || {};
    return this.register({
      name,
      category: 'webhook',
      description: fn.description || config?.description || `Webhook tool ${name}`,
      parameters: fn.parameters || schema?.parameters || { type: 'object', properties: {} },
      webhook: config,
    });
  }

  remove(name) { this._tools.delete(name); return this; }
  has(name) { return this._tools.has(name); }
  get(name) { return this._tools.get(name) || null; }
  isWebhook(name) { return Boolean(this._tools.get(name)?.webhook); }
  names() { return [...this._tools.keys()]; }

  list() {
    return [...this._tools.values()].map(({ name, description, category }) => ({ name, description, category }));
  }

  /** OpenAI function-calling schemas for the currently registered tools. */
  getAllSchemas() {
    return [...this._tools.values()].map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  /** Returns an error message when args do not satisfy the tool's required fields, else null. */
  validate(name, args) {
    const tool = this._tools.get(name);
    if (!tool) return `Tool "${name}" is not available`;
    const params = tool.parameters || {};
    const missing = (params.required || []).filter((key) => args?.[key] === undefined || args[key] === null || args[key] === '');
    if (missing.length) return `Missing required argument(s): ${missing.join(', ')}`;
    for (const [key, spec] of Object.entries(params.properties || {})) {
      const value = args?.[key];
      if (value === undefined || value === null) continue;
      if (spec.enum && !spec.enum.includes(value)) return `Invalid value for "${key}". Allowed: ${spec.enum.join(', ')}`;
    }
    return null;
  }

  async execute(name, args, ctx) {
    const tool = this._tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" is not available`);
    if (tool.webhook) return executeWebhookTool(tool.webhook, args);
    return tool.handler(args || {}, ctx);
  }
}

module.exports = { WhatsAppToolRegistry };

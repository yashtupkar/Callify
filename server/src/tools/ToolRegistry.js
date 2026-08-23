/**
 * ToolRegistry
 *
 * Central registry for every tool the LLM can call during a conversation.
 *
 * Three categories:
 *  - BUILT_IN  : server-side tools with a real executor function.
 *                Registered via registerBuiltIn().
 *  - WEBHOOK   : server-side tools that call external HTTP endpoints.
 *                Registered via registerWebhook().
 *  - CUSTOM    : frontend-routed tools with schema only (no server executor).
 *                Registered via registerCustom().
 *  - SYSTEM    : end_call, save_collected_data — managed specially by ToolExecutor.
 *                save_collected_data is injected here when dataToCollect is set.
 */

// Natural filler variants so the same line isn't replayed every call.
const DEFAULT_FILLERS = {
  save_collected_data: [
    "Got it, one sec while I save that...",
    "Perfect, let me note that down...",
    "Okay, saving that now...",
  ],
  generic: [
    "One moment...",
    "Just a sec...",
    "Let me look into that for you...",
  ],
};

class ToolRegistry {
  constructor() {
    // Map<toolName, { schema, executor, fillerKey }>
    this._builtIn = new Map();

    // Map<toolName, { schema, config }> — outbound HTTP webhook tools
    this._webhook = new Map();

    // Map<toolName, { schema }>
    this._custom = new Map();

    // Filler phrase pools
    this._fillers = { ...DEFAULT_FILLERS };
  }

  // ---------------------------------------------------------------------------
  // Registration API
  // ---------------------------------------------------------------------------

  /**
   * Register a server-side tool with a real executor.
   *
   * @param {string}   name        Tool name (must match schema function.name)
   * @param {object}   schema      OpenAI function-call schema object
   * @param {Function} executorFn  async (args) => result
   * @param {string}   [fillerKey] Key into filler pool ('generic' by default)
   */
  registerBuiltIn(name, schema, executorFn, fillerKey = 'generic') {
    this._builtIn.set(name, { schema, executor: executorFn, fillerKey });
  }

  /**
   * Register a frontend-routed tool (no server executor).
   *
   * @param {string} name   Tool name
   * @param {object} schema OpenAI function-call schema object
   */
  registerCustom(name, schema) {
    this._custom.set(name, { schema });
  }

  /**
   * Register a webhook-based tool (server calls external HTTP endpoint).
   *
   * @param {string} name        Tool name
   * @param {object} schema      OpenAI function-call schema object
   * @param {object} toolConfig  Full tool config (webhookUrl, method, headers, etc.)
   * @param {string} [fillerKey] Key into filler pool ('generic' by default)
   */
  registerWebhook(name, schema, toolConfig, fillerKey = 'generic') {
    this._webhook.set(name, { schema, config: toolConfig, fillerKey });
  }

  /**
   * Add extra filler phrases for a tool key.
   * @param {string}   key     Filler key
   * @param {string[]} phrases Array of phrase strings
   */
  registerFillers(key, phrases) {
    this._fillers[key] = [...(this._fillers[key] || []), ...phrases];
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  /** Returns true if the tool has a server-side executor registered. */
  isBuiltIn(name) {
    return this._builtIn.has(name);
  }

  /** Returns true if the tool is a webhook (outbound HTTP) tool. */
  isWebhook(name) {
    return this._webhook.has(name);
  }

  /** Returns the webhook tool config (url, method, headers). */
  getWebhookConfig(name) {
    return this._webhook.get(name)?.config || null;
  }

  /** Returns true if the tool is a frontend-routed custom tool. */
  isCustom(name) {
    return this._custom.has(name);
  }

  /**
   * Execute a built-in tool.
   * @param {string} name
   * @param {object} args
   * @returns {Promise<object>} result
   */
  async execute(name, args) {
    const entry = this._builtIn.get(name);
    if (!entry) throw new Error(`[ToolRegistry] No built-in executor for tool: ${name}`);
    return entry.executor(args);
  }

  /**
   * Returns a random filler phrase for the given tool (falls back to 'generic').
   * @param {string} name  Tool name or filler key
   * @returns {string}
   */
  getFiller(name) {
    const builtInEntry = this._builtIn.get(name);
    const webhookEntry = this._webhook.get(name);
    const key = (builtInEntry?.fillerKey) || (webhookEntry?.fillerKey) || name;
    const pool = this._fillers[key] || this._fillers.generic;
    return pool[Math.floor(Math.random() * pool.length)] + " ";
  }

  /**
   * Returns all tool schemas in OpenAI function-call format,
   * ready to be passed directly to the LLM.
   * Includes: built-ins + webhooks + customs + end_call (always last).
   */
  getAllSchemas() {
    const schemas = [];

    for (const { schema } of this._builtIn.values()) {
      schemas.push(schema);
    }

    for (const { schema } of this._webhook.values()) {
      schemas.push(schema);
    }

    for (const { schema } of this._custom.values()) {
      schemas.push(schema);
    }

    // end_call is always appended last
    schemas.push({
      type: "function",
      function: {
        name: "end_call",
        description: "Ends the current call. ONLY call this tool AFTER you have explicitly said a polite goodbye to the caller.",
      }
    });

    return schemas;
  }

  // ---------------------------------------------------------------------------
  // System tool injection
  // ---------------------------------------------------------------------------

  /**
   * Dynamically build and inject the save_collected_data tool.
   * Called by ConversationManager when config.dataToCollect is non-empty.
   *
   * The schema properties are generated from the provided field names so the
   * LLM always sees exactly the fields the operator configured — no hardcoded
   * name/email/phone assumptions.
   *
   * @param {string[]} fields  e.g. ['Name', 'Phone Number', 'Email']
   */
  /**
   * Remove the save_collected_data tool from the registry.
   * Called by ToolExecutor after a successful save so the LLM no longer
   * sees the tool in subsequent getAllSchemas() calls, preventing re-save loops.
   */
  removeDataCollectionTool() {
    this._builtIn.delete('save_collected_data');
  }

  injectDataCollectionTool(fields) {
    const properties = {};
    for (const field of fields) {
      const key = field.toLowerCase().replace(/\s+/g, '_');
      properties[key] = {
        type: "string",
        description: `The caller's ${field}.`
      };
    }

    const schema = {
      type: "function",
      function: {
        name: "save_collected_data",
        description:
          "Save the caller's information after collecting and confirming all required fields. " +
          "Only call this once every required field has been confirmed by the caller.",
        parameters: {
          type: "object",
          properties,
          required: Object.keys(properties),
          additionalProperties: false
        }
      }
    };

    // We don't use registerBuiltIn because save_collected_data is handled directly
    // by ToolExecutor due to its complex lifecycle (ending turn early).
    // So we just add the schema.
    this._builtIn.set('save_collected_data', { schema, fillerKey: 'save_collected_data' });
  }

  injectInternalCrmTools() {
    this._builtIn.set('internal_check_availability', {
      schema: {
        type: "function",
        function: {
          name: "internal_check_availability",
          description: "Check the agent's internal calendar for availability before booking.",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "The date to check (YYYY-MM-DD)." }
            },
            required: ["date"],
            additionalProperties: false
          }
        }
      },
      fillerKey: 'generic'
    });

    this._builtIn.set('internal_create_booking', {
      schema: {
        type: "function",
        function: {
          name: "internal_create_booking",
          description: "Book an appointment on the internal calendar. Only call this AFTER checking availability and confirming the slot with the caller.",
          parameters: {
            type: "object",
            properties: {
              startTime: { type: "string", description: "ISO 8601 start time (e.g. 2026-08-23T14:00:00+05:30)" },
              endTime: { type: "string", description: "ISO 8601 end time (e.g. 2026-08-23T15:00:00+05:30)" }
            },
            required: ["startTime", "endTime"],
            additionalProperties: false
          }
        }
      },
      fillerKey: 'generic'
    });
  }
}

module.exports = { ToolRegistry };

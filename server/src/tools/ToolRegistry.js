/**
 * ToolRegistry
 *
 * Central registry for every tool the LLM can call during a conversation.
 *
 * Three categories:
 *  - BUILT_IN  : server-side tools with a real executor function.
 *                Registered via registerBuiltIn().
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
    const entry = this._builtIn.get(name);
    const key = (entry && entry.fillerKey) || name;
    const pool = this._fillers[key] || this._fillers.generic;
    return pool[Math.floor(Math.random() * pool.length)] + " ";
  }

  /**
   * Returns all tool schemas in OpenAI function-call format,
   * ready to be passed directly to the LLM.
   * Includes: built-ins + customs + end_call (always last).
   */
  getAllSchemas() {
    const schemas = [];

    for (const { schema } of this._builtIn.values()) {
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
          required: Object.keys(properties)
        }
      }
    };

    // Register as built-in — ToolExecutor intercepts this before the executor
    // is called, but we provide a passthrough executor as a safe fallback.
    this._builtIn.set('save_collected_data', {
      schema,
      executor: async (args) => ({ success: true, data: args }),
      fillerKey: 'save_collected_data'
    });
  }
}

module.exports = { ToolRegistry };

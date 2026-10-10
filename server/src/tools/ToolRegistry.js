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
 *
 * Filler phrases are language-aware: getFiller(toolName, langCode) checks
 * for a language-specific pool (key: "toolName:baseLang") before falling
 * back to the English default. Add a new language by adding entries to
 * DEFAULT_FILLERS with the "toolName:langCode" key pattern.
 */

// ---------------------------------------------------------------------------
// Filler phrase pools
// Key convention: "toolName" (English default) or "toolName:langCode" (language-specific).
// baseLang is the first segment of BCP-47 (e.g. 'hi' from 'hi-IN').
// ---------------------------------------------------------------------------
const DEFAULT_FILLERS = {
  // English defaults
  'save_collected_data': [
    "Got it, one sec...",
    "Perfect, noting that down...",
    "Okay, saving that now...",
  ],
  'check_availability': [
    "Let me check the schedule...",
    "One sec, looking at the calendar...",
    "Just a moment, checking availability...",
  ],
  'create_booking': [
    "Booking that now, just a moment...",
    "One sec, locking that in...",
    "Just a moment, getting that booked...",
  ],
  'cancel_booking': [
    "One sec, cancelling that for you...",
    "Just a moment, taking care of that...",
  ],
  'reschedule_booking': [
    "One sec, moving that over...",
    "Just a moment, rescheduling that...",
  ],
  'get_bookings': [
    "Let me pull up your appointments...",
    "One sec, looking up your bookings...",
  ],
  'transfer_call': [
    "Please hold on a moment while I transfer you...",
    "One sec, I'll connect you right away...",
  ],
  'send_followup_email': [
    "Sending that over to your email now...",
    "One sec, I'm sending that to you right now...",
  ],
  'send_whatsapp': [
    "Sending that over to your WhatsApp now...",
    "One sec, I'm messaging that to your WhatsApp right now...",
  ],
  'get_pricing': [
    "Let me check the standard pricing for that...",
    "One moment while I pull up the rates...",
  ],
  'generic': [
    "One moment...",
    "Just a sec...",
    "Let me look into that for you...",
  ],

  // Hindi fillers
  'save_collected_data:hi': [
    "ठीक है, एक सेकंड...",
    "बस एक पल, सेव कर रही हूँ...",
  ],
  'check_availability:hi': [
    "एक सेकंड, शेड्यूल देख लेती हूँ...",
    "बस एक पल, कैलेंडर चेक कर रही हूँ...",
    "एक मिनट, अवेलेबिलिटी देखती हूँ...",
  ],
  'create_booking:hi': [
    "बस एक सेकंड, बुकिंग कर रही हूँ...",
    "ठीक है, अभी बुक कर देती हूँ...",
  ],
  'cancel_booking:hi': [
    "एक सेकंड, कैंसल कर रही हूँ...",
    "बस एक पल...",
  ],
  'reschedule_booking:hi': [
    "एक सेकंड, रिशेड्यूल कर रही हूँ...",
    "बस एक पल, अपॉइंटमेंट बदल रही हूँ...",
  ],
  'get_bookings:hi': [
    "एक सेकंड, आपकी अपॉइंटमेंट देख लेती हूँ...",
    "बस एक पल...",
  ],
  'transfer_call:hi': [
    "कृपया लाइन पर रहें, मैं कॉल ट्रांसफर कर रही हूँ...",
    "एक पल, मैं आपको कनेक्ट कर रही हूँ...",
  ],
  'send_followup_email:hi': [
    "मैं इसे आपके ईमेल पर भेज रही हूँ...",
    "एक सेकंड, मैं अभी भेज देती हूँ...",
  ],
  'send_whatsapp:hi': [
    "मैं इसे आपके व्हाट्सएप पर भेज रही हूँ...",
    "एक सेकंड, मैं अभी आपके व्हाट्सएप पर मैसेज कर देती हूँ...",
  ],
  'get_pricing:hi': [
    "मैं इसके लिए प्राइस चेक कर लेती हूँ...",
    "एक पल, मैं रेट्स देख रही हूँ...",
  ],
  'generic:hi': [
    "एक मिनट...",
    "बस एक पल...",
    "एक सेकंड...",
  ],
};


// Per-call cache of last-used filler index to avoid immediate repetition.
// Keyed by "langKey:callId" — but since each ToolRegistry instance lives for
// one call, a simple per-instance map suffices.
class ToolRegistry {
  constructor() {
    // Map<toolName, { schema, executor, fillerKey }>
    this._builtIn = new Map();

    // Map<toolName, { schema, config, fillerKey }> — outbound HTTP webhook tools
    this._webhook = new Map();

    // Map<toolName, { schema }> — frontend-routed tools
    this._custom = new Map();

    // Filler phrase pools (starts as a shallow copy of defaults so per-registry
    // additions don't bleed into other calls)
    this._fillers = { ...DEFAULT_FILLERS };

    // Per-registry last-used index map to avoid back-to-back repeats
    this._lastFillerIdx = {};
  }

  // ---------------------------------------------------------------------------
  // Registration API
  // ---------------------------------------------------------------------------

  /**
   * Register a server-side tool with a real executor.
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
   * @param {string} name   Tool name
   * @param {object} schema OpenAI function-call schema object
   */
  registerCustom(name, schema) {
    this._custom.set(name, { schema });
  }

  /**
   * Register a webhook-based tool (server calls external HTTP endpoint).
   * @param {string} name        Tool name
   * @param {object} schema      OpenAI function-call schema object
   * @param {object} toolConfig  Full tool config (webhookUrl, method, headers, etc.)
   * @param {string} [fillerKey] Key into filler pool ('generic' by default)
   */
  registerWebhook(name, schema, toolConfig, fillerKey = 'generic') {
    this._webhook.set(name, { schema, config: toolConfig, fillerKey });
  }

  /**
   * Add extra filler phrases for a tool key (or language-specific key).
   * @param {string}   key     Filler key (e.g. 'generic' or 'save_collected_data:hi')
   * @param {string[]} phrases Array of phrase strings
   */
  registerFillers(key, phrases) {
    this._fillers[key] = [...(this._fillers[key] || []), ...phrases];
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  isBuiltIn(name)  { return this._builtIn.has(name); }
  isWebhook(name)  { return this._webhook.has(name); }
  isCustom(name)   { return this._custom.has(name);  }

  /**
   * Remove a tool from every category it might live in. Safe to call for
   * tools that are not registered (no-op). Used by the WhatsApp runtime to
   * drop built-in CRM actions that are not enabled for a given automation.
   *
   * @param {string} name
   */
  remove(name) {
    this._builtIn.delete(name);
    this._webhook.delete(name);
    this._custom.delete(name);
  }

  getWebhookConfig(name) { return this._webhook.get(name)?.config || null; }

  async execute(name, args) {
    const entry = this._builtIn.get(name);
    if (!entry) throw new Error(`[ToolRegistry] No built-in executor for tool: ${name}`);
    return entry.executor(args);
  }

  /**
   * Returns a random filler phrase for the given tool and language.
   * Falls back: language-specific -> English default -> generic.
   *
   * @param {string} toolName   Tool name (or filler key)
   * @param {string} [langCode] BCP-47 language code (e.g. 'hi-IN')
   * @returns {string}  Filler phrase with a trailing space
   */
  getFiller(toolName, langCode = 'en') {
    const baseLang  = ((langCode || 'en').split('-')[0] || 'en').toLowerCase();
    const isEnglish = baseLang === 'en';

    // Resolve the filler key from the tool's registry entry
    const builtInEntry  = this._builtIn.get(toolName);
    const webhookEntry  = this._webhook.get(toolName);
    const baseKey       = (builtInEntry?.fillerKey) || (webhookEntry?.fillerKey) || toolName;

    // Try: language-specific key, then tool key, then generic:lang, then generic
    const candidates = isEnglish
      ? [baseKey, 'generic']
      : [`${baseKey}:${baseLang}`, baseKey, `generic:${baseLang}`, 'generic'];

    let pool;
    for (const key of candidates) {
      if (this._fillers[key] && this._fillers[key].length > 0) {
        pool = this._fillers[key];
        break;
      }
    }
    pool = pool || this._fillers.generic;

    // Pick avoiding back-to-back repeat
    const cacheKey = `${baseLang}:${baseKey}`;
    let idx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === this._lastFillerIdx[cacheKey]) {
      idx = (idx + 1) % pool.length;
    }
    this._lastFillerIdx[cacheKey] = idx;
    return pool[idx] + ' ';
  }

  /**
   * Returns all tool schemas in OpenAI function-call format.
   * Includes: built-ins + webhooks + customs + end_call (always last, unless excluded).
   * @param {object} options
   * @param {boolean} options.includeEndCall - Whether to include end_call tool (default: true)
   * @returns {object[]}
   */
  getAllSchemas({ includeEndCall = true } = {}) {
    const schemas = [];

    for (const { schema } of this._builtIn.values())  schemas.push(schema);
    for (const { schema } of this._webhook.values())  schemas.push(schema);
    for (const { schema } of this._custom.values())   schemas.push(schema);

    // Sort deterministically to maximize prompt cache hits
    schemas.sort((a, b) => a.function.name.localeCompare(b.function.name));

    // end_call is always last — appended here so it never accidentally gets
    // listed before action tools (model should complete the task before ending)
    if (includeEndCall) {
      schemas.push({
        type: "function",
        function: {
          name: "end_call",
          description: "Ends the conversation. Call this tool when you say goodbye to the caller.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false
          }
        },
        fillerKey: 'end_call'
      });
    }

    return schemas;
  }

  // ---------------------------------------------------------------------------
  // System tool injection
  // ---------------------------------------------------------------------------

  /**
   * Remove the save_collected_data tool from the registry after a successful
   * save, so the LLM never sees it again and cannot enter a save-loop.
   */
  removeDataCollectionTool() {
    this._builtIn.delete('save_collected_data');
  }

  /**
   * Dynamically build and inject the save_collected_data tool.
   * Schema properties are generated from the configured field names so the
   * LLM sees exactly what the operator set up.
   *
   * @param {string[]|object[]} fields  e.g. ['Name', 'Phone Number'] or [{label:'Name'}, ...]
   */
  injectDataCollectionTool(fields) {
    const properties = {};
    const required = [];
    const normalised = Array.isArray(fields)
      ? fields.map(f => (typeof f === 'string' ? f : f.label))
      : [String(fields)];

    for (const field of normalised) {
      const key = field.toLowerCase().replace(/\s+/g, '_');
      properties[key] = {
        type: "string",
        description: `The caller's ${field}. Must be spelled exactly as confirmed.`
      };
      required.push(key);
    }

    const schema = {
      type: "function",
      function: {
        name: "save_collected_data",
        description:
          "Save the caller's contact information to the CRM. " +
          "You MUST collect ALL required fields and get the caller's explicit confirmation before calling this. " +
          "NEVER pass empty strings or placeholders.",
        parameters: {
          type      : "object",
          properties,
          required,
          additionalProperties: false,
        }
      }
    };

    // We don't use registerBuiltIn because save_collected_data is handled
    // directly by ToolExecutor (complex lifecycle / re-prompt behaviour).
    this._builtIn.set('save_collected_data', { schema, fillerKey: 'save_collected_data' });

    // Inject record_field alongside it
    this._builtIn.set('record_field', {
      schema: {
        type: "function",
        function: {
          name: "record_field",
          description: "Silently record a single piece of collected caller information in the background.",
          parameters: {
            type: "object",
            properties: {
              field: {
                type: "string",
                description: "The name of the field collected (e.g. 'Name', 'Phone', 'Email')."
              },
              value: {
                type: "string",
                description: "The value of the field collected."
              }
            },
            required: ["field", "value"],
            additionalProperties: false
          }
        }
      },
      fillerKey: 'generic'
    });
  }

  /**
   * Inject the internal CRM tools into the registry.
   * These are always available and handle availability, booking,
   * retrieval, cancellation, and rescheduling.
   */
  injectInternalCrmTools() {
    this._builtIn.set('check_availability', {
      schema: {
        type: "function",
        function: {
          name: "check_availability",
          description:
            "Check the agent's calendar for available appointment slots on a given date. " +
            "ALWAYS call this before booking or answering any availability question — never guess or read from memory. " +
            "Returns available slots, booked slots, and working hours for that date.",
          parameters: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description:
                  "The date to check in YYYY-MM-DD format (e.g. 2026-09-05). " +
                  "Always resolve relative terms like 'today' or 'tomorrow' to the actual calendar date first."
              },
              time: {
                type: "string",
                description:
                  "Optional. A specific time to check in HH:MM 24-hour format (e.g. 15:00). " +
                  "Provide this when the caller has requested a particular time slot."
              },
            },
            required: ["date"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'check_availability',
    });

    this._builtIn.set('create_booking', {
      schema: {
        type: "function",
        function: {
          name: "create_booking",
          description:
            "Create a new appointment booking on the internal calendar. " +
            "PREREQUISITES (all must be true before calling): " +
            "(1) You have called check_availability and confirmed the slot is free. " +
            "(2) You have collected all required caller details and saved them via save_collected_data. " +
            "(3) You have read the details back to the caller and received explicit confirmation. " +
            "NEVER call this without all three prerequisites met.",
          parameters: {
            type: "object",
            properties: {
              startTime: {
                type: "string",
                description:
                  "ISO 8601 start time WITH timezone offset (e.g. 2026-09-05T14:00:00+05:30). " +
                  "Never use a bare timestamp without an offset."
              },
              endTime: {
                type: "string",
                description:
                  "ISO 8601 end time WITH timezone offset (e.g. 2026-09-05T15:00:00+05:30). " +
                  "Must be exactly one slot duration after startTime."
              },
            },
            required: ["startTime", "endTime"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'create_booking',
    });

    this._builtIn.set('get_bookings', {
      schema: {
        type: "function",
        function: {
          name: "get_bookings",
          description:
            "Retrieve the caller's upcoming confirmed appointments from the CRM. " +
            "Call this when a caller wants to cancel or reschedule — you need the bookingId before acting. " +
            "PREREQUISITE: You must have identified the caller via save_collected_data first.",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'get_bookings',
    });

    this._builtIn.set('cancel_booking', {
      schema: {
        type: "function",
        function: {
          name: "cancel_booking",
          description:
            "Cancel an existing appointment. " +
            "PREREQUISITES: (1) Call get_bookings to get the bookingId. " +
            "(2) Read the appointment details back to the caller and get explicit confirmation to cancel. " +
            "Never cancel without explicit verbal confirmation from the caller.",
          parameters: {
            type: "object",
            properties: {
              bookingId: {
                type: "string",
                description: "The CRM booking ID obtained from get_bookings. Never guess or fabricate this."
              },
            },
            required: ["bookingId"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'cancel_booking',
    });

    this._builtIn.set('reschedule_booking', {
      schema: {
        type: "function",
        function: {
          name: "reschedule_booking",
          description:
            "Reschedule an existing appointment to a new date and time. " +
            "PREREQUISITES: (1) Call get_bookings to get the bookingId. " +
            "(2) Call check_availability to confirm the new slot is free. " +
            "(3) Confirm the new time with the caller before calling this.",
          parameters: {
            type: "object",
            properties: {
              bookingId: {
                type: "string",
                description: "The CRM booking ID obtained from get_bookings."
              },
              startTime: {
                type: "string",
                description: "New ISO 8601 start time WITH timezone offset (e.g. 2026-09-07T10:00:00+05:30)."
              },
              endTime: {
                type: "string",
                description: "New ISO 8601 end time WITH timezone offset (e.g. 2026-09-07T11:00:00+05:30)."
              },
            },
            required: ["bookingId", "startTime", "endTime"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'reschedule_booking',
    });

    // New General / Sales Tools
    this._builtIn.set('transfer_call', {
      schema: {
        type: "function",
        function: {
          name: "transfer_call",
          description:
            "Transfer the caller to a human agent. Use this when the caller asks to speak to a human, or when a lead is highly qualified and ready to close.",
          parameters: {
            type: "object",
            properties: {
              department: {
                type: "string",
                description: "The department to transfer to (e.g. 'Sales', 'Support')."
              },
              reason: {
                type: "string",
                description: "A brief reason for the transfer."
              },
            },
            required: ["reason"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'transfer_call',
    });

    this._builtIn.set('send_followup_email', {
      schema: {
        type: "function",
        function: {
          name: "send_followup_email",
          description:
            "Send an email to the caller containing a brochure, summary, or pricing quotation. " +
            "PREREQUISITE: You must have collected their email address via save_collected_data first.",
          parameters: {
            type: "object",
            properties: {
              content_type: {
                type: "string",
                description: "What to send (e.g. 'brochure', 'pricing_quote', 'meeting_summary')."
              },
            },
            required: ["content_type"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'send_followup_email',
    });

    this._builtIn.set('send_whatsapp', {
      schema: {
        type: "function",
        function: {
          name: "send_whatsapp",
          description:
            "Send a WhatsApp message to the caller containing a booking confirmation, brochure, or summary. " +
            "PREREQUISITE: You must have collected their phone number via save_collected_data first.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The full text message to send to the user on WhatsApp."
              },
            },
            required: ["message"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'send_whatsapp',
    });

    this._builtIn.set('get_pricing', {
      schema: {
        type: "function",
        function: {
          name: "get_pricing",
          description:
            "Look up standard pricing information for a product or service. Always use this instead of guessing prices.",
          parameters: {
            type: "object",
            properties: {
              item_name: {
                type: "string",
                description: "The product or service name to check pricing for."
              },
            },
            required: ["item_name"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'get_pricing',
    });
  }

  /**
   * Inject the transcribe_media tool. Only used by WhatsApp (and any future
   * async-text) channels. Voice channels never see it because they don't
   * expose media before the LLM speaks.
   *
   * @param {Function} executor  async (args) => result where args = { mediaUrl?, providerMediaId?, mime, caption? }
   */
  injectTranscribeMediaTool(executor) {
    this._builtIn.set('transcribe_media', {
      schema: {
        type: "function",
        function: {
          name: "transcribe_media",
          description:
            "Inspect media (image, audio, or document) sent by the user. " +
            "Returns a textual description or transcript. " +
            "Call this whenever the user sends an image, voice note, audio, or document " +
            "instead of guessing what it contains.",
          parameters: {
            type: "object",
            properties: {
              providerMediaId: {
                type: "string",
                description: "The provider's media id (preferred). Pass this for Cloud API media."
              },
              mediaUrl: {
                type: "string",
                description: "Direct media URL (preferred for Ultramsg)."
              },
              mime: {
                type: "string",
                description: "MIME type, e.g. 'image/jpeg', 'audio/ogg', 'application/pdf'."
              },
              caption: {
                type: "string",
                description: "Caption the user wrote alongside the media, if any."
              }
            },
            required: ["mime"],
            additionalProperties: false,
          }
        }
      },
      fillerKey: 'generic',
      executor,
    });
  }
}

module.exports = { ToolRegistry };

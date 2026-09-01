/**
 * CallStateManager
 *
 * Tracks the current phase of a voice call and injects a small, lean context
 * snippet at the END of the message array just before each LLM call.
 *
 * WHY: The old architecture dumped all availability slots, booked times, and
 * working hours into the system prompt at call-start. The model then read that
 * stale snapshot and hallucinated: "Yes, 3 PM is free!" without calling any
 * tool. Separating WHAT the agent knows (tool call results, live transcript)
 * from HOW the agent behaves (static system prompt) eliminates this class of
 * hallucination entirely.
 *
 * WHAT GOES IN THE SYSTEM PROMPT  (static, never changes after call start):
 *   - Identity / persona
 *   - Tool calling protocol rules
 *   - Anti-assumption rules
 *   - Friendly confirmation protocol
 *   - Voice & conversation style
 *   - Language rules
 *   - Data collection flow
 *   - AI-generated conversation guidelines
 *   - Call closing rules
 *
 * WHAT GOES IN THE CONTEXT INJECTION  (this class, changes per turn):
 *   - Current date / time / timezone offset
 *   - Active phase reminder (Collecting / Confirming / Acting / Closing)
 *   - Missing fields reminder (if in COLLECTING phase)
 *
 * WHAT NEVER APPEARS IN EITHER PLACE (only ever in tool call results):
 *   - Available time slots
 *   - Booked appointments
 *   - Working hours
 *   - Booking IDs / Contact IDs
 *
 * Phases:
 *   GREETING   -> default on call start
 *   COLLECTING -> agent is gathering required fields from caller
 *   CONFIRMING -> all fields collected, waiting for caller "yes" before acting
 *   ACTING     -> a tool call is in progress / just completed
 *   CLOSING    -> primary request fulfilled, wrapping up
 */

class CallStateManager {
  /**
   * @param {object} opts
   * @param {string}   opts.timezone      - BCP-47 timezone string (e.g. 'Asia/Kolkata')
   * @param {string}   opts.language      - BCP-47 language code (e.g. 'en-US', 'hi-IN')
   * @param {string}   opts.businessName  - Business name shown in context reminder
   * @param {string[]} opts.dataFields    - Ordered list of field labels to collect (e.g. ['Name', 'Phone'])
   */
  constructor({ timezone, language, businessName, dataFields = [] } = {}) {
    this.timezone     = timezone     || 'UTC';
    this.language     = language     || 'en-US';
    this.businessName = businessName || 'the business';
    this.dataFields   = dataFields;  // labels as configured by the operator

    /** @type {'GREETING'|'COLLECTING'|'CONFIRMING'|'ACTING'|'CLOSING'} */
    this._phase = 'GREETING';

    /**
     * Collected field values keyed by normalised label
     * (lower-case, spaces replaced with underscores)
     * e.g. { name: 'John', phone_number: '9876543210' }
     */
    this._collected = {};
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  get phase() { return this._phase; }

  /**
   * Signal that the agent has started collecting required fields.
   * Transitions GREETING -> COLLECTING (no-op for any other phase).
   */
  startCollecting() {
    if (this._phase === 'GREETING') {
      this._phase = 'COLLECTING';
    }
  }

  /**
   * Record a field value collected from the caller.
   * If this is the last missing field, transitions COLLECTING -> CONFIRMING.
   *
   * @param {string} label - Field label (e.g. 'Phone Number')
   * @param {string} value - Collected value
   */
  markFieldCollected(label, value) {
    const key = _normaliseKey(label);
    this._collected[key] = value;
    if (this._phase === 'COLLECTING' && this._getMissingFields().length === 0) {
      this._phase = 'CONFIRMING';
    }
  }

  /**
   * Called by ToolExecutor after a tool result is appended to the transcript.
   * Drives phase transitions based on which tool just completed.
   *
   * @param {string} toolName
   * @param {object} result  - Parsed tool result object
   */
  onToolResult(toolName, result) {
    switch (toolName) {
      case 'save_collected_data':
        if (result && result.success !== false) this._phase = 'ACTING';
        break;

      case 'internal_create_booking':
      case 'internal_cancel_booking':
      case 'internal_reschedule_booking':
        if (result && result.success === true) this._phase = 'CLOSING';
        break;

      case 'internal_check_availability':
        // Stay in current phase — model responds with the availability data
        break;

      default:
        // Custom / webhook tools: if they succeed we stay in ACTING
        if (result && result.success === true && this._phase !== 'CLOSING') {
          this._phase = 'ACTING';
        }
    }
  }

  /**
   * Returns an array of field labels that have not yet been collected.
   * @returns {string[]}
   */
  getMissingFields() {
    return this._getMissingFields();
  }

  /**
   * Returns a lean {role:'system', content:...} message to be appended to the
   * message array AFTER the conversation transcript, just before the LLM call.
   * The model sees it as the most recent instruction and acts accordingly.
   *
   * @returns {{ role: 'system', content: string }}
   */
  getContextInjection() {
    const dateStr  = this._formatCurrentDate();
    const tzOffset = this._getTzOffset();

    let phaseNote = '';
    switch (this._phase) {
      case 'GREETING':
        phaseNote = 'Greet the caller warmly and find out how you can help.';
        break;

      case 'COLLECTING': {
        const missing = this._getMissingFields();
        phaseNote = missing.length > 0
          ? `Still need from caller: ${missing.join(', ')}. Ask for ONE field at a time.`
          : 'All fields collected — you should now be in CONFIRMING phase.';
        break;
      }

      case 'CONFIRMING':
        phaseNote = 'You have ALL required details. Read them back in ONE natural sentence and wait for the caller to confirm before calling any action tool.';
        break;

      case 'ACTING':
        phaseNote = 'A tool call just completed. Report the result accurately from the tool response only. Do NOT add, infer, or assume anything beyond what the tool returned.';
        break;

      case 'CLOSING':
        phaseNote = "Primary request is done. Ask if there is anything else, then say goodbye and call end_call in the SAME turn — don't wait for another reply.";
        break;
    }

    const content =
      `[RUNTIME — ${dateStr} | TZ: ${this.timezone} (${tzOffset}) | Phase: ${this._phase}]\n${phaseNote}`;

    return { role: 'system', content };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _getMissingFields() {
    return this.dataFields.filter(label => {
      const key = _normaliseKey(label);
      const val = this._collected[key];
      return !val || String(val).trim() === '';
    });
  }

  _formatCurrentDate() {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone : this.timezone,
        weekday  : 'long',
        year     : 'numeric',
        month    : 'long',
        day      : 'numeric',
        hour     : 'numeric',
        minute   : 'numeric',
        hour12   : true,
      }).format(new Date());
    } catch (e) {
      return new Date().toUTCString();
    }
  }

  _getTzOffset() {
    try {
      const now     = new Date();
      const utcMs   = new Date(now.toLocaleString('en-US', { timeZone: 'UTC'        })).getTime();
      const localMs = new Date(now.toLocaleString('en-US', { timeZone: this.timezone })).getTime();
      const diffMs  = localMs - utcMs;
      const sign    = diffMs >= 0 ? '+' : '-';
      const absMs   = Math.abs(diffMs);
      const h       = String(Math.floor(absMs / 3600000)).padStart(2, '0');
      const m       = String(Math.floor((absMs % 3600000) / 60000)).padStart(2, '0');
      return `${sign}${h}:${m}`;
    } catch (e) {
      return '+00:00';
    }
  }
}

/** Normalise a field label to a consistent map key. */
function _normaliseKey(label) {
  return String(label).toLowerCase().replace(/\s+/g, '_');
}

module.exports = { CallStateManager };

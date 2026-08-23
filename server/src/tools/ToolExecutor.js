const { executeWebhookTool } = require('./WebhookToolExecutor');
const { dbService } = require('../services/DatabaseService');

/**
 * ToolExecutor
 *
 * Handles the full lifecycle of a tool call emitted by the LLM:
 *
 *  1. Receives (toolName, args) from the LLM 'tool_call' event.
 *  2. Plays a filler phrase over TTS to mask processing latency.
 *  3. Routes to the correct handler:
 *       - end_call           → ends the conversation after a short delay
 *       - save_collected_data → saves data to DB, adds transcript entries, re-prompts LLM
 *       - built-in tool       → executes via ToolRegistry, adds transcript entries, re-prompts LLM
 *       - custom tool         → appends tool_call to transcript, forwards to frontend via sendToClient
 *
 * ConversationManager wires this up once and delegates the entire
 * tool_call event to: this.toolExecutor.handle(toolName, args)
 */

class ToolExecutor {
  /**
   * @param {object}   opts
   * @param {import('./ToolRegistry').ToolRegistry} opts.registry
   * @param {object}   opts.tts             - TTS provider (feedText / flush)
   * @param {object}   opts.llm             - LLM service (generateResponse)
   * @param {Array}    opts.transcript      - Shared transcript array (mutated in-place)
   * @param {Function} opts.sendToClient    - (msg) => void
   * @param {Function} opts.endConversation - () => void
   * @param {object}   opts.usageTracker    - UsageTracker instance
   */
  constructor({ registry, tts, llm, transcript, sendToClient, endConversation, usageTracker }) {
    this.registry        = registry;
    this.tts             = tts;
    this.llm             = llm;
    this.transcript      = transcript;
    this.sendToClient    = sendToClient;
    this.endConversation = endConversation;
    this.usageTracker    = usageTracker;
    // Guard: prevent save_collected_data from being executed more than once per call
    this._dataSaved      = false;
    this.agentId         = null;
  }

  /**
   * Main entry point — called from ConversationManager's tool_call listener.
   *
   * @param {string} toolName
   * @param {object} args
   */
  async handle(toolName, args, preamble, llmToolCallId) {
    console.log(`[ToolExecutor] Tool called: ${toolName}`, args);
    this.usageTracker.incrementToolCall();

    // Send preamble to UI
    if (preamble && preamble.trim()) {
      this.sendToClient({ event: 'transcript', data: { text: preamble.trim(), isFinal: true, speaker: 'agent' } });
    }

    // -------------------------------------------------------------------------
    // SYSTEM: end_call
    // -------------------------------------------------------------------------
    if (toolName === 'end_call') {
      console.log('[ToolExecutor] Queuing end of conversation after TTS finishes.');
      
      let ended = false;
      const doEnd = () => {
        if (ended) return;
        ended = true;
        this.sendToClient({ event: 'stop' });
        this.endConversation();
      };

      // End immediately after final speech, with a 1s grace buffer
      this.tts.once('utterance_complete', () => {
        setTimeout(doEnd, 1000);
      });

      // Fallback: if TTS never fires (e.g. agent ended silently), 
      // force-end after 6 seconds so the call doesn't hang open
      setTimeout(doEnd, 6000);
      return;
    }

    // -------------------------------------------------------------------------
    // SYSTEM: save_collected_data
    // -------------------------------------------------------------------------
    if (toolName === 'save_collected_data') {
      // Guard: ignore duplicate calls within the same conversation
      if (this._dataSaved) {
        console.warn('[ToolExecutor] save_collected_data called again — already saved. Ignoring duplicate.');
        return;
      }
      this._dataSaved = true;

      console.log('[ToolExecutor] Data successfully collected:', args);
      
      // Save to Native CRM Database
      if (this.agentId) {
        try {
          // Extract known fields (case insensitive)
          const nameKey = Object.keys(args).find(k => k.toLowerCase() === 'name');
          const emailKey = Object.keys(args).find(k => k.toLowerCase() === 'email');
          const phoneKey = Object.keys(args).find(k => k.toLowerCase() === 'phone');
          
          const name = nameKey ? String(args[nameKey]) : null;
          const email = emailKey ? String(args[emailKey]) : null;
          const phone = phoneKey ? String(args[phoneKey]) : null;

          // Put everything else in metadata
          const metadata = { ...args };
          if (nameKey) delete metadata[nameKey];
          if (emailKey) delete metadata[emailKey];
          if (phoneKey) delete metadata[phoneKey];

          const contact = await dbService.prisma.contact.create({
            data: {
              agentId: this.agentId,
              name,
              email,
              phone,
              metadata
            }
          });
          
          // Save contactId on this class instance for later tools (e.g. booking)
          this.currentContactId = contact.id;
          console.log('[ToolExecutor] Native CRM: Saved Contact ID', contact.id);
        } catch (dbErr) {
          console.error('[ToolExecutor] Error saving to Native CRM:', dbErr);
        }
      }

      // Remove the tool from the registry so the LLM never sees it again
      // and cannot enter a save → re-prompt → save loop.
      this.registry.removeDataCollectionTool();

      // Play filler to mask latency
      this._playFiller(toolName);

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);

      // Immediately resolve so the LLM can continue
      this._appendToolResult(toolName, toolCallId, {
        success: true,
        message: "Data saved successfully. You may now proceed with the caller's primary request."
      });

      this._rePromptLLM();
      return;
    }

    // -------------------------------------------------------------------------
    // INTERNAL CRM TOOLS
    // -------------------------------------------------------------------------
    if (toolName === 'internal_check_availability') {
      this._playFiller(toolName);
      let result;
      try {
        if (!this.agentId) throw new Error("Agent ID is missing.");
        const date = new Date(args.date);
        const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
        
        const availability = await dbService.prisma.availability.findUnique({
          where: { agentId_dayOfWeek: { agentId: this.agentId, dayOfWeek } }
        });

        if (!availability || !availability.isActive) {
          result = { available: false, reason: "The agent does not work on this day." };
        } else {
          // Fetch existing bookings for that day
          const startOfDay = new Date(date);
          startOfDay.setHours(0,0,0,0);
          const endOfDay = new Date(date);
          endOfDay.setHours(23,59,59,999);

          const bookings = await dbService.prisma.booking.findMany({
            where: {
              agentId: this.agentId,
              startTime: { gte: startOfDay, lte: endOfDay },
              status: 'confirmed'
            }
          });

          result = {
            available: true,
            workingHours: { start: availability.startTime, end: availability.endTime },
            existingBookings: bookings.map(b => ({
              start: b.startTime.toISOString(),
              end: b.endTime.toISOString()
            }))
          };
        }
      } catch (err) {
        console.error('[ToolExecutor] Error in internal_check_availability:', err);
        result = { error: err.message };
      }
      
      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      this._rePromptLLM();
      return;
    }

    if (toolName === 'internal_create_booking') {
      this._playFiller(toolName);
      let result;
      try {
        if (!this.agentId) throw new Error("Agent ID is missing.");
        if (!this.currentContactId) {
          result = { success: false, error: "No contact ID found. You must collect and save the user's data using save_collected_data first!" };
        } else {
          const booking = await dbService.prisma.booking.create({
            data: {
              agentId: this.agentId,
              contactId: this.currentContactId,
              startTime: new Date(args.startTime),
              endTime: new Date(args.endTime),
              status: 'confirmed'
            }
          });
          result = { success: true, bookingId: booking.id, message: "Appointment successfully booked in the internal CRM!" };
        }
      } catch (err) {
        console.error('[ToolExecutor] Error in internal_create_booking:', err);
        result = { error: err.message };
      }

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      this._rePromptLLM();
      return;
    }

    // -------------------------------------------------------------------------
    // BUILT-IN: server-side tool with executor
    // -------------------------------------------------------------------------
    if (this.registry.isBuiltIn(toolName)) {
      this._playFiller(toolName);

      let result;
      try {
        result = await this.registry.execute(toolName, args);
      } catch (err) {
        console.error(`[ToolExecutor] Error executing built-in tool ${toolName}:`, err);
        result = { error: err.message };
      }

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      this._rePromptLLM();
      return;
    }

    // -------------------------------------------------------------------------
    // WEBHOOK: outbound HTTP tool (Cal.com, Google Sheets, Zapier, etc.)
    // -------------------------------------------------------------------------
    if (this.registry.isWebhook(toolName)) {
      console.log(`[ToolExecutor] Executing webhook tool "${toolName}"`);
      this._playFiller(toolName);

      const webhookConfig = this.registry.getWebhookConfig(toolName);
      let result;
      try {
        result = await executeWebhookTool(webhookConfig, args);
      } catch (err) {
        console.error(`[ToolExecutor] Webhook tool "${toolName}" failed:`, err.message);
        result = { 
          success: false, 
          error: err.message,
          message: 'The external service is currently unavailable. Please let the caller know and offer an alternative.'
        };
      }

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);
      this._appendToolResult(toolName, toolCallId, result);
      this._rePromptLLM();
      return;
    }

    // -------------------------------------------------------------------------
    // CUSTOM: frontend-routed tool
    // -------------------------------------------------------------------------
    if (this.registry.isCustom(toolName)) {
      console.log(`[ToolExecutor] Routing custom tool "${toolName}" to frontend.`);
      this._playFiller('generic');

      const toolCallId = this._appendToolCall(toolName, args, preamble, llmToolCallId);

      this.sendToClient({
        event: 'tool_execution_request',
        toolName,
        args,
        toolCallId
      });
      return;
    }

    // -------------------------------------------------------------------------
    // UNKNOWN tool — log and ignore (avoid silent failures)
    // -------------------------------------------------------------------------
    console.warn(`[ToolExecutor] Unknown tool "${toolName}" — not in registry. Ignoring.`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Append an assistant tool_call message to the transcript. Returns the toolCallId. */
  _appendToolCall(toolName, args, preamble, llmToolCallId) {
    const toolCallId = llmToolCallId || ("call_" + Math.random().toString(36).substring(7));
    this.transcript.push({
      role: 'assistant',
      content: preamble || null,
      tool_calls: [{
        id: toolCallId,
        type: "function",
        function: { name: toolName, arguments: JSON.stringify(args) }
      }]
    });
    return toolCallId;
  }

  /** Append a tool result message to the transcript. */
  _appendToolResult(toolName, toolCallId, result) {
    this.transcript.push({
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: JSON.stringify(result)
    });
  }

  /** Play a filler phrase over TTS to mask latency. */
  _playFiller(toolName) {
    const phrase = this.registry.getFiller(toolName);
    this.tts.feedText(phrase);
    this.tts.flush();
  }

  /** Ask the LLM to generate the next response based on the updated transcript. */
  _rePromptLLM() {
    this.llm.generateResponse(this.transcript, this.registry.getAllSchemas());
  }
}

module.exports = { ToolExecutor };

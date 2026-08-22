/**
 * ToolExecutor
 *
 * Handles the full lifecycle of a tool call emitted by the LLM:
 *
 *  1. Receives (toolName, args) from the LLM 'tool_call' event.
 *  2. Plays a filler phrase over TTS to mask processing latency.
 *  3. Routes to the correct handler:
 *       - end_call           → ends the conversation after a short delay
 *       - save_collected_data → saves data, adds transcript entries, re-prompts LLM
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
  }

  /**
   * Main entry point — called from ConversationManager's tool_call listener.
   *
   * @param {string} toolName
   * @param {object} args
   */
  async handle(toolName, args) {
    console.log(`[ToolExecutor] Tool called: ${toolName}`, args);
    this.usageTracker.incrementToolCall();

    // -------------------------------------------------------------------------
    // SYSTEM: end_call
    // -------------------------------------------------------------------------
    if (toolName === 'end_call') {
      console.log('[ToolExecutor] Ending conversation.');
      setTimeout(() => {
        this.sendToClient({ event: 'stop' });
        this.endConversation();
      }, 5000);
      return;
    }

    // -------------------------------------------------------------------------
    // SYSTEM: save_collected_data
    // -------------------------------------------------------------------------
    if (toolName === 'save_collected_data') {
      console.log('[ToolExecutor] Data successfully collected:', args);

      // Play filler to mask latency
      this._playFiller(toolName);

      const toolCallId = this._appendToolCall(toolName, args);

      // Immediately resolve so the LLM can continue
      this._appendToolResult(toolName, toolCallId, {
        success: true,
        message: "Data saved successfully. You may now proceed with the caller's primary request."
      });

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

      const toolCallId = this._appendToolCall(toolName, args);
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

      const toolCallId = this._appendToolCall(toolName, args);

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
  _appendToolCall(toolName, args) {
    const toolCallId = "call_" + Math.random().toString(36).substring(7);
    this.transcript.push({
      role: 'assistant',
      content: null,
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

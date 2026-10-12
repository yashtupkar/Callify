/**
 * Executes tool calls requested by the WhatsApp LLM.
 * Only tools present in the registry run. Any other name (hallucinated or
 * disabled) gets an error result so the model can recover without side effects.
 */
class WhatsAppToolExecutor {
  constructor({ registry, llm, transcript, getRecentTranscript, onToolEvent, maxRoundsPerTurn = 6, logger, automationId, sessionId, contactWaId }) {
    this.registry = registry;
    this.llm = llm;
    this.transcript = transcript;
    this.getRecentTranscript = getRecentTranscript;
    this.onToolEvent = onToolEvent || (() => {});
    this.maxRoundsPerTurn = maxRoundsPerTurn;
    this.rounds = 0;
    this.logger = logger;
    this.automationId = automationId;
    this.sessionId = sessionId;
    this.contactWaId = contactWaId;
    // Conversation context handed to every tool handler.
    this.context = {
      transcript,
      getRecentTranscript,
      automationId,
      sessionId,
      contactWaId,
    };
  }

  resetTurn() { this.rounds = 0; }

  async handle(toolName, args, preamble, llmToolCallId, shouldReprompt = true) {
    const callId = llmToolCallId || `call_${Math.random().toString(36).slice(2, 10)}`;
    let result;
    const problem = this.registry.validate(toolName, args);
    if (problem) {
      const available = this.registry.names().join(', ');
      console.warn(`[WhatsAppToolExecutor] Rejected "${toolName}": ${problem}`);
      result = {
        success: false,
        error: problem,
        message: this.registry.has(toolName)
          ? 'Fix the arguments or ask the customer for the missing information.'
          : `Do not call this tool. Only these tools exist: ${available || 'none'}. Answer the customer without it.`,
      };
    } else {
      try {
        result = await this.registry.execute(toolName, args, this.context);
      } catch (error) {
        console.error(`[WhatsAppToolExecutor] "${toolName}" failed:`, error.message);
        result = { success: false, error: error.message, message: 'The action failed. Do not claim it succeeded.' };
      }
    }

    // Push the call and its result together so a message arriving while the tool
    // ran can never land between them.
    this.transcript.push(
      {
        role: 'assistant',
        content: preamble || null,
        tool_calls: [{ id: callId, type: 'function', function: { name: toolName, arguments: JSON.stringify(args || {}) } }],
      },
      { role: 'tool', tool_call_id: callId, name: toolName, content: JSON.stringify(result) },
    );
    this.onToolEvent({ toolName, args, result, ok: result?.success !== false && !result?.error });

    // Log tool call to automation logs
    if (this.logger && this.automationId) {
      try {
        await this.logger.info('tool', 'tool_call', `Tool "${toolName}" executed`, {
          toolName,
          args,
          result: result?.success !== false ? 'success' : 'error',
          error: result?.error,
          callId,
          sessionId: this.sessionId,
          contactWaId: this.contactWaId,
        });
      } catch (logError) {
        console.error('[WhatsAppToolExecutor] Failed to log tool call:', logError.message);
      }
    }

    if (!shouldReprompt) return;
    this.rounds += 1;
    const shouldHaltTools = this._shouldHaltToolTurn(result);
    const exhausted = this.rounds > this.maxRoundsPerTurn || shouldHaltTools;
    return this.llm.generateResponse(
      this.getRecentTranscript(),
      exhausted ? [] : this.registry.getAllSchemas(),
      exhausted ? 'none' : 'auto',
      null,
      false,
    );
  }

  _shouldHaltToolTurn(resultOrResults) {
    const list = Array.isArray(resultOrResults) ? resultOrResults : [resultOrResults];
    for (const item of list) {
      let res = item;
      if (item && typeof item === 'object' && item.role === 'tool') {
        try {
          res = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
        } catch (_) {
          res = {};
        }
      }
      if (!res) continue;
      // If error requires customer interaction, do not re-run tools in this turn
      const confirmationOrFieldErrors = [
        'NOT_CONFIRMED',
        'NEED_USER_CONFIRMATION',
        'UNPROVIDED_CUSTOMER_DETAILS',
        'MISSING_REQUIRED_FIELDS',
      ];
      if (confirmationOrFieldErrors.includes(res.error)) {
        return true;
      }
      // If tool failed completely, halt to prevent repeated failed attempts in a single turn
      if (res.success === false && res.error) {
        return true;
      }
    }
    return false;
  }

  async handleBatch(calls = [], preamble = '') {
    if (!calls.length) return;

    const validatedCalls = [];
    const results = [];

    // 1. Process all calls in this turn
    for (const call of calls) {
      if (!call.name) continue;
      const callId = call.id || `call_${Math.random().toString(36).slice(2, 10)}`;
      let args = {};
      try {
        args = typeof call.argsStr === 'string' && call.argsStr.trim() ? JSON.parse(call.argsStr) : (call.args || {});
      } catch (err) {
        console.error('[WhatsAppToolExecutor] Invalid arguments:', err.message);
      }

      let result;
      const problem = this.registry.validate(call.name, args);
      if (problem) {
        const available = this.registry.names().join(', ');
        console.warn(`[WhatsAppToolExecutor] Rejected "${call.name}": ${problem}`);
        result = {
          success: false,
          error: problem,
          message: this.registry.has(call.name)
            ? 'Fix the arguments or ask the customer for the missing information.'
            : `Do not call this tool. Only these tools exist: ${available || 'none'}. Answer the customer without it.`,
        };
      } else {
        try {
          result = await this.registry.execute(call.name, args, this.context);
        } catch (error) {
          console.error(`[WhatsAppToolExecutor] "${call.name}" failed:`, error.message);
          result = { success: false, error: error.message, message: 'The action failed. Do not claim it succeeded.' };
        }
      }

      validatedCalls.push({
        id: callId,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(args) },
      });

      results.push({
        role: 'tool',
        tool_call_id: callId,
        name: call.name,
        content: JSON.stringify(result),
      });

      this.onToolEvent({ toolName: call.name, args, result, ok: result?.success !== false && !result?.error });

      if (this.logger && this.automationId) {
        this.logger.info('tool', 'tool_call', `Tool "${call.name}" executed`, {
          toolName: call.name,
          args,
          result: result?.success !== false ? 'success' : 'error',
          error: result?.error,
          callId,
          sessionId: this.sessionId,
          contactWaId: this.contactWaId,
        }).catch(() => {});
      }
    }

    // 2. Push SINGLE assistant turn with all tool_calls, followed by all matching tool results
    this.transcript.push(
      {
        role: 'assistant',
        content: preamble || null,
        tool_calls: validatedCalls,
      },
      ...results,
    );

    // 3. Single re-prompt after all tools execute
    this.rounds += 1;
    const shouldHaltTools = this._shouldHaltToolTurn(results);
    const exhausted = this.rounds > this.maxRoundsPerTurn || shouldHaltTools;
    return this.llm.generateResponse(
      this.getRecentTranscript(),
      exhausted ? [] : this.registry.getAllSchemas(),
      exhausted ? 'none' : 'auto',
      null,
      false,
    );
  }
}

module.exports = { WhatsAppToolExecutor };

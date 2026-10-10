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
    this.context = {};
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
    // Stop endless tool loops: after the budget the model must answer in text.
    const exhausted = this.rounds > this.maxRoundsPerTurn;
    this.llm.generateResponse(
      this.getRecentTranscript(),
      exhausted ? [] : this.registry.getAllSchemas(),
      exhausted ? 'none' : 'auto',
    );
  }
}

module.exports = { WhatsAppToolExecutor };

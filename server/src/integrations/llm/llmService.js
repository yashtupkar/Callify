const EventEmitter = require('events');
const { OpenAI } = require('openai');

class LLMService extends EventEmitter {
  constructor() {
    super();
    // Use OpenRouter if key is present, otherwise fallback to OpenAI
    this.client = new OpenAI({
      baseURL: process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined,
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    });
    this.systemPrompt = "You are a helpful AI conversational agent.";
    this.model = process.env.VOICE_LLM_MODEL || "openai/gpt-4o-mini";
    this.temperature = 0.7;
    this.generationId = 0; // Incremented to cancel in-flight generations
  }

  initialize({ systemPrompt, model, temperature } = {}) {
    if (systemPrompt) this.systemPrompt = systemPrompt;
    if (model) this.model = model;
    if (typeof temperature === 'number') this.temperature = temperature;
  }

  cancel() {
    this.generationId++;
  }

  // Streams one completion turn.
  // Emits: llm_token(token), llm_reply_complete(fullReply), llm_tool_calls(calls, partialReply), llm_error(err)
  async generateResponse(transcript, tools = []) {
    const genId = ++this.generationId;
    try {
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...transcript
      ];

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        stream: true,
        tools: tools.length > 0 ? tools : undefined,
      });

      let fullReply = "";
      // Accumulate streamed tool call fragments keyed by index
      const toolCallAcc = {};
      let finishReason = null;

      for await (const chunk of stream) {
        if (genId !== this.generationId) return; // cancelled (new user turn)
        const choice = chunk.choices[0];
        if (!choice) continue;

        const deltaToolCalls = choice.delta?.tool_calls;
        if (deltaToolCalls) {
          for (const tc of deltaToolCalls) {
            const idx = tc.index ?? 0;
            if (!toolCallAcc[idx]) {
              toolCallAcc[idx] = { id: tc.id || `call_${idx}`, type: 'function', function: { name: '', arguments: '' } };
            }
            if (tc.id) toolCallAcc[idx].id = tc.id;
            if (tc.function?.name) toolCallAcc[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallAcc[idx].function.arguments += tc.function.arguments;
          }
        }

        const content = choice.delta?.content;
        if (content) {
          fullReply += content;
          this.emit('llm_token', content);
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      if (genId !== this.generationId) return;

      const toolCalls = Object.keys(toolCallAcc)
        .sort((a, b) => a - b)
        .map((k) => toolCallAcc[k]);

      if (toolCalls.length > 0 || finishReason === 'tool_calls') {
        this.emit('llm_tool_calls', toolCalls, fullReply);
      } else {
        this.emit('llm_reply_complete', fullReply);
      }
    } catch (error) {
      if (genId !== this.generationId) return;
      console.error("[LLMService] Error generating response:", error);
      this.emit('llm_error', error);
    }
  }
}

module.exports = { LLMService };

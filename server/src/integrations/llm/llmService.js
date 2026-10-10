const EventEmitter = require('events');
const { OpenAI } = require('openai');
const { LLMProvider } = require('../ProviderInterfaces');

class LLMService extends LLMProvider {
  constructor() {
    super();
    this.client = new OpenAI({
      baseURL: process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined,
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    });
    this.systemPrompt = "You are a helpful AI conversational agent.";
    this.model = process.env.VOICE_LLM_MODEL || "openai/gpt-4o-mini";
    this.enableJsonMode = false;
  }

  setJsonMode(enabled) {
    this.enableJsonMode = enabled;
  }

  initialize(systemPrompt) {
    if (systemPrompt) {
      this.systemPrompt = systemPrompt;
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Generate a streaming LLM response.
   *
   * @param {object[]} transcript - Conversation history (user/assistant/tool messages)
   * @param {object[]} tools      - OpenAI function-call tool schemas
   * @param {string}   toolChoice - 'auto' | 'required' | 'none' (default: 'auto')
   *   - 'auto'     : model decides whether to call a tool or respond in text (normal turns)
   *   - 'required' : force the model to call a tool (used after partial workflows where
   *                  the next step MUST be a tool call, e.g. after confirming details)
   *   - 'none'     : disable tool calling for this turn (e.g. closing turns)
   * @param {object|null} contextInjection - Optional extra {role:'system', content:...}
   *   appended after the transcript so the model sees it as the freshest instruction.
   *   Used by CallStateManager to inject per-turn phase/context without modifying the
   *   static system prompt.
   */
  async generateResponse(transcript, tools = [], toolChoice = 'auto', contextInjection = null) {
    try {
      this.abort();
      this.abortController = new AbortController();

      const systemMessage = { role: 'system', content: this.systemPrompt };
      // Explicit cache_control for Anthropic via OpenRouter; ignored by OpenAI
      systemMessage.cache_control = { type: "ephemeral" };

      // Build the messages array:
      //   [system prompt] + [transcript] + [optional per-turn context injection]
      const messages = [
        systemMessage,
        ...transcript,
        ...(contextInjection ? [contextInjection] : []),
      ];

      const model = this.model || process.env.VOICE_LLM_MODEL || "openai/gpt-4o-mini";

      const options = {
        model,
        messages,
        // Lower temperature reduces hallucination of tool arguments and
        // keeps responses focused; 0.5 still allows natural variation in phrasing.
        temperature      : 0.5,
        stream           : true,
        stream_options   : { include_usage: true },
      };

      if (tools && tools.length > 0) {
        options.tools       = tools;
        options.tool_choice = toolChoice; // 'auto', 'required', or 'none'
        // Request JSON output format for structured responses (WhatsApp only)
        if (this.enableJsonMode) {
          options.response_format = { type: "json_object" };
        }
      }

      const stream = await this.client.chat.completions.create(options, {
        signal: this.abortController.signal
      });

      let fullReply    = "";
      // Support multiple parallel tool calls (e.g. models that batch tool invocations)
      const toolCallsMap = {};  // id -> { id, name, argsStr }
      
      let isToolCallDetected = false;
      let textBuffer = "";
      let bufferTimeout = null;
      let initialBufferComplete = false;
      let allowTextStreaming = true; // True by default, disabled if action tool detected

      const flushBuffer = () => {
        if (textBuffer.length > 0 && allowTextStreaming) {
          this.emit('llm_token', textBuffer);
          textBuffer = "";
        }
        initialBufferComplete = true;
      };

      for await (const chunk of stream) {
        if (chunk.usage) {
          this.emit('token_usage', {
            prompt_tokens     : chunk.usage.prompt_tokens,
            completion_tokens : chunk.usage.completion_tokens,
            total_tokens      : chunk.usage.total_tokens,
          });
        }

        const delta = chunk.choices && chunk.choices[0] ? chunk.choices[0].delta : null;
        if (!delta) continue;

        // ----- Tool call streaming accumulation -----
        if (delta.tool_calls) {
          isToolCallDetected = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index !== undefined ? tc.index : 0;
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: null, name: null, argsStr: '' };
            }
            const entry = toolCallsMap[idx];
            if (tc.id)                   entry.id      = tc.id;
            if (tc.function && tc.function.name)      entry.name    = tc.function.name;
            if (tc.function && tc.function.arguments) entry.argsStr += tc.function.arguments;
          }
          
          // Determine if we should allow text streaming
          // record_field and end_call are allowed to have preamble text that is spoken
          const hasActionTool = Object.values(toolCallsMap).some(tc => tc.name && tc.name !== 'record_field' && tc.name !== 'end_call');
          const hasOnlySilentTools = Object.values(toolCallsMap).every(tc => !tc.name || tc.name === 'record_field' || tc.name === 'end_call');
          
          if (hasActionTool) {
             allowTextStreaming = false;
             if (bufferTimeout) { clearTimeout(bufferTimeout); bufferTimeout = null; }
          } else if (hasOnlySilentTools && Object.values(toolCallsMap).some(tc => tc.name === 'record_field' || tc.name === 'end_call')) {
             if (!initialBufferComplete) flushBuffer();
          }
        }

        // ----- Text token streaming -----
        if (delta.content) {
          fullReply += delta.content;
          
          if (!isToolCallDetected) {
            if (initialBufferComplete) {
              if (allowTextStreaming) this.emit('llm_token', delta.content);
            } else {
              textBuffer += delta.content;
              if (!bufferTimeout) {
                 bufferTimeout = setTimeout(() => {
                   if (allowTextStreaming) flushBuffer();
                 }, 200);
              }
            }
          } else if (allowTextStreaming) {
            this.emit('llm_token', delta.content);
          }
        }
      }
      
      if (bufferTimeout) clearTimeout(bufferTimeout);
      if (allowTextStreaming && textBuffer.length > 0) {
        flushBuffer();
      }

      // ----- Emit completed tool calls -----
      const toolCallEntries = Object.values(toolCallsMap);
      if (toolCallEntries.length > 0) {
        // Emit all tool calls at once instead of one by one
        this.emit('tool_calls', toolCallEntries, fullReply);
        return; // Don't emit llm_reply_complete when a tool call was made
      }

      // ----- Pure text reply -----
      if (fullReply) {
        this.emit('llm_reply_complete', fullReply);
      }

    } catch (error) {
      if (
        error.name === 'AbortError' ||
        error.name === 'APIUserAbortError' ||
        (error.message && error.message.includes('aborted'))
      ) {
        // Intentional interruption — suppress noisy log
        return;
      }
      console.error('[LLMService] Error generating response:', error);
      this.emit('llm_error', error);
    } finally {
      this.abortController = null;
    }
  }
}

module.exports = { LLMService };

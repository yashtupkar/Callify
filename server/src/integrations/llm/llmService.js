const EventEmitter = require('events');
const { OpenAI } = require('openai');
const { LLMProvider } = require('../ProviderInterfaces');

class LLMService extends LLMProvider {
  constructor() {
    super();
    // Use OpenRouter if key is present, otherwise fallback to OpenAI
    this.client = new OpenAI({
      baseURL: process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined,
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    });
    this.systemPrompt = "You are a helpful AI conversational agent.";
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

  async generateResponse(transcript, tools = []) {
    try {
      this.abort();
      this.abortController = new AbortController();
      
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...transcript
      ];

      const model = process.env.VOICE_LLM_MODEL || "openai/gpt-4o-mini";
      
      const options = {
        model: model,
        messages: messages,
        temperature: 0.7,
        stream: true,
        stream_options: { include_usage: true }
      };
      
      if (tools && tools.length > 0) {
        options.tools = tools;
      }

      const stream = await this.client.chat.completions.create(options, {
        signal: this.abortController.signal
      });

      let fullReply = "";
      let currentToolCall = null;
      let toolCallArgs = "";

      for await (const chunk of stream) {
        if (chunk.usage) {
          this.emit('token_usage', {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens
          });
        }
        
        const delta = chunk.choices && chunk.choices[0] ? chunk.choices[0].delta : null;
        if (!delta) continue;
        
        const content = delta.content;
        
        if (delta.tool_calls) {
          const toolCall = delta.tool_calls[0];
          if (toolCall.id) {
            // New tool call starting
            if (currentToolCall) {
               // Emitting previous tool call if any
               this.emit('tool_call', currentToolCall.name, JSON.parse(toolCallArgs));
            }
            currentToolCall = {
              id: toolCall.id,
              name: toolCall.function.name
            };
            toolCallArgs = toolCall.function.arguments || "";
          } else if (toolCall.function && toolCall.function.arguments) {
            // Append arguments
            toolCallArgs += toolCall.function.arguments;
          }
        }

        if (content) {
          fullReply += content;
          this.emit('llm_token', content);
        }
      }
      
      // Emit the last tool call if exists
      if (currentToolCall) {
        try {
          const args = JSON.parse(toolCallArgs);
          this.emit('tool_call', currentToolCall.name, args);
          // Return early if tool call is made, because we don't emit reply_complete yet
          return;
        } catch(e) {
          console.error("Error parsing tool call arguments", e);
        }
      }

      if (fullReply) {
        this.emit('llm_reply_complete', fullReply);
      }

    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'APIUserAbortError') {
        console.log('[LLMService] Generation aborted by user.');
        return;
      }
      console.error("[LLMService] Error generating response:", error);
      this.emit('llm_error', error);
    } finally {
      this.abortController = null;
    }
  }
}

module.exports = { LLMService };

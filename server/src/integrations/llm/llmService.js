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
  }

  initialize(systemPrompt) {
    if (systemPrompt) {
      this.systemPrompt = systemPrompt;
    }
  }

  async generateResponse(transcript, tools = []) {
    try {
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...transcript
      ];

      // Assuming model is something fast for voice like gpt-4o or groq/llama
      const model = process.env.VOICE_LLM_MODEL || "openai/gpt-4o-mini";

      const stream = await this.client.chat.completions.create({
        model: model,
        messages: messages,
        temperature: 0.7,
        stream: true,
        // tools: tools.length > 0 ? tools : undefined
      });

      let fullReply = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        
        // Handle tool calls if they exist (simplified)
        if (chunk.choices[0]?.delta?.tool_calls) {
           // Emitting tool call logic would go here
        }

        if (content) {
          fullReply += content;
          this.emit('llm_token', content);
        }
      }

      this.emit('llm_reply_complete', fullReply);

    } catch (error) {
      console.error("[LLMService] Error generating response:", error);
      this.emit('llm_error', error);
    }
  }
}

module.exports = { LLMService };

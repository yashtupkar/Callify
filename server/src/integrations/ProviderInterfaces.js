const EventEmitter = require('events');

/**
 * Base abstraction for all providers.
 */
class BaseProvider extends EventEmitter {
  constructor() {
    super();
    if (this.constructor === BaseProvider) {
      throw new Error("Cannot instantiate abstract class BaseProvider");
    }
  }

  /**
   * Return usage statistics for the current call.
   */
  getUsage() {
    return {};
  }
}

/**
 * Abstract STT Provider
 * Emits:
 * - 'transcript' (text, isFinal)
 * - 'speech_start'
 * - 'error' (err)
 */
class STTProvider extends BaseProvider {
  connect() { throw new Error("Method not implemented."); }
  processAudio(audioBuffer) { throw new Error("Method not implemented."); }
  disconnect() { throw new Error("Method not implemented."); }
}

/**
 * Abstract LLM Provider
 * Emits:
 * - 'llm_token' (token)
 * - 'llm_reply_complete' (fullReply)
 * - 'tool_call' (toolName, args)
 * - 'llm_error' (err)
 */
class LLMProvider extends BaseProvider {
  initialize(systemPrompt) { throw new Error("Method not implemented."); }
  generateResponse(transcript, tools) { throw new Error("Method not implemented."); }
  abort() { throw new Error("Method not implemented."); }
}

/**
 * Abstract TTS Provider
 * Emits:
 * - 'audio' (audioBuffer)
 * - 'tts_error' (err)
 */
class TTSProvider extends BaseProvider {
  feedText(text) { throw new Error("Method not implemented."); }
  flush() { throw new Error("Method not implemented."); }
  interrupt() { throw new Error("Method not implemented."); }
  setVoiceId(voiceId) { throw new Error("Method not implemented."); }
}

module.exports = { BaseProvider, STTProvider, LLMProvider, TTSProvider };

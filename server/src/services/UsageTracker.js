/**
 * Real Usage & Cost Tracker
 * 
 * Tracks real API usage metrics directly from provider responses
 * (OpenRouter/OpenAI token usage & exact USD cost, Deepgram processed audio duration,
 * ElevenLabs character-cost/streaming characters).
 */

class UsageTracker {
  constructor() {
    this.usage = {
      llmPromptTokens: 0,
      llmCompletionTokens: 0,
      llmCost: 0.0,
      ttsCharacters: 0,
      ttsCost: 0.0,
      sttDurationSeconds: 0,
      sttCost: 0.0,
      totalCost: 0.0,
      callDurationSeconds: 0,
      toolCalls: 0
    };
    this.startTime = Date.now();
  }

  /**
   * Add real LLM usage from OpenRouter / OpenAI API response
   * @param {object} usageObj - { prompt_tokens, completion_tokens, total_tokens, cost, ... }
   */
  addLLMUsage(usageObj) {
    if (!usageObj) return;
    const prompt = usageObj.prompt_tokens || 0;
    const completion = usageObj.completion_tokens || 0;
    const cost = Number(usageObj.cost || 0);

    this.usage.llmPromptTokens += prompt;
    this.usage.llmCompletionTokens += completion;
    this.usage.llmCost = Number((this.usage.llmCost + cost).toFixed(6));
    this.updateTotalCost();
  }

  /**
   * Backward-compatible token tracker
   */
  addLLMTokens(prompt, completion, cost = 0) {
    this.usage.llmPromptTokens = prompt;
    this.usage.llmCompletionTokens += completion;
    if (cost) {
      this.usage.llmCost = Number((this.usage.llmCost + Number(cost)).toFixed(6));
    }
    this.updateTotalCost();
  }

  /**
   * Set real STT duration from Deepgram Metadata frame
   */
  setRealSTTDuration(durationSeconds, ratePerMinute = 0.0043) {
    const sec = Math.max(0, Number(durationSeconds) || 0);
    this.usage.sttDurationSeconds = Math.round(sec);
    this.usage.sttCost = Number(((sec / 60) * ratePerMinute).toFixed(5));
    this.updateTotalCost();
  }

  /**
   * Fallback STT duration if WebSocket closes before metadata
   */
  addSTTDuration(seconds, ratePerMinute = 0.0043) {
    if (this.usage.sttDurationSeconds === 0) {
      const sec = Math.max(0, Number(seconds) || 0);
      this.usage.sttDurationSeconds = Math.round(sec);
      this.usage.sttCost = Number(((sec / 60) * ratePerMinute).toFixed(5));
      this.updateTotalCost();
    }
  }

  /**
   * Add TTS character count and cost
   */
  addTTSCharacters(count, ratePerChar = 0.00015) {
    const chars = Math.max(0, Number(count) || 0);
    this.usage.ttsCharacters += chars;
    this.usage.ttsCost = Number((this.usage.ttsCost + (chars * ratePerChar)).toFixed(5));
    this.updateTotalCost();
  }

  incrementToolCall() {
    this.usage.toolCalls += 1;
  }

  updateTotalCost() {
    this.usage.totalCost = Number((
      (this.usage.llmCost || 0) +
      (this.usage.sttCost || 0) +
      (this.usage.ttsCost || 0)
    ).toFixed(5));
  }

  getCost() {
    return {
      sttCost: Number((this.usage.sttCost || 0).toFixed(5)),
      llmCost: Number((this.usage.llmCost || 0).toFixed(5)),
      ttsCost: Number((this.usage.ttsCost || 0).toFixed(5)),
      totalCost: Number((this.usage.totalCost || 0).toFixed(5))
    };
  }

  finalize() {
    this.usage.callDurationSeconds = Math.round((Date.now() - this.startTime) / 1000);
    this.updateTotalCost();
    return this.usage;
  }
}

module.exports = { UsageTracker };

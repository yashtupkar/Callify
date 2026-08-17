class UsageTracker {
  constructor() {
    this.usage = {
      llmPromptTokens: 0,
      llmCompletionTokens: 0,
      ttsCharacters: 0,
      sttDurationSeconds: 0,
      callDurationSeconds: 0,
      toolCalls: 0
    };
    this.startTime = Date.now();
  }

  addLLMTokens(prompt, completion) {
    this.usage.llmPromptTokens = prompt; // Usually OpenAI sends cumulative total for the stream
    this.usage.llmCompletionTokens += completion;
  }

  addTTSCharacters(count) {
    this.usage.ttsCharacters += count;
  }

  addSTTDuration(seconds) {
    this.usage.sttDurationSeconds += seconds;
  }

  incrementToolCall() {
    this.usage.toolCalls += 1;
  }

  finalize() {
    this.usage.callDurationSeconds = Math.round((Date.now() - this.startTime) / 1000);
    return this.usage;
  }
}

module.exports = { UsageTracker };

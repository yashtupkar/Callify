class CostCalculator {
  constructor() {
    // These rates should eventually come from a database or secure config
    this.rates = {
      stt: { perMinute: 0.0043 }, // Deepgram Nova-2 rate
      llm: { promptToken: 0.00015 / 1000, completionToken: 0.0006 / 1000 }, // gpt-4o-mini approx
      tts: { perCharacter: 0.00015 }, // ElevenLabs approx standard rate
    };
  }

  calculateCost(usage) {
    const sttCost = (usage.sttDurationSeconds / 60) * this.rates.stt.perMinute;
    const llmCost = (usage.llmPromptTokens * this.rates.llm.promptToken) + (usage.llmCompletionTokens * this.rates.llm.completionToken);
    const ttsCost = usage.ttsCharacters * this.rates.tts.perCharacter;
    
    return {
      sttCost: Number(sttCost.toFixed(5)),
      llmCost: Number(llmCost.toFixed(5)),
      ttsCost: Number(ttsCost.toFixed(5)),
      totalCost: Number((sttCost + llmCost + ttsCost).toFixed(5))
    };
  }
}

module.exports = { CostCalculator };

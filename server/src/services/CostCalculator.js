class CostCalculator {
  constructor() {
    this.rates = {
      stt: {
        'deepgram/nova-2': { perMinute: 0.0043 },
        'deepgram/nova-3': { perMinute: 0.0053 },
        'deepgram/base': { perMinute: 0.0025 },
      },
      llm: {
        'openai/gpt-4o': { promptToken: 0.00015 / 1000, completionToken: 0.0006 / 1000 },
        'openai/gpt-4o-mini': { promptToken: 0.00015 / 1000, completionToken: 0.0006 / 1000 },
        'openai/gpt-4-turbo': { promptToken: 0.0001 / 1000, completionToken: 0.0005 / 1000 },
        'openai/gpt-3.5-turbo': { promptToken: 0.00005 / 1000, completionToken: 0.00015 / 1000 },
        'anthropic/claude-3.5-sonnet': { promptToken: 0.0003 / 1000, completionToken: 0.0015 / 1000 },
        'google/gemini-pro': { promptToken: 0.000125 / 1000, completionToken: 0.0005 / 1000 },
        'meta-llama/llama-4-maverick': { promptToken: 0.0002 / 1000, completionToken: 0.0006 / 1000 },
        'openai/gpt-oss-120b': { promptToken: 0.00005 / 1000, completionToken: 0.0002 / 1000 },
      },
      tts: {
        'elevenlabs/eleven_turbo_v2_5': { perCharacter: 0.00015 },
        'elevenlabs/eleven_multilingual_v2': { perCharacter: 0.0003 },
        'fish/s2.1-pro-free': { perCharacter: 0 },
        'fish/s2.1-pro': { perCharacter: 0.0001 },
        'fish/s1-fast': { perCharacter: 0.00008 },
        'sarvam/bulbul:v3': { perCharacter: 0.00002 },
      },
    };
    this.defaultRates = {
      stt: { perMinute: 0.0043 },
      llm: { promptToken: 0.00015 / 1000, completionToken: 0.0006 / 1000 },
      tts: { perCharacter: 0.00015 },
    };
  }

  getRateKey(category, provider, model) {
    const providerLower = (provider || '').toLowerCase();
    const modelLower = (model || '').toLowerCase();
    const key = `${providerLower}/${modelLower}`;
    if (this.rates[category] && this.rates[category][key]) {
      return key;
    }
    return null;
  }

  calculateCost(usage, providerConfig = null) {
    const config = providerConfig || {};
    const sttKey = this.getRateKey('stt', config.stt?.provider, config.stt?.model);
    const llmKey = this.getRateKey('llm', config.llm?.provider, config.llm?.model);
    const ttsKey = this.getRateKey('tts', config.tts?.provider, config.tts?.model);

    const sttRate = sttKey ? this.rates.stt[sttKey] : this.defaultRates.stt;
    const llmRate = llmKey ? this.rates.llm[llmKey] : this.defaultRates.llm;
    const ttsRate = ttsKey ? this.rates.tts[ttsKey] : this.defaultRates.tts;

    const sttCost = (usage.sttDurationSeconds / 60) * sttRate.perMinute;
    const llmCost = (usage.llmPromptTokens * llmRate.promptToken) + (usage.llmCompletionTokens * llmRate.completionToken);
    const ttsCost = usage.ttsCharacters * ttsRate.perCharacter;
    
    return {
      sttCost: Number(sttCost.toFixed(5)),
      llmCost: Number(llmCost.toFixed(5)),
      ttsCost: Number(ttsCost.toFixed(5)),
      totalCost: Number((sttCost + llmCost + ttsCost).toFixed(5))
    };
  }
}

module.exports = { CostCalculator };

/**
 * @deprecated 
 * Static cost calculations are deprecated in Callify.
 * Callify now extracts real cost and usage directly from API responses
 * (OpenRouter/OpenAI response.usage.cost, Deepgram Metadata duration, ElevenLabs character-cost).
 * 
 * Use `UsageTracker` from `src/services/UsageTracker.js`.
 */

class CostCalculator {
  constructor() {
    console.warn('[DEPRECATED] CostCalculator static rates are deprecated. Use UsageTracker for real API cost tracking.');
  }

  calculateCost(usage = {}) {
    // Return values directly from usage if already tracked by UsageTracker
    return {
      sttCost: Number((usage.sttCost || 0).toFixed(5)),
      llmCost: Number((usage.llmCost || 0).toFixed(5)),
      ttsCost: Number((usage.ttsCost || 0).toFixed(5)),
      totalCost: Number((usage.totalCost || (usage.sttCost || 0) + (usage.llmCost || 0) + (usage.ttsCost || 0)).toFixed(5))
    };
  }
}

module.exports = { CostCalculator };

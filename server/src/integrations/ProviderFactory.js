const { LLMService } = require('../integrations/llm/llmService');
const { STTService } = require('../integrations/stt/sttService');
const { TTSProvider } = require('../integrations/tts/ttsProvider');
const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');
const { SarvamTTSProvider } = require('../integrations/tts/sarvamTtsProvider');

const LLM_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    baseURL: undefined,
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  openrouter: {
    name: 'OpenRouter',
    models: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-pro', 'meta-llama/llama-4-maverick', 'openai/gpt-oss-120b'],
    defaultModel: 'openai/gpt-4o-mini',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  },
};

const TTS_PROVIDERS = {
  elevenlabs: {
    name: 'ElevenLabs',
    models: ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_monolingual_v1'],
    defaultModel: 'eleven_turbo_v2_5',
    envKey: 'ELEVENLABS_API_KEY',
    voiceEnvKey: 'ELEVENLABS_VOICE_ID',
  },
  fish: {
    name: 'Fish Audio',
    models: ['s2.1-pro-free', 's2.1-pro', 's1-fast'],
    defaultModel: 's2.1-pro-free',
    envKey: 'FISH_API_KEY',
    voiceEnvKey: 'FISH_VOICE_ID',
  },
  sarvam: {
    name: 'Sarvam',
    models: ['bulbul:v3'],
    defaultModel: 'bulbul:v3',
    envKey: 'SARVAM_API_KEY',
    voiceEnvKey: null,
  },
};

const STT_PROVIDERS = {
  deepgram: {
    name: 'Deepgram',
    models: ['nova-2', 'nova-3', 'base'],
    defaultModel: 'nova-2',
    envKey: 'DEEPGRAM_API_KEY',
  },
};

function getEnv(key) {
  return process.env[key] || '';
}

function createLLM(providerConfig) {
  const providerKey = (providerConfig?.provider || 'openrouter').toLowerCase();
  const provider = LLM_PROVIDERS[providerKey] || LLM_PROVIDERS.openrouter;
  const model = providerConfig?.model || provider.defaultModel;
  const apiKey = getEnv(provider.apiKeyEnv);

  if (!apiKey) {
    console.warn(`[ProviderFactory] Missing ${provider.apiKeyEnv} for LLM provider ${providerKey}. Falling back to available key.`);
    const fallbackKey = getEnv('OPENROUTER_API_KEY') || getEnv('OPENAI_API_KEY');
    const fallbackBase = getEnv('OPENROUTER_API_KEY') ? 'https://openrouter.ai/api/v1' : undefined;
    const client = new (require('openai').OpenAI)({
      baseURL: fallbackBase,
      apiKey: fallbackKey,
    });
    const service = new LLMService();
    service.client = client;
    service.model = model;
    return service;
  }

  const client = new (require('openai').OpenAI)({
    baseURL: provider.baseURL,
    apiKey,
  });

  const service = new LLMService();
  service.client = client;
  service.model = model;
  return service;
}

function createTTS(providerConfig, language = 'en-US') {
  const providerKey = (providerConfig?.provider || 'elevenlabs').toLowerCase();
  const provider = TTS_PROVIDERS[providerKey] || TTS_PROVIDERS.elevenlabs;
  const model = providerConfig?.model || provider.defaultModel;
  const voiceId = providerConfig?.voiceId || getEnv(provider.voiceEnvKey) || '';
  const apiKey = getEnv(provider.envKey);

  if (providerKey === 'fish') {
    const instance = new FishAudioTTSProvider({ sampleRate: 16000 });
    if (apiKey) instance.apiKey = apiKey;
    if (voiceId) instance.voiceId = voiceId;
    if (model) instance.model = model;
    return instance;
  }

  if (providerKey === 'sarvam') {
    const instance = new SarvamTTSProvider();
    if (apiKey && instance.client) {
      instance.client = new (require('sarvamai').SarvamAIClient)({ apiSubscriptionKey: apiKey });
    }
    if (voiceId) instance.voiceId = voiceId;
    if (model) instance.model = model;
    if (language) instance.language = language;
    return instance;
  }

  const instance = new TTSProvider();
  if (apiKey) instance.apiKey = apiKey;
  if (voiceId) instance.voiceId = voiceId;
  if (model) instance.model = model;
  return instance;
}

function createSTT(providerConfig, language = 'en-US') {
  const providerKey = (providerConfig?.provider || 'deepgram').toLowerCase();
  const provider = STT_PROVIDERS[providerKey] || STT_PROVIDERS.deepgram;
  const model = providerConfig?.model || provider.defaultModel;
  const apiKey = getEnv(provider.envKey);

  const instance = new STTService();
  if (apiKey) instance.apiKey = apiKey;
  if (model) instance.model = model;
  if (language) instance.language = language;
  return instance;
}

module.exports = {
  createLLM,
  createTTS,
  createSTT,
  LLM_PROVIDERS,
  TTS_PROVIDERS,
  STT_PROVIDERS,
};

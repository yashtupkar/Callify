const { TTSProvider } = require('../ProviderInterfaces');
const { SarvamAIClient } = require('sarvamai');

class SarvamTTSProvider extends TTSProvider {
  constructor() {
    super();
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      console.warn('[SarvamTTSProvider] SARVAM_API_KEY is not set. TTS may fail.');
    }
    
    this.client = new SarvamAIClient({
      apiSubscriptionKey: apiKey || '',
    });
    
    this.voiceId = 'ishita'; // Default Sarvam speaker
    this.language = 'hi-IN'; // Target language code
    this.textBuffer = '';
    this.isGenerating = false;
  }

  setVoiceId(voiceId) {
    if (voiceId) {
      this.voiceId = voiceId;
      console.log(`[SarvamTTSProvider] Voice ID set to ${voiceId}`);
    }
  }

  setLanguage(language) {
    if (language) {
      this.language = language;
      console.log(`[SarvamTTSProvider] Language set to ${language}`);
    }
  }

  feedText(text) {
    if (!text || !text.trim()) return;
    this.textBuffer += text;
  }

  async flush() {
    if (!this.textBuffer.trim()) return;
    
    const textToSynthesize = this.textBuffer;
    this.textBuffer = ''; // clear buffer early
    this.isGenerating = true;
    
    try {
      console.log(`[SarvamTTSProvider] Synthesizing text length ${textToSynthesize.length} for ${this.language}...`);
      
      const response = await this.client.textToSpeech.convertStream({
        text: textToSynthesize,
        target_language_code: this.language,
        speaker: this.voiceId,
        model: "bulbul:v3",
        pace: 1,
        speech_sample_rate: 16000,
        output_audio_codec: "linear16",
      });

      try {
        if (typeof response.stream === 'function') {
          const stream = response.stream();
          if (stream && typeof stream.getReader === 'function') {
            const reader = stream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done || !this.isGenerating) break;
              this.emit('audio', Buffer.from(value));
            }
          } else if (typeof stream[Symbol.asyncIterator] === 'function') {
            for await (const chunk of stream) {
              if (!this.isGenerating) break;
              this.emit('audio', Buffer.from(chunk));
            }
          }
        } else {
          console.error('[SarvamTTSProvider] Unrecognized stream response type:', typeof response);
        }
      } finally {
        this.isGenerating = false;
      }

    } catch (err) {
      console.error('[SarvamTTSProvider] Error generating speech:', err);
      this.emit('tts_error', err);
      this.isGenerating = false;
    }
  }

  interrupt() {
    this.isGenerating = false;
    this.textBuffer = '';
  }
}

module.exports = { SarvamTTSProvider };

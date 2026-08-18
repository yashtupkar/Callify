const { TTSProvider } = require('../ProviderInterfaces');

class FishAudioTTSProvider extends TTSProvider {
  constructor() {
    super();
    this.apiKey = process.env.FISH_API_KEY;
    this.voiceId = process.env.FISH_VOICE_ID || '933563129e564b19a115bedd57b7406a';
    this.textBuffer = "";
    this.isGenerating = false;
    this.queue = [];
    this.isProcessing = false;
  }

  setVoiceId(voiceId) {
    if (voiceId) {
      this.voiceId = voiceId;
      console.log(`[FishAudioTTSProvider] Voice ID set to ${voiceId}`);
    }
  }

  feedText(token) {
    if (!this.apiKey) {
      console.warn('[FishAudioTTSProvider] No FISH_API_KEY provided. Skipping TTS.');
      return;
    }
    this.textBuffer += token;
    this.isGenerating = true;
    this.emit('tts_characters', token.length);

    // Look for sentence boundaries (punctuation followed by a space or newline)
    const match = this.textBuffer.match(/^(.*?[\.\?\!\n])(?: |\n)(.*)$/s);
    if (match) {
      const sentence = match[1].trim();
      this.textBuffer = (match[2] || "").trimStart();
      if (sentence) {
        this.enqueue(sentence);
      }
    }
  }

  enqueue(text) {
    this.queue.push(text);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const text = this.queue.shift();
      await this.fetchAndEmit(text);
    }
    this.isProcessing = false;
  }

  interrupt() {
    console.log('[FishAudioTTSProvider] Interrupting TTS stream');
    this.textBuffer = "";
    this.queue = [];
    this.isGenerating = false;
    // We can't easily abort an ongoing fetch here without AbortController, but clearing the queue stops subsequent ones.
  }

  async flush() {
    if (!this.apiKey) return;
    
    const textToSpeak = this.textBuffer.trim();
    this.textBuffer = "";
    this.isGenerating = false;

    if (textToSpeak) {
      this.enqueue(textToSpeak);
    }
  }

  async fetchAndEmit(text) {
    if (!text.trim()) return;

    try {
      const response = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          model: "s2.1-pro-free",
        },
        body: JSON.stringify({
          text: text,
          reference_id: this.voiceId,
          format: "pcm",
          sample_rate: 16000
        }),
      });

      if (!response.ok) {
        console.error('[FishAudioTTSProvider] Error response:', await response.text());
        return;
      }

      if (response.body) {
        const arrayBuffer = await response.arrayBuffer();
        const fullBuffer = Buffer.from(arrayBuffer);
        console.log(`[FishAudioTTSProvider] Generated ${fullBuffer.length} bytes of audio for text.`);
        this.emit('audio', fullBuffer);
      }
    } catch (err) {
      console.error('[FishAudioTTSProvider] Error fetching audio:', err);
    }
  }
}

module.exports = { FishAudioTTSProvider };

const { TTSProvider } = require('../ProviderInterfaces');

class FishAudioTTSProvider extends TTSProvider {
  constructor(config = {}) {
    super();
    this.apiKey = process.env.FISH_API_KEY;
    this.voiceId = process.env.FISH_VOICE_ID || '933563129e564b19a115bedd57b7406a';
    this.sampleRate = config.sampleRate || 16000;
    this.textBuffer = "";
    this.isGenerating = false;
    this.queue = [];
    this.isProcessing = false;
    this.abortController = null;
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

    // Look for sentence boundaries (punctuation followed by a space or newline). Included commas, dashes, colons for faster first-response!
    const match = this.textBuffer.match(/^(.*?[\.\?\!\n\,\-\:])(?: |\n)(.*)$/s);
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
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
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

    this.abortController = new AbortController();

    try {
      const response = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        signal: this.abortController.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          model: "s2.1-pro-free",
        },
        body: JSON.stringify({
          text: text,
          reference_id: this.voiceId,
          format: "pcm",
          sample_rate: this.sampleRate
        }),
      });

      if (!response.ok) {
        console.error('[FishAudioTTSProvider] Error response:', await response.text());
        return;
      }

      if (response.body) {
        let leftover = Buffer.alloc(0);
        const MIN_CHUNK_SIZE = 8192; // Stream in 8KB chunks (about 0.25s of audio) for lowest latency
        
        for await (const chunk of response.body) {
          leftover = Buffer.concat([leftover, Buffer.from(chunk)]);
          
          while (leftover.length >= MIN_CHUNK_SIZE) {
            // Ensure even byte alignment for 16-bit PCM
            let sendLength = MIN_CHUNK_SIZE;
            if (sendLength % 2 !== 0) sendLength--;
            
            const toSend = leftover.subarray(0, sendLength);
            leftover = leftover.subarray(sendLength);
            
            this.emit('audio', Buffer.from(toSend));
          }
        }
        
        if (leftover.length > 0) {
          if (leftover.length % 2 !== 0) leftover = leftover.subarray(0, leftover.length - 1);
          if (leftover.length > 0) this.emit('audio', Buffer.from(leftover));
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[FishAudioTTSProvider] TTS fetch aborted');
      } else {
        console.error('[FishAudioTTSProvider] Error fetching audio:', err);
      }
    } finally {
      this.abortController = null;
    }
  }
}

module.exports = { FishAudioTTSProvider };

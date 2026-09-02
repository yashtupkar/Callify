const EventEmitter = require('events');
const WebSocket = require('ws');
const { ElevenLabsClient } = require('@11labs/client');
const { TTSProvider } = require('../ProviderInterfaces');

class ElevenLabsTTSProvider extends TTSProvider {
  constructor() {
    super();
    this.ws = null;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.isGenerating = false;
    this.pendingTokens = [];
    this.flushRequested = false;
  }

  setVoiceId(voiceId) {
    if (voiceId) {
      this.voiceId = voiceId;
      console.log(`[TTSProvider] Voice ID set to ${voiceId}`);
    }
  }

  _connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_turbo_v2_5&output_format=pcm_16000`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      const bosMessage = {
        text: " ",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        xi_api_key: this.apiKey,
      };
      ws.send(JSON.stringify(bosMessage));
      this.isGenerating = true;

      while (this.pendingTokens.length > 0) {
        const token = this.pendingTokens.shift();
        ws.send(JSON.stringify({ text: token, try_trigger_generation: true }));
        this.emit('tts_characters', token.length);
      }

      if (this.flushRequested) {
        ws.send(JSON.stringify({ text: "" }));
        this.flushRequested = false;
      }
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.audio) {
          const audioBuffer = Buffer.from(response.audio, 'base64');
          this.emit('audio', audioBuffer);
        } else if (response.error) {
          console.error('[TTSProvider] ElevenLabs Error:', response.error);
        }
        if (response.isFinal) {
          this.isGenerating = false;
          this.emit('utterance_complete');
        }
      } catch (e) {
        console.error('[TTSProvider] Error parsing message', e);
      }
    });

    ws.on('error', (err) => {
      console.error('[TTSProvider] WebSocket error:', err);
      this.isGenerating = false;
    });

    ws.on('close', (code, reason) => {
      console.log(`[TTSProvider] Connection closed: ${code} ${reason}`);
      this.isGenerating = false;
      this.ws = null;
      this.pendingTokens = [];
      this.flushRequested = false;
    });
  }

  feedText(token) {
    if (!this.apiKey) {
      console.warn('[TTSProvider] No ELEVENLABS_API_KEY provided. Skipping TTS.');
      return;
    }

    if (!this.isGenerating || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingTokens.push(token);
      this._connect();
      return;
    }

    const ws = this.ws;
    ws.send(JSON.stringify({ text: token, try_trigger_generation: true }));
    this.emit('tts_characters', token.length);
  }

  interrupt() {
    this.pendingTokens = [];
    this.flushRequested = false;
    if (this.ws) {
      console.log('[TTSProvider] Interrupting TTS stream');
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ text: "" })); 
      }
      this.ws.close();
      this.ws = null;
      this.isGenerating = false;
      this.emit('utterance_interrupted');
    }
  }

  flush() {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.pendingTokens = [];
      this.flushRequested = false;
      this.isGenerating = false;
      return;
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text: "" }));
    } else if (this.ws.readyState === WebSocket.CONNECTING) {
      this.flushRequested = true;
    }
  }
}

module.exports = { TTSProvider: ElevenLabsTTSProvider };

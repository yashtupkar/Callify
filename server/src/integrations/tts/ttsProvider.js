const EventEmitter = require('events');
const WebSocket = require('ws');
const { ElevenLabsClient } = require('@11labs/client');
const { TTSProvider } = require('../ProviderInterfaces');

class ElevenLabsTTSProvider extends TTSProvider {
  constructor() {
    super();
    this.ws = null;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default Adam voice (free tier compatible)
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.isGenerating = false;
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

    // ElevenLabs streaming endpoint with raw PCM output
    const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_turbo_v2_5&output_format=pcm_16000`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      // Send the initial configuration payload
      const bosMessage = {
        text: " ",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        xi_api_key: this.apiKey,
      };
      ws.send(JSON.stringify(bosMessage));
      this.isGenerating = true;
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.audio) {
          // Audio comes as base64 string
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
    });
  }

  feedText(token) {
    if (!this.apiKey) {
      console.warn('[TTSProvider] No ELEVENLABS_API_KEY provided. Skipping TTS.');
      return;
    }

    if (!this.isGenerating || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this._connect();
    }

    const ws = this.ws;
    // Wait until WS is open to send text
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      ws.once('open', () => {
        ws.send(JSON.stringify({ text: token, try_trigger_generation: true }));
        this.emit('tts_characters', token.length);
      });
    } else if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ text: token, try_trigger_generation: true }));
      this.emit('tts_characters', token.length);
    }
  }

  interrupt() {
    // When a user interrupts, we close the current WebSocket connection to abort generation immediately.
    if (this.ws) {
      console.log('[TTSProvider] Interrupting TTS stream');
      // Send End of Stream empty string if open, then close
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
    // Signals ElevenLabs that the current utterance is complete, allowing it to flush the final audio chunks and close.
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ text: "" }));
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      ws.once('open', () => {
        ws.send(JSON.stringify({ text: "" }));
      });
    }
    // We let the server send the remaining audio and then it will naturally close the connection or we can just drop it on close.
    // The next utterance will create a fresh WebSocket connection.
    this.ws = null; 
    this.isGenerating = false;
  }
}

module.exports = { TTSProvider: ElevenLabsTTSProvider };

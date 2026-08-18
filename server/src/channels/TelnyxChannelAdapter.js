const { ChannelAdapter } = require('./ChannelAdapter');
const { WaveFile } = require('wavefile');

/**
 * Adapter for Telnyx WebSocket Media Streams.
 */
class TelnyxChannelAdapter extends ChannelAdapter {
  constructor(ws, streamSid = null) {
    super();
    this.ws = ws;
    this.streamSid = streamSid; // Optional tracking ID

    this.ws.on('close', () => {
      console.log('[TelnyxChannelAdapter] WebSocket closed');
      this.emit('disconnected');
    });

    this.ws.on('error', (err) => {
      console.error('[TelnyxChannelAdapter] WebSocket error:', err);
      this.emit('error', err);
    });
  }

  /**
   * Send audio back to Telnyx.
   * Telnyx expects base64 encoded G.711 PCMU (mu-law) audio.
   * @param {Buffer} audioData - The audio bytes.
   */
  sendAudio(audioData) {
    if (this.ws && this.ws.readyState === 1) {
      try {
        let wav = new WaveFile();
        // TTS sends 16-bit PCM at 16000 Hz, mono.
        // We must convert the Buffer (Uint8Array) to Int16Array for wavefile to process it correctly.
        const int16Samples = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.length / 2);
        wav.fromScratch(1, 16000, '16', int16Samples);
        wav.toSampleRate(8000);
        wav.toMuLaw();
        
        // Get raw mulaw samples (strip wav header)
        const rawSamples = wav.data.samples;
        
        console.log(`[TelnyxChannelAdapter] Sending ${rawSamples.length} bytes of mu-law audio to Telnyx in chunks`);
        
        // Telnyx (like Twilio) expects small media payloads (ideally 20ms which is 160 bytes for G.711)
        const CHUNK_SIZE = 160;
        for (let i = 0; i < rawSamples.length; i += CHUNK_SIZE) {
          const chunk = rawSamples.subarray(i, i + CHUNK_SIZE);
          const base64Audio = Buffer.from(chunk).toString('base64');
          
          const message = {
            event: 'media',
            media: {
              payload: base64Audio
            }
          };
          
          if (this.streamSid) {
              message.stream_id = this.streamSid;
          }

          this.ws.send(JSON.stringify(message));
        }
      } catch (err) {
        console.error('[TelnyxChannelAdapter] Error transcoding audio:', err);
      }
    }
  }

  sendControlMessage(msg) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  endSession() {
    if (this.ws && this.ws.readyState === 1) {
      const stopMessage = {
        event: 'stop'
      };
      if (this.streamSid) {
          stopMessage.stream_id = this.streamSid;
      }
      this.ws.send(JSON.stringify(stopMessage));

      setTimeout(() => {
        this.ws.close();
      }, 500);
    }
  }

  getSessionMetadata() {
    return {
      provider: 'telnyx',
      connectedAt: Date.now(),
      streamSid: this.streamSid
    };
  }
}

module.exports = { TelnyxChannelAdapter };

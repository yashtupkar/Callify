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

  clearAudio() {
    if (this.ws && this.ws.readyState === 1 && this.streamSid) {
      const message = {
        event: 'clear',
        stream_id: this.streamSid
      };
      this.ws.send(JSON.stringify(message));
      console.log('[TelnyxChannelAdapter] Sent clear event to flush audio buffer');
    }
  }

  /**
   * Send audio back to Telnyx.
   * Telnyx expects base64 encoded G.711 PCMU (mu-law) audio.
   * @param {Buffer} audioData - The audio bytes.
   */
  sendAudio(audioData, sampleRate = 16000) {
    if (this.ws && this.ws.readyState === 1) {
      try {
        const int16Samples = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.length / 2);
        let finalSamples = int16Samples;
        let finalSampleRate = sampleRate;

        if (sampleRate === 16000) {
          // Downsample to 8000Hz by averaging adjacent samples (stateless 2:1 decimation).
          // This avoids wavefile's stateful toSampleRate() which causes audio breaking/clicking at chunk boundaries.
          finalSamples = new Int16Array(int16Samples.length / 2);
          for (let i = 0; i < finalSamples.length; i++) {
             finalSamples[i] = (int16Samples[i * 2] + int16Samples[i * 2 + 1]) / 2;
          }
          finalSampleRate = 8000;
        }

        let wav = new WaveFile();
        wav.fromScratch(1, finalSampleRate, '16', finalSamples);
        
        if (finalSampleRate !== 8000) {
          wav.toSampleRate(8000); // Fallback for other rates
        }
        wav.toMuLaw();
        
        // Get raw mulaw samples (strip wav header)
        const rawSamples = wav.data.samples;
        
        console.log(`[TelnyxChannelAdapter] Sending ${rawSamples.length} bytes of mu-law audio to Telnyx`);
        
        // Telnyx buffers the audio natively, so we just send the entire converted payload
        const base64Audio = Buffer.from(rawSamples).toString('base64');
        
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

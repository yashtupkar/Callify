const EventEmitter = require('events');
const WebSocket = require('ws');

class STTService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.isConnected = false;
    this.audioBufferQueue = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[STTService] Connecting to Deepgram WebSocket...');
        
        const apiKey = process.env.DEEPGRAM_API_KEY;
        const url = 'wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&endpointing=300';
        
        this.ws = new WebSocket(url, {
          headers: {
            Authorization: `Token ${apiKey}`
          }
        });

        this.ws.on('open', () => {
          console.log('[STTService] Connected to Deepgram.');
          this.isConnected = true;
          // Flush any buffered audio that arrived while connecting
          while (this.audioBufferQueue.length > 0) {
            const buffer = this.audioBufferQueue.shift();
            this.ws.send(buffer);
          }
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'Results' && parsed.channel && parsed.channel.alternatives) {
              const transcript = parsed.channel.alternatives[0].transcript;
              const isFinal = parsed.is_final;
              const speechFinal = parsed.speech_final;
              
              if (transcript) {
                // Only interrupt if the user has actually started speaking words (ignore background noise)
                if (!isFinal && !speechFinal && transcript.trim().length > 3) {
                  this.emit('speech_start');
                }
                
                if (isFinal || speechFinal) {
                  this.emit('transcript', transcript, true);
                } else {
                  this.emit('transcript', transcript, false);
                }
              }
            }
          } catch (e) {
            console.error('[STTService] Error parsing Deepgram message', e);
          }
        });

        this.ws.on('error', (err) => {
          console.error('[STTService] Deepgram error:', err);
          this.emit('error', err);
          reject(err);
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[STTService] Deepgram connection closed: ${code} ${reason}`);
          this.isConnected = false;
        });

      } catch (err) {
        console.error('[STTService] Setup error:', err);
        reject(err);
      }
    });
  }

  processAudio(audioBuffer) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioBuffer);
    } else {
      // Buffer the audio if STT is still connecting (crucial for webm headers!)
      this.audioBufferQueue.push(audioBuffer);
    }
  }

  disconnect() {
    if (this.isConnected && this.ws) {
      // Send empty string to indicate end of stream in Deepgram
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(new Uint8Array(0));
      }
      this.ws.close();
      this.isConnected = false;
    }
  }
}

module.exports = { STTService };

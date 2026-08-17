const { ChannelAdapter } = require('./ChannelAdapter');

/**
 * Adapter for standard WebSockets used by web browsers.
 */
class BrowserChannelAdapter extends ChannelAdapter {
  constructor(ws) {
    super();
    this.ws = ws;

    this.ws.on('close', () => {
      this.emit('disconnected');
    });

    this.ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  sendAudio(audioData) {
    if (this.ws && this.ws.readyState === 1) { // WebSocket.OPEN
      // For browser, we wrap audio in our JSON protocol or send as base64
      this.sendControlMessage({ type: 'audio.output', data: audioData.toString('base64') });
    }
  }

  sendControlMessage(msg) {
    if (this.ws && this.ws.readyState === 1) { // WebSocket.OPEN
      this.ws.send(JSON.stringify(msg));
    }
  }

  endSession() {
    if (this.ws && this.ws.readyState === 1) {
      this.sendControlMessage({ type: 'session.ending' });
      // Wait slightly to let message go through
      setTimeout(() => {
        this.ws.close(1000, 'Session Ended by Server');
      }, 500);
    }
  }

  getSessionMetadata() {
    return {
      provider: 'browser_websocket',
      connectedAt: Date.now()
    };
  }
}

module.exports = { BrowserChannelAdapter };

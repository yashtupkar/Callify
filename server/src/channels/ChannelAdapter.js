const EventEmitter = require('events');

/**
 * Base abstraction for all telephony/voice channels (Browser WebSocket, Twilio, Telnyx).
 * The ConversationManager interacts strictly with this interface, never the raw transport.
 */
class ChannelAdapter extends EventEmitter {
  constructor() {
    super();
    if (this.constructor === ChannelAdapter) {
      throw new Error("Cannot instantiate abstract class ChannelAdapter");
    }
  }

  /**
   * Send audio data back to the channel.
   * @param {Buffer|string} audioData - The audio bytes.
   */
  sendAudio(audioData) {
    throw new Error("Method 'sendAudio()' must be implemented.");
  }

  /**
   * Send a control message (JSON) back to the channel.
   * @param {Object} msg - The JSON payload.
   */
  sendControlMessage(msg) {
    throw new Error("Method 'sendControlMessage()' must be implemented.");
  }

  /**
   * End the session/call from the server side.
   */
  endSession() {
    throw new Error("Method 'endSession()' must be implemented.");
  }

  /**
   * Returns metadata about the connection (e.g. caller ID, provider, connection time).
   */
  getSessionMetadata() {
    throw new Error("Method 'getSessionMetadata()' must be implemented.");
  }
}

module.exports = { ChannelAdapter };

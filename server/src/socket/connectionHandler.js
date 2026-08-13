const { ConversationManager } = require('../services/ConversationManager');

function setupConnectionHandler(ws, req) {
  console.log('[ConnectionHandler] Initializing new session...');
  
  // Extract agentId and protocol from URL if available
  let agentId = null;
  let protocol = 'web';
  try {
    const url = new URL(req.url, `ws://${req.headers.host}`);
    agentId = url.searchParams.get('agentId');
    protocol = url.searchParams.get('protocol') || 'web';
  } catch(e) {}

  const conversationManager = new ConversationManager(ws);

  // If connected via Twilio or SignalWire, automatically start the conversation
  if (protocol === 'twilio' || protocol === 'signalwire') {
    conversationManager.startConversation({ agentId }, protocol);
  }

  ws.on('message', async (message) => {
    try {
      let msg;
      if (Buffer.isBuffer(message) && protocol === 'web') {
        conversationManager.handleIncomingAudio(message);
        return;
      }
      
      try {
        msg = JSON.parse(message.toString());
      } catch(e) {}

      if (msg) {
        if (protocol === 'twilio' || protocol === 'signalwire') {
          // Twilio/SignalWire Media Streams format
          if (msg.event === 'media') {
            const payload = msg.media.payload; // Base64 encoded mu-law
            const buffer = Buffer.from(payload, 'base64');
            // Assuming STT handles mu-law when configured, just pass it
            conversationManager.handleIncomingAudio(buffer);
          } else if (msg.event === 'start') {
            console.log(`[ConnectionHandler] ${protocol} Stream started`, msg.streamSid);
            conversationManager.twilioStreamSid = msg.streamSid; // Save for sending audio back
          }
        } else {
          // Web Client format
          switch (msg.event) {
            case 'start':
              console.log('[ConnectionHandler] Start event received. Config:', msg.config);
              msg.config.agentId = msg.config.agentId || agentId;
              await conversationManager.startConversation(msg.config, protocol);
              break;
            case 'audio':
              conversationManager.handleIncomingAudio(Buffer.from(msg.data, 'base64'));
              break;
            case 'stop':
              console.log('[ConnectionHandler] Stop event received.');
              conversationManager.endConversation();
              break;
          }
        }
      }
    } catch (err) {
      console.error('[ConnectionHandler] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[ConnectionHandler] WebSocket closed by client.');
    conversationManager.endConversation();
  });

  ws.on('error', (err) => {
    console.error('[ConnectionHandler] WebSocket error:', err);
    conversationManager.endConversation();
  });
}

module.exports = { setupConnectionHandler };

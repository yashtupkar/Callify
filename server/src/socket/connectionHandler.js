const { ConversationManager } = require('../services/ConversationManager');

function setupConnectionHandler(ws, req) {
  console.log('[ConnectionHandler] Initializing new session...');
  
  // We instantiate a new ConversationManager for every WebSocket connection
  const conversationManager = new ConversationManager(ws);

  ws.on('message', async (message) => {
    try {
      // We expect the client to send JSON messages for control, 
      // or raw binary for audio depending on the protocol chosen.
      // For simplicity, let's assume the frontend sends JSON:
      // { event: 'start', config: {...} } or { event: 'audio', data: base64_audio }
      
      let msg;
      try {
        msg = JSON.parse(message.toString());
      } catch(e) {
        // If not JSON, it might be raw binary audio from browser MediaRecorder
        if (Buffer.isBuffer(message)) {
          conversationManager.handleIncomingAudio(message);
          return;
        }
      }

      if (msg && msg.event) {
        switch (msg.event) {
          case 'start':
            console.log('[ConnectionHandler] Start event received. Config:', msg.config);
            await conversationManager.startConversation(msg.config);
            break;
          case 'audio':
            // Base64 encoded audio
            conversationManager.handleIncomingAudio(Buffer.from(msg.data, 'base64'));
            break;
          case 'stop':
            console.log('[ConnectionHandler] Stop event received.');
            conversationManager.endConversation();
            break;
          default:
            console.warn(`[ConnectionHandler] Unknown event type: ${msg.event}`);
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

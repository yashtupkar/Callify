const { ConversationManager } = require('../services/ConversationManager');
const { BrowserChannelAdapter } = require('../channels/BrowserChannelAdapter');

function setupConnectionHandler(ws, req) {
  console.log('[ConnectionHandler] Initializing new session...');
  
  // We instantiate a new ConversationManager for every WebSocket connection using the BrowserChannelAdapter
  const channelAdapter = new BrowserChannelAdapter(ws);
  const conversationManager = new ConversationManager(channelAdapter);

  const { validateSessionStart, validateToolResult, MAX_PAYLOAD_SIZE } = require('../utils/protocol');
  
  let messageCount = 0;
  const RATE_LIMIT_RESET_MS = 1000;
  const MAX_MESSAGES_PER_SEC = 20;
  
  const rateLimitInterval = setInterval(() => {
    messageCount = 0;
  }, RATE_LIMIT_RESET_MS);

  ws.on('message', async (message) => {
    messageCount++;
    if (messageCount > MAX_MESSAGES_PER_SEC) {
      console.warn('[ConnectionHandler] Rate limit exceeded, dropping message.');
      return;
    }

    if (message.length > MAX_PAYLOAD_SIZE) {
      console.error('[ConnectionHandler] Message payload too large. Closing connection.');
      ws.close(1009, 'Payload Too Large');
      return;
    }

    try {
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

      if (msg && msg.type) {
        switch (msg.type) {
          case 'session.start':
            const validatedStart = validateSessionStart(msg);
            console.log('[ConnectionHandler] session.start received. Config validated.');
            await conversationManager.startConversation(validatedStart.config);
            break;
          case 'audio.input':
            // Base64 encoded audio or raw buffer
            if (msg.data) {
              conversationManager.handleIncomingAudio(Buffer.from(msg.data, 'base64'));
            }
            break;
          case 'session.ended':
            console.log('[ConnectionHandler] session.ended received.');
            conversationManager.endConversation();
            break;
          case 'tool.completed':
            const validatedTool = validateToolResult(msg);
            console.log('[ConnectionHandler] tool.completed received:', validatedTool.toolName);
            conversationManager.handleFrontendToolResult(validatedTool.toolName, validatedTool.result, validatedTool.toolCallId);
            break;
          default:
            console.warn(`[ConnectionHandler] Unknown event type: ${msg.type}`);
        }
      } else if (msg && msg.event) {
        // Fallback for legacy client temporarily
        console.warn(`[ConnectionHandler] Received legacy event: ${msg.event}`);
        if (msg.event === 'start') {
          await conversationManager.startConversation(msg.config);
        } else if (msg.event === 'stop') {
          conversationManager.endConversation();
        } else if (msg.event === 'tool_execution_result') {
          conversationManager.handleFrontendToolResult(msg.toolName, msg.result, msg.toolCallId);
        }
      }
    } catch (err) {
      console.error('[ConnectionHandler] Error processing message:', err.message);
      // Optional: send error event back to client
      // ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    clearInterval(rateLimitInterval);
    console.log('[ConnectionHandler] WebSocket closed by client.');
    conversationManager.endConversation();
  });

  ws.on('error', (err) => {
    console.error('[ConnectionHandler] WebSocket error:', err);
    conversationManager.endConversation();
  });
}

module.exports = { setupConnectionHandler };

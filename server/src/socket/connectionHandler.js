const { ConversationManager } = require('../services/ConversationManager');
const { BrowserChannelAdapter } = require('../channels/BrowserChannelAdapter');

function setupConnectionHandler(ws, req) {
  console.log('[ConnectionHandler] Initializing new session...');
  
  const { validateSessionStart, validateToolResult, MAX_PAYLOAD_SIZE } = require('../utils/protocol');
  
  let messageCount = 0;
  const RATE_LIMIT_RESET_MS = 1000;
  const MAX_MESSAGES_PER_SEC = 20;
  
  let conversationManager = null;
  
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
        if (Buffer.isBuffer(message)) {
          if (!conversationManager) {
            console.error('[ConnectionHandler] Received audio before session start');
            return;
          }
          conversationManager.handleIncomingAudio(message);
          return;
        }
      }

      if (msg && msg.type) {
        switch (msg.type) {
          case 'session.start':
            const validatedStart = validateSessionStart(msg);
            console.log('[ConnectionHandler] session.start received. Config validated.');
            
            const providerConfig = validatedStart.config.providers || null;
            const channelAdapter = new BrowserChannelAdapter(ws);
            conversationManager = new ConversationManager(channelAdapter, providerConfig);
            await conversationManager.startConversation(validatedStart.config);
            break;
          case 'audio.input':
            if (!conversationManager) {
              console.error('[ConnectionHandler] Received audio before session start');
              return;
            }
            if (msg.data) {
              conversationManager.handleIncomingAudio(Buffer.from(msg.data, 'base64'));
            }
            break;
          case 'text.input':
            if (!conversationManager) {
              console.error('[ConnectionHandler] Received text before session start');
              return;
            }
            if (msg.text) {
              if (conversationManager.tts) {
                conversationManager.tts.interrupt();
              }
              conversationManager.handleUserUtterance(msg.text);
              conversationManager.sendToClient({ event: 'transcript', data: { text: msg.text, isFinal: true, speaker: 'user' } });
            }
            break;
          case 'session.ended':
            console.log('[ConnectionHandler] session.ended received.');
            if (conversationManager) {
              try {
                conversationManager.endConversation();
              } catch (err) {
                console.error('[ConnectionHandler] Error ending conversation:', err);
              }
            }
            break;
          case 'tool.completed':
            const validatedTool = validateToolResult(msg);
            console.log('[ConnectionHandler] tool.completed received:', validatedTool.toolName);
            if (conversationManager) {
              try {
                conversationManager.handleFrontendToolResult(validatedTool.toolName, validatedTool.result, validatedTool.toolCallId);
              } catch (err) {
                console.error('[ConnectionHandler] Error handling tool result:', err);
              }
            }
            break;
          default:
            console.warn(`[ConnectionHandler] Unknown event type: ${msg.type}`);
        }
      } else if (msg && msg.event) {
        console.warn(`[ConnectionHandler] Received legacy event: ${msg.event}`);
        if (msg.event === 'start') {
          const providerConfig = msg.config?.providers || null;
          const channelAdapter = new BrowserChannelAdapter(ws);
          conversationManager = new ConversationManager(channelAdapter, providerConfig);
          await conversationManager.startConversation(msg.config);
        } else if (msg.event === 'stop') {
          if (conversationManager) {
            try {
              conversationManager.endConversation();
            } catch (err) {
              console.error('[ConnectionHandler] Error ending conversation:', err);
            }
          }
        } else if (msg.event === 'tool_execution_result') {
          if (conversationManager) {
            try {
              conversationManager.handleFrontendToolResult(msg.toolName, msg.result, msg.toolCallId);
            } catch (err) {
              console.error('[ConnectionHandler] Error handling tool result:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('[ConnectionHandler] Error processing message:', err.message);
    }
  });

  ws.on('close', () => {
    clearInterval(rateLimitInterval);
    console.log('[ConnectionHandler] WebSocket closed by client.');
    if (conversationManager) conversationManager.endConversation();
  });

  ws.on('error', (err) => {
    console.error('[ConnectionHandler] WebSocket error:', err);
    if (conversationManager) conversationManager.endConversation();
  });
}

module.exports = { setupConnectionHandler };

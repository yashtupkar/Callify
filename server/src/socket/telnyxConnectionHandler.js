const { ConversationManager } = require('../services/ConversationManager');
const { TelnyxChannelAdapter } = require('../channels/TelnyxChannelAdapter');
const { dbService } = require('../services/DatabaseService');

function setupTelnyxConnectionHandler(ws, req, to = null) {
  console.log('[TelnyxConnectionHandler] Initializing new session...');
  
  // We'll extract the streamSid from the 'start' event later
  const channelAdapter = new TelnyxChannelAdapter(ws);
  const conversationManager = new ConversationManager(channelAdapter);

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message.toString());
      
      if (msg.event === 'start') {
        console.log(`[TelnyxConnectionHandler] Media stream started. Stream ID: ${msg.stream_id}, Dialed Number: ${to}`);
        console.log(`[TelnyxConnectionHandler] Start event details:`, JSON.stringify(msg.start, null, 2));
        channelAdapter.streamSid = msg.stream_id;
        
        let config = {
          systemPrompt: "You are a helpful AI assistant for a business. Keep your answers concise and professional.",
          voice: "alloy" 
        };

        if (to) {
          try {
            // Find if this phone number is mapped to an Agent
            const dbPhone = await dbService.prisma.phoneNumber.findUnique({
              where: { phoneNumber: to },
              include: { Agent: true }
            });
            
            if (dbPhone && dbPhone.Agent) {
              console.log(`[TelnyxConnectionHandler] Routing call to Agent: ${dbPhone.Agent.name}`);
              config = {
                systemPrompt: dbPhone.Agent.systemPrompt,
                voice: dbPhone.Agent.voiceId || "alloy"
              };
            } else {
              console.log(`[TelnyxConnectionHandler] Dialed number ${to} has no mapped Agent. Using default config.`);
            }
          } catch (dbErr) {
            console.error('[TelnyxConnectionHandler] Error fetching agent from DB:', dbErr);
          }
        }
        
        await conversationManager.startConversation(config, 'telnyx');
      } 
      else if (msg.event === 'media') {
        // Telnyx sends audio payload in base64
        if (msg.media && msg.media.payload) {
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          conversationManager.handleIncomingAudio(audioBuffer);
        }
      } 
      else if (msg.event === 'stop') {
        console.log('[TelnyxConnectionHandler] Media stream stopped by Telnyx.');
        conversationManager.endConversation();
      }
    } catch (err) {
      console.error('[TelnyxConnectionHandler] Error processing message:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[TelnyxConnectionHandler] WebSocket closed.');
    conversationManager.endConversation();
  });

  ws.on('error', (err) => {
    console.error('[TelnyxConnectionHandler] WebSocket error:', err);
    conversationManager.endConversation();
  });
}

module.exports = { setupTelnyxConnectionHandler };

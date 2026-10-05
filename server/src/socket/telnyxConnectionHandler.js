const { ConversationManager } = require('../services/ConversationManager');
const { TelnyxChannelAdapter } = require('../channels/TelnyxChannelAdapter');
const { dbService } = require('../services/DatabaseService');
const { loadAgentRuntime } = require('../modules/agent/agentRuntime');

function setupTelnyxConnectionHandler(ws, req, to = null) {
  console.log('[TelnyxConnectionHandler] Initializing new session...');
  
  // We'll extract the streamSid from the 'start' event later
  const channelAdapter = new TelnyxChannelAdapter(ws);
  let conversationManager = null;
  let startPromise = null;
  let ended = false;
  const pendingAudio = [];

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

        let providerConfig = null;

        if (to) {
          try {
            // Find if this phone number is mapped to an Agent
            const dbPhone = await dbService.prisma.phoneNumber.findUnique({
              where: { phoneNumber: to },
            });
            
            if (dbPhone && dbPhone.agentId) {
              console.log(`[TelnyxConnectionHandler] Routing call to Agent ID: ${dbPhone.agentId}`);
              
              const { agent, registry, systemPrompt } = await loadAgentRuntime(dbPhone.agentId);
              
              config = {
                ...agent,
                systemPrompt,
                firstMessage: agent.initialMessage,
                voiceId: agent.voiceId,
                language: agent.language
              };

              providerConfig = agent.providers || null;
            } else {
              console.log(`[TelnyxConnectionHandler] Dialed number ${to} has no mapped Agent. Using default config.`);
            }
          } catch (dbErr) {
            console.error('[TelnyxConnectionHandler] Error fetching agent from DB:', dbErr);
          }
        }
        
        conversationManager = new ConversationManager(channelAdapter, providerConfig);
        startPromise = conversationManager.startConversation(config, 'telnyx');

        await startPromise;

        for (const audioBuffer of pendingAudio.splice(0)) {
          if (!ended) conversationManager.handleIncomingAudio(audioBuffer);
        }
        if (ended) conversationManager.endConversation();
      } 
      else if (msg.event === 'media') {
        // Telnyx sends audio payload in base64
        if (msg.media && msg.media.payload) {
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          if (conversationManager && conversationManager.isCallActive) {
            conversationManager.handleIncomingAudio(audioBuffer);
          } else if (!ended) {
            pendingAudio.push(audioBuffer);
          }
        }
      } 
      else if (msg.event === 'stop') {
        console.log('[TelnyxConnectionHandler] Media stream stopped by Telnyx.');
        ended = true;
        if (conversationManager) conversationManager.endConversation();
      }
    } catch (err) {
      console.error('[TelnyxConnectionHandler] Error processing message:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[TelnyxConnectionHandler] WebSocket closed.');
    ended = true;
    if (conversationManager) conversationManager.endConversation();
  });

  ws.on('error', (err) => {
    console.error('[TelnyxConnectionHandler] WebSocket error:', err);
    ended = true;
    if (conversationManager) conversationManager.endConversation();
  });
}

module.exports = { setupTelnyxConnectionHandler };

const EventEmitter = require('events');
const { STTService } = require('../integrations/stt/sttService');
const { LLMService } = require('../integrations/llm/llmService');
const { TTSProvider } = require('../integrations/tts/ttsProvider');
const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');
const { dentalTools, executeDentalTool } = require('../integrations/llm/dentalTools');

class ConversationManager extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;
    this.stt = new STTService();
    this.llm = new LLMService();
    
    // Choose TTS provider based on env var, defaulting to ElevenLabs
    const ttsProviderStr = (process.env.TTS_PROVIDER || '').trim().toLowerCase();
    if (ttsProviderStr === 'fish') {
      this.tts = new FishAudioTTSProvider();
    } else {
      this.tts = new TTSProvider();
    }
    
    this.isCallActive = false;
    this.transcript = [];

    this.userSpeechBuffer = "";
    this.silenceTimeout = null;
    this.TURN_TIMEOUT_MS = 700; // Wait 0.7 seconds of silence before responding
    
    this.setupListeners();
  }

  setupListeners() {
    // STT Events
    this.stt.on('transcript', (text, isFinal) => {
      if (isFinal && text.trim()) {
        this.userSpeechBuffer += (this.userSpeechBuffer ? " " : "") + text.trim();
        
        // Send the updated buffer to the client, but keep isFinal false so it stays in one bubble
        this.sendToClient({ event: 'transcript', data: { text: this.userSpeechBuffer, isFinal: false, speaker: 'user' } });
        
        // Clear any existing timeout
        if (this.silenceTimeout) {
          clearTimeout(this.silenceTimeout);
        }
        
        // Start a new timeout waiting for the user to continue
        this.silenceTimeout = setTimeout(() => {
          if (this.userSpeechBuffer.trim()) {
            const finalText = this.userSpeechBuffer.trim();
            // Now finalize the bubble on the UI
            this.sendToClient({ event: 'transcript', data: { text: finalText, isFinal: true, speaker: 'user' } });
            
            this.handleUserUtterance(finalText);
            this.userSpeechBuffer = "";
          }
        }, this.TURN_TIMEOUT_MS);
      } else if (!isFinal && text.trim()) {
        // For interim results, combine with the existing buffer
        const currentInterim = this.userSpeechBuffer + (this.userSpeechBuffer ? " " : "") + text.trim();
        this.sendToClient({ event: 'transcript', data: { text: currentInterim, isFinal: false, speaker: 'user' } });
      }
    });

    this.stt.on('speech_start', () => {
      // If the user starts speaking, clear the silence timeout
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
      }
      
      console.log('[ConversationManager] User started speaking. Interrupting agent.');
      this.tts.interrupt();
      if (this.llm.abort) {
        this.llm.abort();
      }
      this.sendToClient({ event: 'clear_audio' });
    });

    this.stt.on('error', (err) => {
      console.error('[ConversationManager] STT Error:', err);
    });

    this.llm.on('llm_token', (token) => {
      // Feed tokens to TTS for streaming speech synthesis
      this.tts.feedText(token);
    });

    this.llm.on('llm_reply_complete', (fullReply) => {
      this.transcript.push({ role: 'assistant', content: fullReply });
      this.sendToClient({ event: 'transcript', data: { text: fullReply, isFinal: true, speaker: 'agent' } });
      this.tts.flush(); // Flush the TTS stream since the utterance is complete
    });

    this.llm.on('llm_error', (err) => {
      console.error('[ConversationManager] LLM Error:', err);
    });

    this.llm.on('tool_call', (toolName, args) => {
      console.log(`[ConversationManager] Tool called: ${toolName}`, args);
      const result = executeDentalTool(toolName, args);
      
      // Add tool message to transcript
      this.transcript.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: "call_" + Math.random().toString(36).substring(7),
          type: "function",
          function: { name: toolName, arguments: JSON.stringify(args) }
        }]
      });
      
      this.transcript.push({
        role: 'tool',
        tool_call_id: this.transcript[this.transcript.length - 1].tool_calls[0].id,
        name: toolName,
        content: JSON.stringify(result)
      });
      
      // Generate response after tool execution
      this.llm.generateResponse(this.transcript, dentalTools);
    });

    // TTS Events
    this.tts.on('audio', (audioBuffer) => {
      // Send raw audio bytes down to the client WebSocket
      this.sendToClient({ event: 'audio', data: audioBuffer.toString('base64') });
    });
  }

  async startConversation(config) {
    this.sendToClient({ event: 'start', config });
    console.log('[ConversationManager] Starting conversation with config:', config);
    this.isCallActive = true;
    
    const systemPrompt = config.systemPrompt || "You are a friendly and professional dental clinic receptionist. You can help users check availability and book dental appointments. Always use the provided tools to check availability and book appointments when requested. Keep your answers brief and natural.";
    this.llm.initialize(systemPrompt);
    await this.stt.connect();
    
    // Kick off the conversation with an instant greeting
    const greeting = "Hi, thanks for calling! You’ve reached our reception desk. How can I help you today?";
    this.transcript.push({ role: 'assistant', content: greeting });
    this.sendToClient({ event: 'transcript', data: { text: greeting, isFinal: true, speaker: 'agent' } });
    this.tts.feedText(greeting);
    this.tts.flush();
  }

  handleIncomingAudio(audioBuffer) {
    if (this.isCallActive) {
      this.stt.processAudio(audioBuffer);
    }
  }

  handleUserUtterance(text) {
    this.transcript.push({ role: 'user', content: text });
    this.llm.generateResponse(this.transcript, dentalTools);
  }

  endConversation() {
    console.log('[ConversationManager] Ending conversation.');
    this.isCallActive = false;
    this.stt.disconnect();
    this.tts.interrupt();
  }

  sendToClient(msg) {
    if (this.ws && this.ws.readyState === 1) { // WebSocket.OPEN
      this.ws.send(JSON.stringify(msg));
    }
  }
}

module.exports = { ConversationManager };

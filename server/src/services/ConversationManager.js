const EventEmitter = require('events');
const { STTService } = require('../integrations/stt/sttService');
const { LLMService } = require('../integrations/llm/llmService');
const { TTSProvider } = require('../integrations/tts/ttsProvider');
const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');

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

    // Turn detection variables
    this.userSpeechBuffer = "";
    this.silenceTimeout = null;
    this.TURN_TIMEOUT_MS = 1500; // Wait 1.5 seconds of silence before responding
    
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
      
      // Barge-in logic: User started speaking, interrupt TTS if it's playing
      // Temporarily disabled to prevent speaker echo from accidentally interrupting the AI!
      // this.tts.interrupt();
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

    this.llm.on('tool_call', (toolName, args) => {
      console.log(`[ConversationManager] Tool called: ${toolName}`, args);
      // Execute tool and feed result back to LLM
      // this.llm.submitToolResult(toolName, result);
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
    
    const systemPrompt = config.systemPrompt || "You are a friendly AI.";
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
    this.llm.generateResponse(this.transcript);
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

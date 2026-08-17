const EventEmitter = require('events');
const { STTService } = require('../integrations/stt/sttService');
const { LLMService } = require('../integrations/llm/llmService');
const { TTSProvider } = require('../integrations/tts/ttsProvider');
const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');
const { dentalTools, executeDentalTool } = require('../integrations/llm/dentalTools');
const { UsageTracker } = require('./UsageTracker');
const { CostCalculator } = require('./CostCalculator');
const { dbService } = require('./DatabaseService');

class ConversationManager extends EventEmitter {
  constructor(channelAdapter) {
    super();
    this.channel = channelAdapter;
    
    // Explicit State Machine
    this.state = 'CREATED'; // CREATED, CONNECTING, CONNECTED, LISTENING, THINKING, SPEAKING, INTERRUPTED, ENDING, ERROR
    
    this.stt = new STTService();
    this.llm = new LLMService();
    
    // Choose TTS provider based on env var, defaulting to ElevenLabs
    const ttsProviderStr = (process.env.TTS_PROVIDER || '').trim().toLowerCase();
    if (ttsProviderStr === 'fish') {
      this.tts = new FishAudioTTSProvider();
    } else {
      this.tts = new TTSProvider();
    }
    
    this.usageTracker = new UsageTracker();
    this.costCalculator = new CostCalculator();
    
    this.transcript = [];
    this.customTools = [];

    this.userSpeechBuffer = "";
    this.silenceTimeout = null;
    this.TURN_TIMEOUT_MS = 700; // Wait 0.7 seconds of silence before responding to prevent sentence splitting
    
    this.setupListeners();
    this.setupChannelListeners();
  }

  setupChannelListeners() {
    this.channel.on('disconnected', () => {
      console.log('[ConversationManager] Channel disconnected.');
      this.endConversation();
    });

    this.channel.on('error', (err) => {
      console.error('[ConversationManager] Channel error:', err);
      this.state = 'ERROR';
      this.endConversation();
    });
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

    this.llm.on('token_usage', (usageObj) => {
      this.usageTracker.addLLMTokens(usageObj.prompt_tokens, usageObj.completion_tokens);
    });

    this.llm.on('llm_error', (err) => {
      console.error('[ConversationManager] LLM Error:', err);
    });

    this.llm.on('tool_call', (toolName, args) => {
      console.log(`[ConversationManager] Tool called: ${toolName}`, args);
      this.usageTracker.incrementToolCall();
      
      if (toolName === 'end_call') {
        setTimeout(() => {
          this.sendToClient({ event: 'stop' });
          this.endConversation();
        }, 5000);
        return;
      }
      
      if (toolName === 'save_collected_data') {
        console.log(`[ConversationManager] Data successfully collected:`, args);
        
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
          content: JSON.stringify({ success: true, message: "Data saved successfully. You may now proceed with the user's primary request." })
        });
        
        this.llm.generateResponse(this.transcript, this.getAllTools());
        return;
      }

      // Check if it's a built-in dental tool
      const isBuiltIn = dentalTools.some(t => t.function.name === toolName);
      
      if (isBuiltIn) {
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
        this.llm.generateResponse(this.transcript, this.getAllTools());
      } else {
        // Route custom tool to frontend
        console.log(`[ConversationManager] Routing custom tool ${toolName} to frontend.`);
        
        this.transcript.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: "call_" + Math.random().toString(36).substring(7),
            type: "function",
            function: { name: toolName, arguments: JSON.stringify(args) }
          }]
        });
        
        this.sendToClient({
          event: 'tool_execution_request',
          toolName: toolName,
          args: args,
          toolCallId: this.transcript[this.transcript.length - 1].tool_calls[0].id
        });
      }
    });

    // TTS Events
    this.tts.on('audio', (audioBuffer) => {
      // Send raw audio bytes down to the client WebSocket
      this.sendToClient({ event: 'audio', data: audioBuffer.toString('base64') });
    });

    this.tts.on('tts_characters', (count) => {
      this.usageTracker.addTTSCharacters(count);
    });
  }

  async startConversation(config) {
    this.sendToClient({ event: 'start', config });
    console.log('[ConversationManager] Starting conversation with config:', config);
    this.isCallActive = true;
    
    // Process Voice Customization
    if (config.voiceId) {
      if (typeof this.tts.setVoiceId === 'function') {
        this.tts.setVoiceId(config.voiceId);
      }
    }

    // Process Custom Tools
    if (config.customTools && Array.isArray(config.customTools)) {
      this.customTools = config.customTools;
    }
    
    const basePrompt = config.systemPrompt || "You are a friendly and professional dental clinic receptionist. You can help users check availability and book dental appointments. Always use the provided tools to check availability and book appointments when requested. Keep your answers brief and natural.";
    
    // Inject the current date so the AI has temporal context and doesn't hallucinate dates
    const currentDateStr = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    let fullPrompt = `${basePrompt}\n\nCRITICAL CONTEXT: The current date and time is ${currentDateStr}. If the user provides a time without a date, you MUST ask them for the date. NEVER assume or hallucinate a date.`;
    
    // Inject Data Collection Requirements
    if (config.dataToCollect && config.dataToCollect.length > 0) {
      fullPrompt += `\n\nDATA COLLECTION MANDATE: You MUST collect the following fields from the user: ${config.dataToCollect.join(', ')}.
RULES FOR DATA COLLECTION:
1. Ask for these fields ONE BY ONE. Do not ask for multiple fields at the same time.
2. When the user provides a detail (like their name or email), confirm it back to them naturally (e.g., "Got it, yash@gmail.com. Is that correct?"). Do NOT spell it out letter-by-letter.
3. Only move on to the next field after they confirm it is correct.
4. Once you have collected and confirmed all the required fields, you MUST call the 'save_collected_data' tool.
5. You are strictly forbidden from fulfilling their primary request or calling any other custom tools until 'save_collected_data' has been successfully called.`;
      
      // Inject the built-in data collection tool
      this.customTools.push({
        type: "function",
        function: {
          name: "save_collected_data",
          description: "Save the user's data after collecting and confirming it.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" }
            }
          }
        }
      });
    }

    this.llm.initialize(fullPrompt);
    this.stt.connect().catch(e => console.error('[ConversationManager] STT connect error:', e));
    
    // Kick off the conversation with an instant greeting
    const greeting = config.firstMessage || "Hi, thanks for calling! You’ve reached our reception desk. How can I help you today?";
    this.transcript.push({ role: 'assistant', content: greeting });
    this.sendToClient({ event: 'transcript', data: { text: greeting, isFinal: true, speaker: 'agent' } });
    this.tts.feedText(greeting);
    this.tts.flush();
  }

  getAllTools() {
    return [
      ...dentalTools, 
      ...this.customTools,
      {
        type: "function",
        function: {
          name: "end_call",
          description: "Ends the current call. ONLY call this tool AFTER you have explicitly said a polite goodbye."
        }
      }
    ];
  }

  handleIncomingAudio(audioBuffer) {
    if (this.isCallActive) {
      this.stt.processAudio(audioBuffer);
    }
  }

  handleUserUtterance(text) {
    this.transcript.push({ role: 'user', content: text });
    this.llm.generateResponse(this.transcript, this.getAllTools());
  }

  handleFrontendToolResult(toolName, result, toolCallId) {
    console.log(`[ConversationManager] Received frontend result for ${toolName}:`, result);
    
    // Find the latest tool call in the transcript (if toolCallId not provided)
    let targetId = toolCallId;
    if (!targetId && this.transcript.length > 0) {
      const lastMsg = this.transcript[this.transcript.length - 1];
      if (lastMsg.tool_calls && lastMsg.tool_calls[0]) {
        targetId = lastMsg.tool_calls[0].id;
      }
    }

    this.transcript.push({
      role: 'tool',
      tool_call_id: targetId || ("call_" + Math.random().toString(36).substring(7)),
      name: toolName,
      content: JSON.stringify(result)
    });
    
    // Generate the next response using the result
    this.llm.generateResponse(this.transcript, this.getAllTools());
  }

  endConversation() {
    if (!this.isCallActive && this.state !== 'CONNECTING' && this.state !== 'CONNECTED') return;
    
    console.log('[ConversationManager] Ending conversation.');
    this.state = 'ENDING';
    this.isCallActive = false;
    this.stt.disconnect();
    this.tts.interrupt();

    this.usageTracker.addSTTDuration(this.usageTracker.finalize().callDurationSeconds);
    const usage = this.usageTracker.usage;
    const cost = this.costCalculator.calculateCost(usage);
    
    console.log('[ConversationManager] Final Usage:', usage);
    console.log('[ConversationManager] Estimated Cost:', cost);
    
    this.sendToClient({
      type: 'usage.updated',
      usage: usage,
      cost: cost
    });

    // Save to database
    dbService.saveSession({
      endedAt: new Date(),
      provider: this.channel.getSessionMetadata ? this.channel.getSessionMetadata().provider : "browser_websocket",
      sttCost: cost.sttCost,
      llmCost: cost.llmCost,
      ttsCost: cost.ttsCost,
      totalCost: cost.totalCost,
      sttDurationSeconds: usage.sttDurationSeconds,
      llmPromptTokens: usage.llmPromptTokens,
      llmCompletionTokens: usage.llmCompletionTokens,
      ttsCharacters: usage.ttsCharacters,
      toolCalls: usage.toolCalls,
      transcript: this.transcript // Saves full transcript array
    });
  }

  sendToClient(msg) {
    if (this.channel) {
      this.channel.sendControlMessage(msg);
    }
  }
}

module.exports = { ConversationManager };

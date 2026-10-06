const EventEmitter = require('events');
const { STTService } = require('../integrations/stt/sttService');
const { LLMService } = require('../integrations/llm/llmService');
const { TTSProvider } = require('../integrations/tts/ttsProvider');
const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');
const { UsageTracker } = require('./UsageTracker');
const { CostCalculator } = require('./CostCalculator');
const { dbService } = require('./DatabaseService');
const { ttsCache } = require('../integrations/tts/ttsCache');
const { SarvamTTSProvider } = require('../integrations/tts/sarvamTtsProvider');
const { ToolRegistry } = require('../tools/ToolRegistry');
const { ToolExecutor } = require('../tools/ToolExecutor');
const { buildAgentPrompt, DEFAULT_ASSISTANT_NAME } = require('../modules/prompt/promptBuilder');
const { buildToolSchema } = require('../tools/WebhookToolExecutor');
const { CallStateManager } = require('./CallStateManager');
const { createLLM, createTTS, createSTT } = require('../integrations/ProviderFactory');

// Maps a base language code to a factory for the TTS provider that should
// handle it. Anything not listed falls through to the default provider
// chosen from TTS_PROVIDER (ElevenLabs/Fish). Add a new language's provider
// here rather than hardcoding another if-branch in startConversation.
const LANGUAGE_TTS_PROVIDERS = {
  hi: () => new SarvamTTSProvider(),
};

class ConversationManager extends EventEmitter {
  constructor(channelAdapter, providerConfig = null, options = {}) {
    super();
    this.channel = channelAdapter;
    this.textOnly = options.textOnly === true;

    // Explicit State Machine
    this.state = 'CREATED'; // CREATED, CONNECTING, CONNECTED, LISTENING, THINKING, SPEAKING, INTERRUPTED, ENDING, ERROR

    this.providerConfig = providerConfig;
    this.llm = createLLM(providerConfig?.llm);
    this.stt = this.textOnly ? new EventEmitter() : createSTT(providerConfig?.stt);
    this.tts = this.textOnly ? null : createTTS(providerConfig?.tts);

    this.usageTracker = new UsageTracker();
    this.costCalculator = new CostCalculator();

    this.transcript = [];
    this.registry = new ToolRegistry();
    
    // Will be initialized in startConversation
    this.stateManager = null;

    this.toolExecutor = new ToolExecutor({
      registry: this.registry,
      tts: this.tts,
      llm: this.llm,
      transcript: this.transcript,
      sendToClient: this.sendToClient.bind(this),
      endConversation: this.endConversation.bind(this),
      usageTracker: this.usageTracker,
      getRecentTranscript: this.getRecentTranscript.bind(this),
      getStateManager: () => this.stateManager
    });

    this.userSpeechBuffer = "";
    this.silenceTimeout = null;
    this.TURN_TIMEOUT_MS = 500;

    // Active call's language (BCP-47), set in startConversation. Drives
    // filler-line language selection and TTS provider routing.
    this.language = 'en-US';

    // Caps how much transcript history we actually send to the LLM each
    // turn. The full transcript is still kept in memory and saved to the DB
    // in full at the end of the call.
    this.MAX_CONTEXT_MESSAGES = 40;

    this.setupListeners();
    this.setupChannelListeners();
  }

  setupTtsListeners() {
    this.tts.removeAllListeners();
    this.tts.on('audio', (audioBuffer) => {
      if (this.channel && typeof this.channel.sendAudio === 'function') {
          this.channel.sendAudio(audioBuffer, this.tts.sampleRate || 16000);
      }
    });
    this.tts.on('tts_characters', (count) => {
      this.usageTracker.addTTSCharacters(count);
    });
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
      
      // Aggressive LLM abort on speech start
      if (this.llm.abort) {
        this.llm.abort();
      }
      
      // Alert the tool executor that we've been interrupted
      if (this.toolExecutor.abortCurrentExecution) {
        this.toolExecutor.abortCurrentExecution();
      }

      if (this.channel && typeof this.channel.clearAudio === 'function') {
        this.channel.clearAudio();
      }

      this.sendToClient({ event: 'clear_audio' });
    });

    this.stt.on('error', (err) => {
      console.error('[ConversationManager] STT Error:', err);
    });

    this.llm.on('llm_token', (token) => {
      // Feed tokens to TTS for streaming speech synthesis
      if (!this.textOnly) this.tts.feedText(token);
    });

    this.llm.on('llm_reply_complete', (fullReply) => {
      this.transcript.push({ role: 'assistant', content: fullReply });
      this.sendToClient({ event: 'transcript', data: { text: fullReply, isFinal: true, speaker: 'agent' } });
      if (!this.textOnly) {
        this.tts.flush(); // Flush the TTS stream since the utterance is complete
      }
    });

    this.llm.on('token_usage', (usageObj) => {
      this.usageTracker.addLLMTokens(usageObj.prompt_tokens, usageObj.completion_tokens);
    });

    this.llm.on('llm_error', (err) => {
      console.error('[ConversationManager] LLM Error:', err);
    });

    this.llm.on('tool_calls', async (toolCallEntries, fullReply) => {
      // Process tool calls sequentially to prevent race conditions on shared DB state
      for (let i = 0; i < toolCallEntries.length; i++) {
        const tc = toolCallEntries[i];
        if (tc.name) {
          let args = {};
          try { args = tc.argsStr.trim() ? JSON.parse(tc.argsStr) : {}; } catch (e) {}
          
          const isLast = (i === toolCallEntries.length - 1);
          // Pass preamble only to the first tool call to avoid duplicate speech
          const preamble = (i === 0) ? fullReply : '';
          
          await this.toolExecutor.handle(tc.name, args, preamble, tc.id, isLast);
        }
      }
    });

    // TTS Events
    if (!this.textOnly) this.setupTtsListeners();
  }

  async startConversation(config, provider = 'browser') {
    this.sendToClient({ event: 'start', config });
    console.log('[ConversationManager] Starting conversation with config:', config);
    this.isCallActive = true;
    this.toolExecutor.agentId = config.agentId;

    const language = config.language || 'en-US';
    this.language = language;
    const baseLang = language.split('-')[0].toLowerCase();

    if (!this.textOnly && !this.providerConfig?.tts?.provider && LANGUAGE_TTS_PROVIDERS[baseLang]) {
      console.log(`[ConversationManager] ${baseLang} selected, overriding TTS provider`);
      this.tts = LANGUAGE_TTS_PROVIDERS[baseLang]();
      this.setupTtsListeners();
      if (typeof this.tts.setLanguage === 'function') {
        this.tts.setLanguage(language);
      }
      this.toolExecutor.tts = this.tts;
    }

    // Process Voice Customization
    if (!this.textOnly && config.voiceId && config.voiceId !== 'default') {
      if (typeof this.tts.setVoiceId === 'function') {
        this.tts.setVoiceId(config.voiceId);
      }
    }
    
    // Initialize CallStateManager
    this.stateManager = new CallStateManager({
      timezone: config.timezone,
      language: this.language,
      businessName: config.businessName,
      dataFields: config.dataToCollect || []
    });

    // Process Custom Tools from browser session config
    if (config.customTools && Array.isArray(config.customTools)) {
      for (const tool of config.customTools) {
        if (!tool.name) continue;
        const schema = buildToolSchema(tool);

        if (tool.type === 'webhook' && tool.webhookUrl) {
          this.registry.registerWebhook(tool.name, schema, tool);
        } else {
          this.registry.registerCustom(tool.name, schema);
        }
      }
    }

    // Build the dynamic prompt for the agent
    // No more DB fetching for bookings/availability — prompt is purely static
    const fullPrompt = this.textOnly && config.systemPrompt
      ? config.systemPrompt
      : buildAgentPrompt({ agent: config, timezone: config.timezone });

    // Inject the built-in data collection tool via registry if needed
    if (config.dataToCollect && config.dataToCollect.length > 0) {
      this.registry.injectDataCollectionTool(config.dataToCollect);
    }

    // Inject the internal CRM tools (availability, booking)
    this.registry.injectInternalCrmTools();

    this.llm.initialize(fullPrompt);
    if (!this.textOnly) {
      this.stt.connect(provider, language).catch(e => console.error('[ConversationManager] STT connect error:', e));
    }

    // Kick off the conversation with an instant greeting
    const assistantName = config.assistantName || DEFAULT_ASSISTANT_NAME;
    const greeting = config.firstMessage || (this.textOnly
      ? ''
      : `Hi, thanks for calling! This is ${assistantName}, you've reached our reception desk. How can I help you today?`);
    if (this.textOnly) {
      if (greeting) {
        this.transcript.push({ role: 'assistant', content: greeting });
        await this.channel.sendText(greeting);
      }
      return;
    }

    this.transcript.push({ role: 'assistant', content: greeting });
    this.sendToClient({ event: 'transcript', data: { text: greeting, isFinal: true, speaker: 'agent' } });

    const providerName = (this.providerConfig?.tts?.provider || process.env.TTS_PROVIDER || 'elevenlabs').trim().toLowerCase();
    const voiceId = config.voiceId || this.tts.voiceId || 'default';
    const cacheKey = ttsCache.generateKey(providerName, voiceId, greeting);
    const cachedAudio = ttsCache.get(cacheKey);

    if (cachedAudio) {
      console.log(`[ConversationManager] Cache hit for greeting! Playing instantly.`);
      if (this.channel && typeof this.channel.sendAudio === 'function') {
        // Send in chunks to simulate streaming and avoid overwhelming the channel buffer
        let offset = 0;
        const chunkSize = 8192;
        const sendChunks = () => {
          if (offset < cachedAudio.length && this.isCallActive) {
            const end = Math.min(offset + chunkSize, cachedAudio.length);
            this.channel.sendAudio(cachedAudio.subarray(offset, end), this.tts.sampleRate || 16000);
            offset += chunkSize;
            setTimeout(sendChunks, 5); // tiny delay
          }
        };
        sendChunks();
      }
    } else {
      console.log(`[ConversationManager] Cache miss for greeting. Generating and caching...`);
      let audioChunks = [];
      let interrupted = false;

      const onAudio = (chunk) => {
        audioChunks.push(chunk);
      };

      const onInterrupted = () => {
        interrupted = true;
      };

      const onComplete = () => {
        this.tts.removeListener('audio', onAudio);
        this.tts.removeListener('utterance_interrupted', onInterrupted);
        this.tts.removeListener('utterance_complete', onComplete);

        if (audioChunks.length > 0 && !interrupted) {
          ttsCache.set(cacheKey, Buffer.concat(audioChunks));
          console.log(`[ConversationManager] Saved greeting to cache.`);
        } else {
          console.log(`[ConversationManager] Greeting was interrupted, bypassing cache save.`);
        }
      };

      this.tts.on('audio', onAudio);
      this.tts.once('utterance_interrupted', onInterrupted);
      this.tts.once('utterance_complete', onComplete);

      this.tts.feedText(greeting);
      this.tts.flush();
    }
  }

  getAllTools() {
    return this.registry.getAllSchemas();
  }

  // Returns the slice of transcript actually sent to the LLM each turn.
  // Keeps request size (and cost/latency) roughly flat on long calls while
  // this.transcript itself still keeps everything for the DB save at the end.
  getRecentTranscript() {
    if (this.transcript.length <= this.MAX_CONTEXT_MESSAGES) return this.transcript;
    
    let startIndex = this.transcript.length - this.MAX_CONTEXT_MESSAGES;
    
    // Boundary-aware trim: ensure we don't split a tool_call from its tool result.
    // If the slice lands on a 'tool' result, walk backward to include the 'assistant' message that spawned it.
    while (startIndex > 0 && this.transcript[startIndex].role === 'tool') {
      startIndex--;
    }
    
    return this.transcript.slice(startIndex);
  }

  handleIncomingAudio(audioBuffer) {
    if (this.isCallActive) {
      this.stt.processAudio(audioBuffer);
    }
  }

  async handleUserUtterance(text) {
    if (!this.isCallActive) return;

    if (this.stateManager && this.stateManager.phase === 'GREETING') {
      this.stateManager.startCollecting();
    }

    // Message Consolidation: Combine consecutive user messages to save token overhead
    if (this.transcript.length > 0) {
      const lastMsg = this.transcript[this.transcript.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content += " " + text;
        return this.llm.generateResponse(
          this.getRecentTranscript(), 
          this.getAllTools(), 
          'auto',
          this.stateManager ? this.stateManager.getContextInjection() : null
        );
        return;
      }
    }
    this.transcript.push({ role: 'user', content: text });
    return this.llm.generateResponse(
      this.getRecentTranscript(), 
      this.getAllTools(), 
      'auto',
      this.stateManager ? this.stateManager.getContextInjection() : null
    );
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
    
    // Notify the frontend that the tool call has completed so it can
    // update the transcript UI with the result and timing.
    this.sendToClient({
      event: 'tool_call_completed',
      toolName,
      toolCallId: targetId || toolCallId,
      result,
      timestamp: Date.now()
    });
    
    // Update state manager based on tool result
    if (this.stateManager) {
      this.stateManager.onToolResult(toolName, result);
    }

    // Generate the next response using the result
    this.llm.generateResponse(
      this.getRecentTranscript(), 
      this.getAllTools(), 
      'auto', 
      this.stateManager ? this.stateManager.getContextInjection() : null
    );
  }

  endConversation() {
    if (!this.isCallActive && this.state !== 'CONNECTING' && this.state !== 'CONNECTED') return;

    console.log('[ConversationManager] Ending conversation.');
    this.state = 'ENDING';
    this.isCallActive = false;

    // Prevent a pending silence timeout from firing after the call has
    // already ended and trying to process a stale buffered utterance.
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }

    this.stt.disconnect();
    this.tts.interrupt();

    this.usageTracker.addSTTDuration(this.usageTracker.finalize().callDurationSeconds);
    const usage = this.usageTracker.usage;
    const cost = this.costCalculator.calculateCost(usage, this.providerConfig);

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
      transcript: this.transcript // Saves full transcript array (untrimmed)
    });
  }

  sendToClient(msg) {
    if (this.channel) {
      if (this.textOnly && msg?.event === 'transcript' && msg.data?.speaker === 'agent' && msg.data.text) {
        this.channel.sendText(msg.data.text).catch(error => {
          console.error('[ConversationManager] WhatsApp text send error:', error);
        });
      }
      this.channel.sendControlMessage(msg);
    }
  }
}

module.exports = { ConversationManager };

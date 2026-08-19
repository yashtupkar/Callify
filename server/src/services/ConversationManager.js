// const EventEmitter = require('events');
// const { STTService } = require('../integrations/stt/sttService');
// const { LLMService } = require('../integrations/llm/llmService');
// const { TTSProvider } = require('../integrations/tts/ttsProvider');
// const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');
// const { dentalTools, executeDentalTool } = require('../integrations/llm/dentalTools');
// const { UsageTracker } = require('./UsageTracker');
// const { CostCalculator } = require('./CostCalculator');
// const { dbService } = require('./DatabaseService');
// const { ttsCache } = require('../integrations/tts/ttsCache');
// const { SarvamTTSProvider } = require('../integrations/tts/sarvamTtsProvider');

// class ConversationManager extends EventEmitter {
//   constructor(channelAdapter) {
//     super();
//     this.channel = channelAdapter;
    
//     // Explicit State Machine
//     this.state = 'CREATED'; // CREATED, CONNECTING, CONNECTED, LISTENING, THINKING, SPEAKING, INTERRUPTED, ENDING, ERROR
    
//     this.stt = new STTService();
//     this.llm = new LLMService();
    
//     // Choose TTS provider based on env var, defaulting to ElevenLabs
//     const ttsProviderStr = (process.env.TTS_PROVIDER || '').trim().toLowerCase();
    
//     if (ttsProviderStr === 'fish') {
//       this.tts = new FishAudioTTSProvider({ sampleRate: 16000 });
//     } else {
//       this.tts = new TTSProvider();
//     }
    
//     this.usageTracker = new UsageTracker();
//     this.costCalculator = new CostCalculator();
    
//     this.transcript = [];
//     this.customTools = [];

//     this.userSpeechBuffer = "";
//     this.silenceTimeout = null;
//     this.TURN_TIMEOUT_MS = 150; // Ultra-low latency for instant response
    
//     this.setupListeners();
//     this.setupChannelListeners();
//   }

//   setupTtsListeners() {
//     this.tts.removeAllListeners();
//     this.tts.on('audio', (audioBuffer) => {
//       if (this.channel && typeof this.channel.sendAudio === 'function') {
//           this.channel.sendAudio(audioBuffer, this.tts.sampleRate || 16000);
//       }
//     });
//     this.tts.on('tts_characters', (count) => {
//       this.usageTracker.addTTSCharacters(count);
//     });
//   }

//   setupChannelListeners() {
//     this.channel.on('disconnected', () => {
//       console.log('[ConversationManager] Channel disconnected.');
//       this.endConversation();
//     });

//     this.channel.on('error', (err) => {
//       console.error('[ConversationManager] Channel error:', err);
//       this.state = 'ERROR';
//       this.endConversation();
//     });
//   }

//   setupListeners() {
//     // STT Events
//     this.stt.on('transcript', (text, isFinal) => {
//       if (isFinal && text.trim()) {
//         this.userSpeechBuffer += (this.userSpeechBuffer ? " " : "") + text.trim();
        
//         // Send the updated buffer to the client, but keep isFinal false so it stays in one bubble
//         this.sendToClient({ event: 'transcript', data: { text: this.userSpeechBuffer, isFinal: false, speaker: 'user' } });
        
//         // Clear any existing timeout
//         if (this.silenceTimeout) {
//           clearTimeout(this.silenceTimeout);
//         }
        
//         // Start a new timeout waiting for the user to continue
//         this.silenceTimeout = setTimeout(() => {
//           if (this.userSpeechBuffer.trim()) {
//             const finalText = this.userSpeechBuffer.trim();
//             // Now finalize the bubble on the UI
//             this.sendToClient({ event: 'transcript', data: { text: finalText, isFinal: true, speaker: 'user' } });
            
//             this.handleUserUtterance(finalText);
//             this.userSpeechBuffer = "";
//           }
//         }, this.TURN_TIMEOUT_MS);
//       } else if (!isFinal && text.trim()) {
//         // For interim results, combine with the existing buffer
//         const currentInterim = this.userSpeechBuffer + (this.userSpeechBuffer ? " " : "") + text.trim();
//         this.sendToClient({ event: 'transcript', data: { text: currentInterim, isFinal: false, speaker: 'user' } });
//       }
//     });

//     this.stt.on('speech_start', () => {
//       // If the user starts speaking, clear the silence timeout
//       if (this.silenceTimeout) {
//         clearTimeout(this.silenceTimeout);
//       }
      
//       console.log('[ConversationManager] User started speaking. Interrupting agent.');
//       this.tts.interrupt();
//       if (this.llm.abort) {
//         this.llm.abort();
//       }
      
//       if (this.channel && typeof this.channel.clearAudio === 'function') {
//         this.channel.clearAudio();
//       }
      
//       this.sendToClient({ event: 'clear_audio' });
//     });

//     this.stt.on('error', (err) => {
//       console.error('[ConversationManager] STT Error:', err);
//     });

//     this.llm.on('llm_token', (token) => {
//       // Feed tokens to TTS for streaming speech synthesis
//       this.tts.feedText(token);
//     });

//     this.llm.on('llm_reply_complete', (fullReply) => {
//       this.transcript.push({ role: 'assistant', content: fullReply });
//       this.sendToClient({ event: 'transcript', data: { text: fullReply, isFinal: true, speaker: 'agent' } });
//       this.tts.flush(); // Flush the TTS stream since the utterance is complete
//     });

//     this.llm.on('token_usage', (usageObj) => {
//       this.usageTracker.addLLMTokens(usageObj.prompt_tokens, usageObj.completion_tokens);
//     });

//     this.llm.on('llm_error', (err) => {
//       console.error('[ConversationManager] LLM Error:', err);
//     });

//     this.llm.on('tool_call', (toolName, args) => {
//       console.log(`[ConversationManager] Tool called: ${toolName}`, args);
//       this.usageTracker.incrementToolCall();
      
//       if (toolName === 'end_call') {
//         setTimeout(() => {
//           this.sendToClient({ event: 'stop' });
//           this.endConversation();
//         }, 5000);
//         return;
//       }
      
//       if (toolName === 'save_collected_data') {
//         console.log(`[ConversationManager] Data successfully collected:`, args);
        
//         // Filler Phrase for Masking Latency
//         this.tts.feedText("Got it, let me save that... ");
//         this.tts.flush();
        
//         this.transcript.push({
//           role: 'assistant',
//           content: null,
//           tool_calls: [{
//             id: "call_" + Math.random().toString(36).substring(7),
//             type: "function",
//             function: { name: toolName, arguments: JSON.stringify(args) }
//           }]
//         });
        
//         this.transcript.push({
//           role: 'tool',
//           tool_call_id: this.transcript[this.transcript.length - 1].tool_calls[0].id,
//           name: toolName,
//           content: JSON.stringify({ success: true, message: "Data saved successfully. You may now proceed with the user's primary request." })
//         });
        
//         this.llm.generateResponse(this.transcript, this.getAllTools());
//         return;
//       }

//       // Check if it's a built-in dental tool
//       const isBuiltIn = dentalTools.some(t => t.function.name === toolName);
      
//       if (isBuiltIn) {
//         // Filler Phrases for Built-in Dental Tools
//         if (toolName === 'check_availability') {
//           this.tts.feedText("Let me check the schedule for that time... ");
//           this.tts.flush();
//         } else if (toolName === 'book_appointment') {
//           this.tts.feedText("Alright, let me get that booked for you... ");
//           this.tts.flush();
//         }

//         const result = executeDentalTool(toolName, args);
        
//         // Add tool message to transcript
//         this.transcript.push({
//           role: 'assistant',
//           content: null,
//           tool_calls: [{
//             id: "call_" + Math.random().toString(36).substring(7),
//             type: "function",
//             function: { name: toolName, arguments: JSON.stringify(args) }
//           }]
//         });
        
//         this.transcript.push({
//           role: 'tool',
//           tool_call_id: this.transcript[this.transcript.length - 1].tool_calls[0].id,
//           name: toolName,
//           content: JSON.stringify(result)
//         });
        
//         // Generate response after tool execution
//         this.llm.generateResponse(this.transcript, this.getAllTools());
//       } else {
//         // Route custom tool to frontend
//         console.log(`[ConversationManager] Routing custom tool ${toolName} to frontend.`);
        
//         // Generic filler phrase for custom tools
//         this.tts.feedText("One moment, I'm processing that... ");
//         this.tts.flush();
        
//         this.transcript.push({
//           role: 'assistant',
//           content: null,
//           tool_calls: [{
//             id: "call_" + Math.random().toString(36).substring(7),
//             type: "function",
//             function: { name: toolName, arguments: JSON.stringify(args) }
//           }]
//         });
        
//         this.sendToClient({
//           event: 'tool_execution_request',
//           toolName: toolName,
//           args: args,
//           toolCallId: this.transcript[this.transcript.length - 1].tool_calls[0].id
//         });
//       }
//     });

//     // TTS Events
//     this.setupTtsListeners();
//   }

//   async startConversation(config, provider = 'browser') {
//     this.sendToClient({ event: 'start', config });
//     console.log('[ConversationManager] Starting conversation with config:', config);
//     this.isCallActive = true;
    
//     // Dynamic TTS provider selection based on language
//     const language = config.language || 'en-US';
//     if (language === 'hi-IN' || language === 'hi') {
//       console.log('[ConversationManager] Hindi selected, overriding TTS with Sarvam AI');
//       this.tts = new SarvamTTSProvider();
//       this.setupTtsListeners();
//       if (typeof this.tts.setLanguage === 'function') {
//         this.tts.setLanguage('hi-IN');
//       }
//     }

//     // Process Voice Customization
//     if (config.voiceId) {
//       if (typeof this.tts.setVoiceId === 'function') {
//         this.tts.setVoiceId(config.voiceId);
//       }
//     }

//     // Process Custom Tools
//     if (config.customTools && Array.isArray(config.customTools)) {
//       this.customTools = config.customTools;
//     }
    
//     const basePrompt = config.systemPrompt || "You are a friendly and professional dental clinic receptionist. You can help users check availability and book dental appointments. Always use the provided tools to check availability and book appointments when requested. Keep your answers brief and natural.";
    
//     // Inject the current date so the AI has temporal context and doesn't hallucinate dates
//     const currentDateStr = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
//     let fullPrompt = `${basePrompt}\n\nCRITICAL CONTEXT: The current date and time is ${currentDateStr}. If the user provides a time without a date, you MUST ask them for the date. NEVER assume or hallucinate a date.`;
    
//     // Inject language instruction
//     if (language !== 'en-US') {
//       fullPrompt += `\n\nLANGUAGE MANDATE: You MUST converse entirely in the language corresponding to language code: ${language}.`;
//     }
    
//     // Inject Data Collection Requirements
//     if (config.dataToCollect && config.dataToCollect.length > 0) {
//       fullPrompt += `\n\nDATA COLLECTION MANDATE: You MUST collect the following fields from the user: ${config.dataToCollect.join(', ')}.
// RULES FOR DATA COLLECTION:
// 1. Ask for these fields ONE BY ONE. Do not ask for multiple fields at the same time.
// 2. When the user provides a detail (like their name or email), confirm it back to them naturally (e.g., "Got it, yash@gmail.com. Is that correct?"). Do NOT spell it out letter-by-letter.
// 3. Only move on to the next field after they confirm it is correct.
// 4. Once you have collected and confirmed all the required fields, you MUST call the 'save_collected_data' tool.
// 5. You are strictly forbidden from fulfilling their primary request or calling any other custom tools until 'save_collected_data' has been successfully called.`;
      
//       // Inject the built-in data collection tool
//       this.customTools.push({
//         type: "function",
//         function: {
//           name: "save_collected_data",
//           description: "Save the user's data after collecting and confirming it.",
//           parameters: {
//             type: "object",
//             properties: {
//               name: { type: "string" },
//               email: { type: "string" },
//               phone: { type: "string" }
//             }
//           }
//         }
//       });
//     }

//     this.llm.initialize(fullPrompt);
//     this.stt.connect(provider, language).catch(e => console.error('[ConversationManager] STT connect error:', e));
    
//     // Kick off the conversation with an instant greeting
//     const greeting = config.firstMessage || "Hi, thanks for calling! You’ve reached our reception desk. How can I help you today?";
//     this.transcript.push({ role: 'assistant', content: greeting });
//     this.sendToClient({ event: 'transcript', data: { text: greeting, isFinal: true, speaker: 'agent' } });
    
//     const providerName = (process.env.TTS_PROVIDER || '').trim().toLowerCase() === 'fish' ? 'fish' : 'elevenlabs';
//     const voiceId = config.voiceId || this.tts.voiceId || 'default';
//     const cacheKey = ttsCache.generateKey(providerName, voiceId, greeting);
//     const cachedAudio = ttsCache.get(cacheKey);

//     if (cachedAudio) {
//       console.log(`[ConversationManager] Cache hit for greeting! Playing instantly.`);
//       if (this.channel && typeof this.channel.sendAudio === 'function') {
//         // Send in chunks to simulate streaming and avoid overwhelming the channel buffer
//         let offset = 0;
//         const chunkSize = 8192;
//         const sendChunks = () => {
//           if (offset < cachedAudio.length && this.isCallActive) {
//             const end = Math.min(offset + chunkSize, cachedAudio.length);
//             this.channel.sendAudio(cachedAudio.subarray(offset, end), this.tts.sampleRate || 16000);
//             offset += chunkSize;
//             setTimeout(sendChunks, 5); // tiny delay
//           }
//         };
//         sendChunks();
//       }
//     } else {
//       console.log(`[ConversationManager] Cache miss for greeting. Generating and caching...`);
//       let audioChunks = [];
//       let interrupted = false;
      
//       const onAudio = (chunk) => {
//         audioChunks.push(chunk);
//       };
      
//       const onInterrupted = () => {
//         interrupted = true;
//       };
      
//       const onComplete = () => {
//         this.tts.removeListener('audio', onAudio);
//         this.tts.removeListener('utterance_interrupted', onInterrupted);
//         this.tts.removeListener('utterance_complete', onComplete);
        
//         if (audioChunks.length > 0 && !interrupted) {
//           ttsCache.set(cacheKey, Buffer.concat(audioChunks));
//           console.log(`[ConversationManager] Saved greeting to cache.`);
//         } else {
//           console.log(`[ConversationManager] Greeting was interrupted, bypassing cache save.`);
//         }
//       };
      
//       this.tts.on('audio', onAudio);
//       this.tts.once('utterance_interrupted', onInterrupted);
//       this.tts.once('utterance_complete', onComplete);
      
//       this.tts.feedText(greeting);
//       this.tts.flush();
//     }
//   }

//   getAllTools() {
//     return [
//       ...dentalTools,
//       ...this.customTools,
//       {
//         type: "function",
//         function: {
//           name: "end_call",
//           description: "Ends the current call. ONLY call this tool AFTER you have explicitly said a polite goodbye."
//         }
//       }
//     ];
//   }

//   handleIncomingAudio(audioBuffer) {
//     if (this.isCallActive) {
//       this.stt.processAudio(audioBuffer);
//     }
//   }

//   handleUserUtterance(text) {
//     this.transcript.push({ role: 'user', content: text });
//     this.llm.generateResponse(this.transcript, this.getAllTools());
//   }

//   handleFrontendToolResult(toolName, result, toolCallId) {
//     console.log(`[ConversationManager] Received frontend result for ${toolName}:`, result);
    
//     // Find the latest tool call in the transcript (if toolCallId not provided)
//     let targetId = toolCallId;
//     if (!targetId && this.transcript.length > 0) {
//       const lastMsg = this.transcript[this.transcript.length - 1];
//       if (lastMsg.tool_calls && lastMsg.tool_calls[0]) {
//         targetId = lastMsg.tool_calls[0].id;
//       }
//     }

//     this.transcript.push({
//       role: 'tool',
//       tool_call_id: targetId || ("call_" + Math.random().toString(36).substring(7)),
//       name: toolName,
//       content: JSON.stringify(result)
//     });
    
//     // Generate the next response using the result
//     this.llm.generateResponse(this.transcript, this.getAllTools());
//   }

//   endConversation() {
//     if (!this.isCallActive && this.state !== 'CONNECTING' && this.state !== 'CONNECTED') return;
    
//     console.log('[ConversationManager] Ending conversation.');
//     this.state = 'ENDING';
//     this.isCallActive = false;
//     this.stt.disconnect();
//     this.tts.interrupt();

//     this.usageTracker.addSTTDuration(this.usageTracker.finalize().callDurationSeconds);
//     const usage = this.usageTracker.usage;
//     const cost = this.costCalculator.calculateCost(usage);
    
//     console.log('[ConversationManager] Final Usage:', usage);
//     console.log('[ConversationManager] Estimated Cost:', cost);
    
//     this.sendToClient({
//       type: 'usage.updated',
//       usage: usage,
//       cost: cost
//     });

//     // Save to database
//     dbService.saveSession({
//       endedAt: new Date(),
//       provider: this.channel.getSessionMetadata ? this.channel.getSessionMetadata().provider : "browser_websocket",
//       sttCost: cost.sttCost,
//       llmCost: cost.llmCost,
//       ttsCost: cost.ttsCost,
//       totalCost: cost.totalCost,
//       sttDurationSeconds: usage.sttDurationSeconds,
//       llmPromptTokens: usage.llmPromptTokens,
//       llmCompletionTokens: usage.llmCompletionTokens,
//       ttsCharacters: usage.ttsCharacters,
//       toolCalls: usage.toolCalls,
//       transcript: this.transcript // Saves full transcript array
//     });
//   }

//   sendToClient(msg) {
//     if (this.channel) {
//       this.channel.sendControlMessage(msg);
//     }
//   }
// }

// module.exports = { ConversationManager };


const EventEmitter = require('events');
const { STTService } = require('../integrations/stt/sttService');
const { LLMService } = require('../integrations/llm/llmService');
const { TTSProvider } = require('../integrations/tts/ttsProvider');
const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');
const { dentalTools, executeDentalTool } = require('../integrations/llm/dentalTools');
const { UsageTracker } = require('./UsageTracker');
const { CostCalculator } = require('./CostCalculator');
const { dbService } = require('./DatabaseService');
const { ttsCache } = require('../integrations/tts/ttsCache');
const { SarvamTTSProvider } = require('../integrations/tts/sarvamTtsProvider');

// ---------------------------------------------------------------------------
// CORE VOICE PERSONA
// This layer is ALWAYS applied, regardless of whether the portal user
// supplies their own system prompt. It is what makes the agent sound like
// a person on a phone call instead of a chatbot reading text aloud.
// The portal/business prompt is layered on TOP of this — never replaces it.
// ---------------------------------------------------------------------------
const CORE_VOICE_PERSONA = `
You are speaking live on a phone call, not writing a message. Follow these rules on every single turn:

VOICE & TONE
- Talk the way a real person talks on the phone: warm, relaxed, a little informal. Use contractions ("I'm", "that's", "let's", "we've").
- Keep replies short — usually one sentence, at most two. This is a back-and-forth conversation, not a monologue. You can always say more on your next turn.
- Never use lists, bullet points, numbered steps, or markdown. Say things the way you'd say them out loud.
- Vary your phrasing across the call. Don't reuse the exact same acknowledgment every time (mix "got it", "perfect", "sounds good", "okay, got that").

LISTENING & PACING
- Briefly acknowledge what the caller just said before responding ("a cleaning, sure" / "Tuesday works for us").
- Ask ONE question at a time. Never stack two or three questions into a single turn.
- If something wasn't clear, ask them to repeat it naturally ("sorry, could you say that again?") — don't guess and don't ask them to spell things out unless truly necessary.

HANDLING INTERRUPTIONS
- If the caller talks over you or changes the subject, drop whatever you were saying and follow them. Don't try to finish your old sentence.

STAYING HUMAN
- Don't say you're an AI, a bot, or a language model unless directly and explicitly asked.
- Don't narrate your own actions ("I will now check the schedule for you") — just do it in conversation ("let me take a quick look...").
- Avoid scripted-sounding customer-service phrases ("I appreciate your patience", "please hold while I process your request").
`.trim();

// A few natural variants per situation so the same line isn't replayed on every call.
const FILLERS = {
  check_availability: [
    "Let me check the schedule for that...",
    "One sec, let me pull up the calendar...",
    "Let's see what we've got open...",
  ],
  book_appointment: [
    "Alright, let me get that booked for you...",
    "Okay, locking that in now...",
    "Give me just a second to get this booked...",
  ],
  save_collected_data: [
    "Got it, one sec while I save that...",
    "Perfect, let me note that down...",
    "Okay, saving that now...",
  ],
  generic: [
    "One moment...",
    "Just a sec...",
    "Let me look into that for you...",
  ],
};

function pickFiller(key) {
  const list = FILLERS[key] || FILLERS.generic;
  return list[Math.floor(Math.random() * list.length)] + " ";
}

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
      this.tts = new FishAudioTTSProvider({ sampleRate: 16000 });
    } else {
      this.tts = new TTSProvider();
    }
    
    this.usageTracker = new UsageTracker();
    this.costCalculator = new CostCalculator();
    
    this.transcript = [];
    this.customTools = [];

    this.userSpeechBuffer = "";
    this.silenceTimeout = null;
    // NOTE: 150ms was too aggressive — it treats a natural mid-sentence pause
    // (e.g. "my email is... uh, yash at gmail dot com") as the end of the turn,
    // causing the agent to respond mid-thought and feel like it's interrupting.
    // 450-600ms gives a caller room to breathe without adding noticeable lag.
    // If you have real VAD/endpointing available upstream, prefer that over a
    // fixed timeout entirely.
    this.TURN_TIMEOUT_MS = 500;
    
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
      if (this.llm.abort) {
        this.llm.abort();
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
        
        // Filler Phrase for Masking Latency (varied, not the same line every call)
        this.tts.feedText(pickFiller('save_collected_data'));
        this.tts.flush();
        
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
        // Filler Phrases for Built-in Dental Tools (varied)
        if (toolName === 'check_availability') {
          this.tts.feedText(pickFiller('check_availability'));
          this.tts.flush();
        } else if (toolName === 'book_appointment') {
          this.tts.feedText(pickFiller('book_appointment'));
          this.tts.flush();
        }

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
        
        // Generic filler phrase for custom tools (varied)
        this.tts.feedText(pickFiller('generic'));
        this.tts.flush();
        
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
    this.setupTtsListeners();
  }

  async startConversation(config, provider = 'browser') {
    this.sendToClient({ event: 'start', config });
    console.log('[ConversationManager] Starting conversation with config:', config);
    this.isCallActive = true;
    
    // Dynamic TTS provider selection based on language
    const language = config.language || 'en-US';
    if (language === 'hi-IN' || language === 'hi') {
      console.log('[ConversationManager] Hindi selected, overriding TTS with Sarvam AI');
      this.tts = new SarvamTTSProvider();
      this.setupTtsListeners();
      if (typeof this.tts.setLanguage === 'function') {
        this.tts.setLanguage('hi-IN');
      }
    }

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

    // -----------------------------------------------------------------
    // PROMPT ASSEMBLY
    // Two layers, always combined — never one-or-the-other:
    //   1. CORE_VOICE_PERSONA   -> constant, defines HOW the agent talks
    //   2. rolePrompt           -> variable, defines WHO the agent is /
    //                              WHAT it's here to do (portal prompt,
    //                              falling back to the dental default)
    // -----------------------------------------------------------------
    const rolePrompt = (config.systemPrompt && config.systemPrompt.trim())
      ? config.systemPrompt.trim()
      : "You are a friendly and professional dental clinic receptionist. You can help callers check availability and book dental appointments. Always use the provided tools to check availability and book appointments when requested.";

    let fullPrompt = `${CORE_VOICE_PERSONA}\n\n---\n\nYOUR ROLE ON THIS CALL\n${rolePrompt}`;

    // Inject the current date so the AI has temporal context and doesn't hallucinate dates
    const currentDateStr = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    fullPrompt += `\n\n---\n\nCONTEXT\nRight now it's ${currentDateStr}. If the caller gives you a time but not a date, ask them which day they mean — never assume or guess a date.`;
    
    // Inject language instruction
    if (language !== 'en-US') {
      fullPrompt += `\n\nSpeak entirely in the language for code "${language}" — including your greeting, questions, and confirmations. Don't switch to English.`;
    }
    
    // Inject Data Collection Requirements
    if (config.dataToCollect && config.dataToCollect.length > 0) {
      fullPrompt += `\n\n---\n\nCOLLECTING INFO\nBefore you can help with their main request, you need to naturally collect: ${config.dataToCollect.join(', ')}.
- Ask for one field at a time, woven into the conversation — not like a form.
- When they give you a detail, reflect it back briefly to confirm ("got it, yash@gmail.com — that right?"). Don't spell it out letter by letter unless they ask you to.
- Once they've confirmed a field, move to the next one.
- The moment all fields are collected and confirmed, call the 'save_collected_data' tool — don't announce that you're "saving data", just do it.
- Don't fulfill their original request or call any other tool until 'save_collected_data' has succeeded.`;
      
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
    this.stt.connect(provider, language).catch(e => console.error('[ConversationManager] STT connect error:', e));
    
    // Kick off the conversation with an instant greeting
    const greeting = config.firstMessage || "Hi, thanks for calling! You’ve reached our reception desk. How can I help you today?";
    this.transcript.push({ role: 'assistant', content: greeting });
    this.sendToClient({ event: 'transcript', data: { text: greeting, isFinal: true, speaker: 'agent' } });
    
    const providerName = (process.env.TTS_PROVIDER || '').trim().toLowerCase() === 'fish' ? 'fish' : 'elevenlabs';
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
    // Message Consolidation: Combine consecutive user messages to save token overhead
    if (this.transcript.length > 0) {
      const lastMsg = this.transcript[this.transcript.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content += " " + text;
        this.llm.generateResponse(this.transcript, this.getAllTools());
        return;
      }
    }
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
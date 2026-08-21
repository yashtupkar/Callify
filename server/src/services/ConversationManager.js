const EventEmitter = require('events');
const { STTService } = require('../integrations/stt/sttService');
const { LLMService } = require('../integrations/llm/llmService');
const { TTSProvider } = require('../integrations/tts/ttsProvider');
const { FishAudioTTSProvider } = require('../integrations/tts/fishAudioTtsProvider');
const { buildTools } = require('../tools/toolRegistry');
const agentStore = require('./agentStore');

// Appended to every agent's system prompt so replies sound like a human on the phone.
const VOICE_STYLE_GUIDE = `

[Voice & style rules — always follow]
- You are on a live phone call. Everything you say is spoken aloud by TTS.
- Keep replies short and conversational: 1-3 sentences. Never use lists, markdown, emojis, or headings.
- Sound human: use natural acknowledgements ("Sure thing", "Got it", "Alright") and contractions.
- Do NOT interrogate the caller one detail at a time. Ask for related details together in one natural question (e.g. "Can I get your name and the best number to reach you?") and accept whatever order they answer in.
- If the caller already mentioned a detail, never ask for it again — reuse it.
- Confirm important details (names, times, numbers) briefly before acting on them.
- Say numbers, dates, and emails the way a person would say them out loud.
- When you need to use a tool, briefly tell the caller what you're doing first (e.g. "One sec, let me check the calendar."), then call the tool.
- If a tool fails, apologize briefly and offer an alternative — never read raw errors aloud.`;

const MAX_TOOL_ITERATIONS = 5;

class ConversationManager extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;
    this.stt = new STTService();
    this.llm = new LLMService();
    this.tts = null; // Chosen per-agent at startConversation

    this.agent = null;
    this.tools = { schemas: [], executors: {} };

    this.isCallActive = false;
    this.isResponding = false;
    this.toolIterations = 0;
    this.transcript = [];
    this.currentReplyParts = [];

    // Turn detection variables
    this.userSpeechBuffer = "";
    this.silenceTimeout = null;
    this.TURN_TIMEOUT_MS = 1500; // Wait 1.5 seconds of silence before responding

    this.setupListeners();
  }

  createTTS(voice = {}) {
    const provider = (voice.provider || process.env.TTS_PROVIDER || '').trim().toLowerCase();
    const tts = provider === 'fish' ? new FishAudioTTSProvider() : new TTSProvider();
    if (voice.voiceId) tts.voiceId = voice.voiceId;
    tts.on('audio', (audioBuffer) => {
      this.sendToClient({ event: 'audio', data: audioBuffer.toString('base64') });
    });
    return tts;
  }

  setupListeners() {
    // STT Events
    this.stt.on('transcript', (text, isFinal) => {
      if (isFinal && text.trim()) {
        this.userSpeechBuffer += (this.userSpeechBuffer ? " " : "") + text.trim();
        // Send the updated buffer to the client, but keep isFinal false so it stays in one bubble
        this.sendToClient({ event: 'transcript', data: { text: this.userSpeechBuffer, isFinal: false, speaker: 'user' } });
        this.restartTurnTimer();
      } else if (!isFinal && text.trim()) {
        const currentInterim = this.userSpeechBuffer + (this.userSpeechBuffer ? " " : "") + text.trim();
        this.sendToClient({ event: 'transcript', data: { text: currentInterim, isFinal: false, speaker: 'user' } });
        // Interim speech means the user is still talking — push the turn boundary out.
        // Restarting (not just clearing) the timer guarantees the buffered utterance is
        // eventually dispatched even if Deepgram never finalizes this segment.
        if (this.userSpeechBuffer.trim()) this.restartTurnTimer();
      }
    });

    this.stt.on('speech_start', () => {
      // The user is speaking: push the turn boundary out, but never strand the buffer.
      if (this.userSpeechBuffer.trim()) {
        this.restartTurnTimer();
      }
      // Barge-in logic: User started speaking, interrupt TTS if it's playing
      // Temporarily disabled to prevent speaker echo from accidentally interrupting the AI!
      // this.tts.interrupt();
    });

    this.stt.on('error', (err) => {
      console.error('[ConversationManager] STT Error:', err);
    });

    this.llm.on('llm_token', (token) => {
      this.tts.feedText(token);
    });

    this.llm.on('llm_reply_complete', (fullReply) => {
      this.currentReplyParts.push(fullReply);
      const spoken = this.currentReplyParts.filter(Boolean).join(' ').trim();
      this.currentReplyParts = [];
      this.isResponding = false;
      this.toolIterations = 0;
      this.transcript.push({ role: 'assistant', content: fullReply });
      if (spoken) {
        this.sendToClient({ event: 'transcript', data: { text: spoken, isFinal: true, speaker: 'agent' } });
      }
      this.tts.flush();
    });

    this.llm.on('llm_tool_calls', (toolCalls, partialReply) => {
      this.handleToolCalls(toolCalls, partialReply);
    });

    this.llm.on('llm_error', () => {
      // Never leave the caller in silence after a failure
      this.isResponding = false;
      this.toolIterations = 0;
      this.currentReplyParts = [];
      const fallback = "Sorry, I'm having a little trouble right now. Could you say that again?";
      this.transcript.push({ role: 'assistant', content: fallback });
      this.sendToClient({ event: 'transcript', data: { text: fallback, isFinal: true, speaker: 'agent' } });
      this.tts.feedText(fallback);
      this.tts.flush();
    });
  }

  restartTurnTimer() {
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    this.silenceTimeout = setTimeout(() => {
      if (this.userSpeechBuffer.trim()) {
        const finalText = this.userSpeechBuffer.trim();
        this.userSpeechBuffer = "";
        this.sendToClient({ event: 'transcript', data: { text: finalText, isFinal: true, speaker: 'user' } });
        this.handleUserUtterance(finalText);
      }
    }, this.TURN_TIMEOUT_MS);
  }

  async handleToolCalls(toolCalls, partialReply) {
    // Keep any spoken preamble ("Let me check that...") in the visible reply
    if (partialReply && partialReply.trim()) {
      this.currentReplyParts.push(partialReply.trim());
      this.sendToClient({ event: 'transcript', data: { text: partialReply.trim(), isFinal: false, speaker: 'agent' } });
    }

    this.toolIterations++;
    if (this.toolIterations > MAX_TOOL_ITERATIONS) {
      console.warn('[ConversationManager] Max tool iterations reached, forcing spoken reply.');
      this.transcript.push({ role: 'assistant', content: partialReply || '' });
      this.llm.generateResponse(this.transcript, []); // No tools => must speak
      return;
    }

    // If the model called tools without saying anything, speak a short filler so
    // the caller never sits in dead air while the tool runs.
    if (!partialReply || !partialReply.trim()) {
      const filler = "One moment.";
      this.currentReplyParts.push(filler);
      this.tts.feedText(filler + " ");
      this.tts.flush();
    }

    // Record the assistant tool_calls turn
    this.transcript.push({
      role: 'assistant',
      content: partialReply || null,
      tool_calls: toolCalls,
    });

    let shouldEndCall = false;

    for (const call of toolCalls) {
      const name = call.function.name;
      let args = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (e) {
        console.error('[ConversationManager] Failed to parse tool args:', e.message);
      }

      console.log(`[ConversationManager] Tool called: ${name}`, args);
      this.sendToClient({ event: 'tool_call', data: { name, args } });

      let result;
      const executor = this.tools.executors[name];
      if (!executor) {
        result = { error: `Unknown tool: ${name}` };
      } else {
        try {
          result = await executor(args);
        } catch (e) {
          console.error(`[ConversationManager] Tool ${name} failed:`, e);
          result = { error: e.message };
        }
      }

      if (result && result.ending_call) shouldEndCall = true;

      this.transcript.push({
        role: 'tool',
        tool_call_id: call.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
      this.sendToClient({ event: 'tool_result', data: { name, result } });
    }

    if (!this.isCallActive) return;

    // Feed results back so the agent can speak the outcome
    this.llm.generateResponse(this.transcript, this.tools.schemas);

    if (shouldEndCall) {
      // Give TTS a moment to finish the goodbye, then end
      setTimeout(() => {
        this.sendToClient({ event: 'end' });
        this.endConversation();
      }, 4000);
    }
  }

  async startConversation(config = {}) {
    console.log('[ConversationManager] Starting conversation with config:', config);

    // Resolve the agent: explicit agentId > inline config > default agent
    let agent = null;
    if (config.agentId) {
      agent = agentStore.getAgent(config.agentId);
      if (!agent) console.warn(`[ConversationManager] Agent ${config.agentId} not found, using default.`);
    }
    if (!agent) agent = agentStore.ensureDefaultAgent();

    // Inline overrides (backwards compatible with { systemPrompt })
    this.agent = {
      ...agent,
      ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
      ...(config.firstMessage ? { firstMessage: config.firstMessage } : {}),
    };

    this.tools = buildTools(this.agent.tools || []);
    this.tts = this.createTTS(this.agent.voice || {});
    this.llm.initialize({
      systemPrompt: (this.agent.systemPrompt || 'You are a friendly AI.') + VOICE_STYLE_GUIDE,
      model: this.agent.model,
      temperature: this.agent.temperature,
    });

    this.sendToClient({ event: 'start', config: { agentId: this.agent.id, name: this.agent.name } });
    this.isCallActive = true;

    await this.stt.connect();

    // Kick off the conversation with an instant greeting
    const greeting = this.agent.firstMessage || "Hi! How can I help you today?";
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
    // A new user turn cancels any in-flight generation cleanly
    if (this.isResponding) {
      this.llm.cancel();
      this.tts.interrupt();
      this.currentReplyParts = [];
    }
    this.isResponding = true;
    this.toolIterations = 0;
    this.transcript.push({ role: 'user', content: text });
    this.llm.generateResponse(this.transcript, this.tools.schemas);
  }

  endConversation() {
    console.log('[ConversationManager] Ending conversation.');
    this.isCallActive = false;
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    this.llm.cancel();
    this.stt.disconnect();
    if (this.tts) this.tts.interrupt();
  }

  sendToClient(msg) {
    if (this.ws && this.ws.readyState === 1) { // WebSocket.OPEN
      this.ws.send(JSON.stringify(msg));
    }
  }
}

module.exports = { ConversationManager };

# Callify — Complete Flow & Architecture

This document describes the end-to-end architecture of Callify's realtime voice agent: how audio flows through the system, how the agent produces natural-sounding speech, how turn-taking works, and how tool calling is wired (current state and intended design).

## 1. High-Level Overview

Callify is a low-latency, bidirectional voice agent. A browser client streams microphone audio to a Node.js server over a WebSocket; the server pipes it through a streaming pipeline of three AI services and streams synthesized speech back:

```
┌──────────────┐   WebSocket    ┌──────────────────────────────────────────────┐
│   Browser    │ ─── audio ───▶ │                 Node.js Server               │
│  (client.js) │                │                                              │
│              │ ◀── audio ──── │  connectionHandler ──▶ ConversationManager   │
│  Mic capture │ ◀ transcripts ─│         │                     │              │
│  WebAudio    │                │         │        ┌────────────┼────────────┐ │
│  playback    │                │         ▼        ▼            ▼            ▼ │
└──────────────┘                │      WS I/O   STTService   LLMService   TTS  │
                                └──────────│────────│────────────│─────────│───┘
                                           │        ▼            ▼         ▼
                                           │    Deepgram    OpenRouter/  ElevenLabs
                                           │    (nova-2)    OpenAI       or Fish Audio
```

**Key design principle: everything streams.** Nothing waits for a complete response at any stage — audio is transcribed as it arrives, LLM tokens are fed to TTS as they are generated, and TTS audio bytes are shipped to the client as they are synthesized. This is what keeps perceived latency low enough for natural conversation.

## 2. Components

| Component | File | Responsibility |
|---|---|---|
| Server entrypoint | `server/server.js` | Express + `ws` WebSocketServer on `VOICE_PORT` (default 8083); serves the test client statically; `/health` endpoint |
| Connection handler | `server/src/socket/connectionHandler.js` | Parses raw WS traffic into control events (`start`/`audio`/`stop`) or raw binary audio; one `ConversationManager` per connection |
| Conversation manager | `server/src/services/ConversationManager.js` | The brain: owns the transcript, turn detection, and orchestrates STT → LLM → TTS via events |
| STT service | `server/src/integrations/stt/sttService.js` | Live Deepgram WebSocket (`nova-2`, interim results, 300 ms endpointing); emits `transcript` and `speech_start` |
| LLM service | `server/src/integrations/llm/llmService.js` | Streaming chat completions via OpenRouter (or OpenAI fallback); emits `llm_token`, `llm_reply_complete`, `llm_error` |
| TTS (ElevenLabs) | `server/src/integrations/tts/ttsProvider.js` | Default provider; streaming WebSocket synthesis (`eleven_turbo_v2_5`, 16 kHz PCM) |
| TTS (Fish Audio) | `server/src/integrations/tts/fishAudioTtsProvider.js` | Alternative provider (`TTS_PROVIDER=fish`); sentence-buffered HTTP streaming |
| Test client | `client/client.js`, `client/index.html` | Mic capture (MediaRecorder, webm/opus, 250 ms chunks) + WebAudio playback + transcript log |
| Dashboard frontend | `frontend/` | React + Vite + shadcn/ui app (dashboard UI; separate from the realtime voice path) |

All services are `EventEmitter`s. The `ConversationManager` is the only component that knows about all of them; the services never talk to each other directly.

## 3. WebSocket Protocol

### Client → Server
| Message | Meaning |
|---|---|
| `{ event: 'start', config: { systemPrompt } }` | Begin a call; sets the agent persona |
| Raw binary frame (or `{ event: 'audio', data: <base64> }`) | Microphone audio chunk |
| `{ event: 'stop' }` | End the call |

### Server → Client
| Message | Meaning |
|---|---|
| `{ event: 'start', config }` | Call started (echo) |
| `{ event: 'transcript', data: { text, isFinal, speaker } }` | Live transcript update; `speaker` is `'user'` or `'agent'`; `isFinal: false` updates the in-progress bubble, `true` finalizes it |
| `{ event: 'audio', data: <base64 PCM> }` | Chunk of synthesized agent speech (16 kHz, 16-bit mono PCM) |

## 4. End-to-End Call Flow

### 4.1 Call setup
1. Client opens the WebSocket and sends `start` with a `systemPrompt`.
2. `ConversationManager.startConversation()`:
   - initializes the LLM with the system prompt,
   - connects the Deepgram STT socket (`await this.stt.connect()`),
   - immediately plays a **hard-coded instant greeting** ("Hi, thanks for calling!...") by pushing it into the transcript and feeding it straight to TTS — no LLM round-trip, so the caller hears a voice within moments of connecting.
3. Client simultaneously requests mic access and starts `MediaRecorder`, sending a webm/opus chunk every 250 ms as raw binary.

### 4.2 Listening (STT)
- Incoming audio is forwarded verbatim to Deepgram's live WebSocket.
- If audio arrives before the Deepgram socket is open, `STTService` buffers it in `audioBufferQueue` and flushes on open — critical because the first webm chunk contains the container headers.
- Deepgram returns `Results` messages; `STTService` emits:
  - `transcript(text, isFinal)` — interim (`is_final=false`) and finalized (`is_final || speech_final`) segments,
  - `speech_start` — when an interim transcript longer than 3 characters appears (the length check filters background noise), used for barge-in.

### 4.3 Turn detection (when does the agent respond?)
The `ConversationManager` implements silence-based end-of-turn detection on top of Deepgram's segment finalization:

1. Each finalized STT segment is appended to `userSpeechBuffer` (segments are accumulated so a pause mid-sentence doesn't split the utterance).
2. The growing buffer is streamed to the client with `isFinal: false`, so the UI shows one live "user" bubble.
3. A `TURN_TIMEOUT_MS = 1500` ms silence timer is (re)started after every finalized segment, and cleared whenever `speech_start` fires (the user kept talking).
4. If the timer fires, the utterance is complete: the client bubble is finalized (`isFinal: true`), the text is pushed onto the transcript as a `user` turn, and the LLM is invoked.

**Barge-in / interruption:** the hook exists — `speech_start` would call `this.tts.interrupt()` to cut the agent off mid-sentence — but it is currently commented out because speaker echo (the agent hearing itself through the caller's speakers) triggered false interruptions. Re-enabling it safely requires echo cancellation or acoustic echo suppression on the client.

### 4.4 Thinking (LLM)
`LLMService.generateResponse(transcript)`:
- Builds `messages = [system prompt, ...full conversation transcript]` — the whole history is re-sent every turn (stateless API, stateful manager).
- Calls `chat.completions.create({ stream: true })` against OpenRouter if `OPENROUTER_API_KEY` is set, else OpenAI directly. Model comes from `VOICE_LLM_MODEL` (default `openai/gpt-4o-mini` — deliberately a fast model, since time-to-first-token dominates voice latency).
- For every streamed chunk with text content it emits `llm_token(content)`; when the stream ends it emits `llm_reply_complete(fullReply)`.

The `ConversationManager` reacts:
- `llm_token` → `tts.feedText(token)` — **tokens are spoken as they are generated**, not after the reply completes.
- `llm_reply_complete` → push the assistant turn onto the transcript, send the final agent transcript bubble to the client, and `tts.flush()` to release any remaining buffered text/audio.

### 4.5 Speaking (TTS)
Two interchangeable providers, selected by `TTS_PROVIDER` env var (`fish` → Fish Audio, anything else → ElevenLabs). Both emit `audio(Buffer)` events with raw 16 kHz 16-bit PCM.

**ElevenLabs (`ttsProvider.js`, default)** — true streaming input:
- Lazily opens a WebSocket to the `stream-input` endpoint (`eleven_turbo_v2_5`, `output_format=pcm_16000`) per utterance; sends a BOS config message on open.
- Each LLM token is forwarded immediately as `{ text: token, try_trigger_generation: true }` — ElevenLabs decides internally when it has enough text to start generating audio, so speech begins before the sentence is even finished.
- `flush()` sends the empty-string EOS message so the final audio drains, then drops the socket; the next utterance gets a fresh connection.
- `interrupt()` sends EOS and force-closes the socket to abort generation instantly.

**Fish Audio (`fishAudioTtsProvider.js`)** — sentence-buffered streaming output:
- Fish's REST API doesn't accept incremental text, so tokens accumulate in `textBuffer` until a sentence boundary regex (`. ? ! \n` followed by whitespace) matches; each complete sentence is enqueued.
- A serial queue (`processQueue`) POSTs one sentence at a time to `api.fish.audio/v1/tts` (format `pcm`, 16 kHz) and streams the response body.
- Response bytes are re-chunked into ≥8 KB blocks with even byte counts (16-bit alignment) before emitting — small ragged chunks cause audible crackling in WebAudio on the client.
- `flush()` speaks whatever partial sentence remains; `interrupt()` clears the buffer and queue (in-flight fetches are not aborted — an `AbortController` is the noted future fix).

### 4.6 Playback (client)
- Each `audio` WS message is base64-decoded, truncated to an even byte length, reinterpreted as `Int16Array`, converted to `Float32Array` (`/ 32768`), and wrapped in a 16 kHz mono `AudioBuffer`.
- Buffers go into `audioQueue`; `playNextAudio()` schedules each buffer at `nextPlayTime` (tracking cumulative duration, with a 50 ms safety margin against underruns) so consecutive chunks join seamlessly into continuous speech.

### 4.7 Teardown
`stop` event or WS close/error → `endConversation()`: mark call inactive, disconnect Deepgram (empty-frame EOS then close), interrupt TTS.

## 5. How the Agent Sounds Natural

Naturalness is an emergent property of several deliberate choices:

1. **Streaming at every hop** — the caller starts hearing the reply after roughly *time-to-first-LLM-token + time-to-first-TTS-byte*, not after the full reply is generated and synthesized.
2. **Instant scripted greeting** — the first thing the caller hears skips the LLM entirely.
3. **Silence-based turn detection (1.5 s)** — mid-sentence pauses don't trigger a premature response; the agent waits for a genuine end of turn, mirroring human conversational timing.
4. **Persona via system prompt** — the client sends e.g. *"You are a friendly and professional AI receptionist. Keep your answers brief and natural."*; brevity instructions matter enormously for voice, where long answers feel robotic.
5. **Fast model selection** — `gpt-4o-mini` (or any fast OpenRouter model) keeps time-to-first-token low.
6. **Expressive TTS voices** — ElevenLabs turbo with tuned `stability`/`similarity_boost`, or Fish Audio voice clones.
7. **Gapless scheduled playback** — precise WebAudio scheduling plus ≥8 KB aligned chunks eliminate clicks, gaps, and crackle between streamed chunks.
8. **Live transcript bubbles** — interim transcripts stream to the UI so the user sees the agent "hearing" them in real time.
9. **(Planned) barge-in** — the plumbing to let the caller interrupt the agent mid-sentence exists but is disabled pending echo cancellation (see §4.3).

## 6. Tool Calling

### 6.1 Current state: scaffolded, not yet active

The event plumbing for tool calling exists end-to-end, but the actual execution loop is stubbed out:

- `LLMService.generateResponse(transcript, tools = [])` accepts a `tools` parameter, but the `tools:` field in the completion request is **commented out**, so the model is never offered any tools.
- The streaming loop detects `chunk.choices[0]?.delta?.tool_calls` but the handler body is a placeholder comment ("Emitting tool call logic would go here").
- `ConversationManager` already subscribes to a `tool_call` event:

```js
this.llm.on('tool_call', (toolName, args) => {
  console.log(`[ConversationManager] Tool called: ${toolName}`, args);
  // Execute tool and feed result back to LLM
  // this.llm.submitToolResult(toolName, result);
});
```

So today, no tool is ever invoked; the agent is pure conversation.

### 6.2 Intended design (what the scaffolding implies)

The architecture is set up for the standard OpenAI streaming tool-call loop:

1. **Registration** — a tool registry (JSON-schema function definitions + executor functions) is passed as `tools` into `generateResponse`, and the `tools:` field is enabled on the completion request.
2. **Streamed accumulation** — with `stream: true`, tool calls arrive as incremental `delta.tool_calls` fragments (id, function name, then argument-string chunks). `LLMService` must accumulate fragments per `tool_call.index` until the stream finishes with `finish_reason: 'tool_calls'`, then `JSON.parse` the arguments and emit `tool_call(toolName, args)` (plus the call id).
3. **Execution** — `ConversationManager` looks up the executor in the registry, runs it (e.g. check calendar availability, book an appointment, look up an order, transfer the call), and calls `llm.submitToolResult(...)`.
4. **Result round-trip** — `submitToolResult` appends the assistant `tool_calls` message and a `{ role: 'tool', tool_call_id, content }` message to the transcript, then re-invokes the streaming completion. The model's follow-up tokens flow through the existing `llm_token → tts.feedText` path, so the agent *speaks the outcome of the tool call* exactly like any other reply.

```
User speech ──▶ STT ──▶ ConversationManager ──▶ LLM (stream)
                                                  │
                                   finish_reason: tool_calls
                                                  ▼
                              emit tool_call(name, args, id)
                                                  ▼
                              ConversationManager executes tool
                                                  ▼
                              submitToolResult → LLM re-stream
                                                  │
                                            llm_token ▶ TTS ▶ client audio
```

5. **Voice-specific concern: filling the silence.** A tool call adds an extra LLM round-trip plus tool latency, during which the caller hears nothing. A natural-sounding implementation should either instruct the model to verbalize intent before calling the tool ("Let me check that for you…") or have the `ConversationManager` play a short scripted/TTS filler when a `tool_call` event fires.

## 7. Configuration

| Variable | Purpose | Default |
|---|---|---|
| `VOICE_PORT` | HTTP/WS server port | `8083` |
| `DEEPGRAM_API_KEY` | STT | required |
| `OPENROUTER_API_KEY` | LLM via OpenRouter (takes precedence) | — |
| `OPENAI_API_KEY` | LLM fallback | — |
| `VOICE_LLM_MODEL` | Chat model | `openai/gpt-4o-mini` |
| `TTS_PROVIDER` | `fish` → Fish Audio; else ElevenLabs | ElevenLabs |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | ElevenLabs TTS | Adam voice |
| `FISH_API_KEY` / `FISH_VOICE_ID` | Fish Audio TTS | preset voice |

## 8. Known Limitations & Future Work

- **Tool calling** is scaffolded but not implemented (§6).
- **Barge-in** is disabled due to speaker echo; needs client-side echo cancellation before re-enabling `tts.interrupt()` on `speech_start`.
- **Fish Audio interruption** can't abort an in-flight synthesis request (needs `AbortController`).
- **Audio format mismatch**: the test client sends webm/opus while the Deepgram URL doesn't pin an encoding; Deepgram auto-detects the container, but a raw-PCM capture path (AudioWorklet) would be more robust.
- **Session state is in-memory per connection** — no persistence, reconnection recovery, or multi-instance scaling (would need sticky sessions or externalized state).
- **STT errors are logged but not surfaced** to the client; there is no automatic Deepgram reconnect.

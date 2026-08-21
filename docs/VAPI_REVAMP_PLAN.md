# Callify → Vapi-Style Platform: Revamp Plan

Goal: turn Callify from a single hard-coded voice demo into a configurable voice-agent platform (like Vapi): users create agents in the frontend, attach tools (Google Sheets, Calendar, custom webhooks), and the agent holds a natural, human-like conversation without stalling.

## Problems with the current flow

1. **No tool calling** — the `tools:` field is commented out in `llmService.js`; `delta.tool_calls` handling is a stub; the `tool_call` listener in `ConversationManager` only logs.
2. **Conversation gets stuck** — `speech_start` (fired by any interim transcript > 3 chars) *clears* the turn-silence timer but nothing restarts it unless another *final* STT segment arrives. If Deepgram never finalizes that segment (background noise, echo), the buffered utterance is never dispatched and the agent stays silent until the user speaks again. LLM errors also fail silently (logged, never spoken).
3. **Robotic interrogation** — nothing in the prompt guides conversational style, so models ask for each detail one question at a time.
4. **Nothing is configurable** — one hard-coded greeting, prompt-only config from the test client, TTS provider from a server env var. The React frontend is a static mockup.

## Target architecture

```
Frontend (React, Vapi-style)                Server (Node)
┌────────────────────────────┐   REST   ┌──────────────────────────────┐
│ /assistants  (list/create) │ ───────▶ │ /api/agents  (CRUD, JSON DB) │
│ /assistants/:id (editor)   │          │ /api/tools   (tool catalog)  │
│  · Model tab (prompt, LLM) │          └──────────────┬───────────────┘
│  · Voice tab               │                         │ agent config
│  · Tools tab               │   WS     ┌──────────────▼───────────────┐
│ Web call widget ("Talk")   │ ───────▶ │ ConversationManager          │
└────────────────────────────┘  audio   │  STT ─ LLM ⇄ ToolRegistry    │
                                        │         └──▶ TTS             │
                                        └──────────────────────────────┘
```

## Workstreams

### 1. Real tool calling (agentic loop)
- `LLMService`: enable `tools` on the streaming completion; accumulate `delta.tool_calls` fragments per index; on `finish_reason: 'tool_calls'` emit the parsed calls.
- `ConversationManager`: run the standard loop — execute tools via the registry, append `assistant(tool_calls)` + `role:'tool'` results to the transcript, re-stream, repeat (bounded) until a plain spoken reply.
- **No dead air**: when a tool call starts, immediately speak a short filler ("One sec, let me check that…") so the caller never hears silence during tool latency.
- Built-in tool types (configured per agent in the frontend):
  - **Google Sheets** (`google_sheets`): append a row (lead capture, survey answers) via a user-provided Apps Script/webhook URL — no OAuth server flow needed.
  - **Calendar** (`calendar`): check availability + book a slot via a webhook URL, with a built-in demo calendar fallback so it works out of the box.
  - **Custom API / webhook** (`api_request`): user defines name, description, JSON-schema parameters, URL, method, headers — the generic escape hatch (like Vapi tools).
  - **End call** (`end_call`): lets the model hang up gracefully.

### 2. Fix the "stuck" conversation
- `speech_start` now *restarts* the turn timer instead of only clearing it, so a never-finalized interim can't strand the buffered utterance.
- Interim transcripts also refresh the timer (activity = not end of turn; silence after activity = end of turn).
- `llm_error` → agent speaks a graceful fallback line instead of going silent.
- Guard against overlapping generations: a new user turn interrupts an in-flight response cleanly.

### 3. Natural, human-like conversation
- Server-side **voice style guide** appended to every agent's system prompt: short conversational replies, no bullet lists/markdown, collect related details in one question instead of one-by-one interrogation, confirm before acting, natural acknowledgements.
- Per-agent **first message** (greeting), model, temperature — configurable, not hard-coded.
- Numbers/emails spoken naturally (prompt guidance).

### 4. Agent configuration platform
- **Backend**: JSON-file agent store + REST API (`GET/POST/PUT/DELETE /api/agents`, `GET /api/tools` catalog). WS `start` accepts `{ agentId }` and loads the full agent config (prompt, greeting, model, voice, tools). Backwards compatible with inline `{ systemPrompt }`.
- **Frontend** (wire up the existing Vapi-style mockup):
  - Routing: `/dashboard/assistants` (list + create), `/dashboard/assistants/:id` (editor with Model / Voice / Tools tabs), sidebar `NavLink`s.
  - Tools tab: enable/disable built-in tools, configure webhook URLs, define custom tools.
  - **Talk** button: in-browser web call (mic capture + WebAudio playback, ported from `client/client.js`) against the selected assistant with live transcript.

### 5. Later (not in this pass)
- Real Google OAuth integrations, phone numbers (Twilio), squads, evals, call logs/recordings persistence, barge-in with echo cancellation, multi-tenant auth, DB instead of JSON store.

# Real-Time Voice Calling Architecture

The `realtime-voice-service` is an event-driven, low-latency streaming audio pipeline that bridges users and AI interviewers. It handles Speech-to-Text (STT), Large Language Model (LLM) generation, and Text-to-Speech (TTS) synthesis entirely via streaming to minimize response times.

## System Overview

```mermaid
graph TD
    Client[Web Browser / Client] <-->|WebSocket| Server[Socket Handler]
    
    subscript
        Server -->|Raw Audio| CM[Conversation Manager]
        CM -->|Audio Stream| STT[Deepgram STT]
        STT -->|Transcript| CM
        CM -->|Transcript| LLM[LLM Service]
        LLM -->|Tokens| CM
        CM -->|Tokens| TTS[TTS Provider]
        TTS -->|Audio Chunks| CM
        CM -->|Base64 Audio| Server
    end
```

## How It Works

### 1. Connection & Audio Capture
- **Client (`client/client.js`)**: The user's browser requests microphone access and uses `MediaRecorder` to capture audio.
- The audio is sent in small binary chunks (e.g., every 250ms) to the Node.js backend over a WebSocket (`ws://`).
- **Server (`server/src/socket/connectionHandler.js`)**: Receives the WebSocket connection, creates a unique `ConversationManager` session for the user, and routes binary messages as incoming audio.

### 2. Speech-to-Text (STT)
- The `ConversationManager` streams incoming audio directly to the `STTService` (powered by Deepgram).
- Deepgram processes the audio continuously and emits partial and final transcripts.
- Once a final transcript is detected (and a silence threshold is met), the `ConversationManager` passes the complete user utterance to the LLM.

### 3. Large Language Model (LLM)
- The `LLMService` (using OpenRouter/OpenAI) receives the conversation history.
- As the LLM generates a response, it **streams** tokens back to the `ConversationManager` one by one. This is critical for low latency, as it allows TTS to begin before the LLM has finished its thought.

### 4. Text-to-Speech (TTS)
The system supports multiple TTS providers (ElevenLabs, Fish Audio), selectable via environment variables (`TTS_PROVIDER`).

- **Chunking**: As tokens arrive from the LLM, the TTS Provider buffers them. In the case of Fish Audio, the provider performs **Sentence Chunking** (detecting punctuation like `.`, `!`, `?`).
- **Synthesis**: Once a sentence is complete, it is queued for TTS generation via a streaming fetch request.
- **Audio Streaming**: As the TTS API generates audio, the provider reads the raw byte stream (16kHz, 16-bit PCM). To prevent WebAudio crackling on the client, the provider groups these bytes into larger chunks (e.g., 8KB blocks) and emits them back to the `ConversationManager`.

### 5. Playback
- The `ConversationManager` encodes the raw PCM chunk into a Base64 string and sends it to the client via the WebSocket: `{ event: 'audio', data: '...' }`.
- The frontend decodes the Base64 data back into an `ArrayBuffer`, converts the 16-bit integers to 32-bit floats, and places them into an `AudioBufferSourceNode`.
- An `audioQueue` manages smooth sequential playback using the Web Audio API, seamlessly joining the streaming chunks together.

## File Structure
- `client/client.js`: Frontend logic for microphone capture and WebAudio playback.
- `server/src/services/ConversationManager.js`: The brain of the session. Orchestrates events between STT, LLM, and TTS.
- `server/src/socket/connectionHandler.js`: Manages the raw WebSocket traffic.
- `server/src/integrations/`:
  - `llm/llmService.js`: Connects to LLM inference endpoints.
  - `stt/sttService.js`: Connects to Deepgram for live STT.
  - `tts/ttsProvider.js`: ElevenLabs TTS integration.
  - `tts/fishAudioTtsProvider.js`: Fish Audio TTS integration.

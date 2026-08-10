# Realtime Voice Service Documentation

Welcome to the documentation for the `realtime-voice-service`. This service provides a low-latency, bidirectional voice interface for PlaceMateAI's interviewing system.

## Documentation Contents

- [Architecture & Implementation Details](./architecture.md): Understand the data flow, streaming mechanics, and the interactions between the Socket Handler, Conversation Manager, and AI services (STT, LLM, TTS).

## Core Technologies
- **Node.js & WebSockets**: For real-time, bidirectional audio and event streaming.
- **Deepgram**: For highly accurate, streaming Speech-to-Text (STT).
- **OpenRouter / OpenAI**: For intelligent, conversational responses (LLM).
- **Fish Audio & ElevenLabs**: For ultra-realistic, low-latency Text-to-Speech (TTS).

## Getting Started

1. Ensure all API keys are set in your `.env` file (see `.env.example` if applicable, or refer to the environment variables injected into the project).
2. Start the service with `npm start` (or `node server.js`).
3. Connect a client via WebSocket to stream audio back and forth. You can use the provided `client/index.html` for testing.

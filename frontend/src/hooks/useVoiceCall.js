import { useCallback, useEffect, useRef, useState } from 'react';
import { wsUrl } from '../lib/api';

// In-browser web call: mic capture (MediaRecorder webm) up the WS,
// 16kHz 16-bit PCM chunks down, scheduled gaplessly via WebAudio.
export function useVoiceCall() {
  const [status, setStatus] = useState('idle'); // idle | connecting | active
  const [messages, setMessages] = useState([]); // { speaker, text, isFinal } and { speaker:'tool', text }
  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const audioCtxRef = useRef(null);
  const nextPlayTimeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      recorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    recorderRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    wsRef.current = null;
    nextPlayTimeRef.current = 0;
    setStatus('idle');
  }, []);

  const playChunk = useCallback((base64) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const raw = atob(base64);
    const evenLength = Math.floor(raw.length / 2) * 2;
    const buf = new ArrayBuffer(evenLength);
    const view = new Uint8Array(buf);
    for (let i = 0; i < evenLength; i++) view[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(buf);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
    const audioBuffer = ctx.createBuffer(1, float32.length, 16000);
    audioBuffer.getChannelData(0).set(float32);
    if (nextPlayTimeRef.current < ctx.currentTime + 0.05) {
      nextPlayTimeRef.current = ctx.currentTime + 0.05;
    }
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  }, []);

  const upsertMessage = useCallback((speaker, text, isFinal) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.speaker === speaker && !last.isFinal) {
        next[next.length - 1] = { speaker, text, isFinal };
      } else {
        next.push({ speaker, text, isFinal });
      }
      return next;
    });
  }, []);

  const startCall = useCallback(async (agentId) => {
    if (wsRef.current) return;
    setMessages([]);
    setStatus('connecting');
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();

    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = async () => {
      ws.send(JSON.stringify({ event: 'start', config: { agentId } }));
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        recorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        recorder.start(250);
        setStatus('active');
      } catch (err) {
        console.error('Mic access failed', err);
        ws.close();
        cleanup();
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'transcript') {
          upsertMessage(msg.data.speaker, msg.data.text, msg.data.isFinal);
        } else if (msg.event === 'audio') {
          playChunk(msg.data);
        } else if (msg.event === 'tool_call') {
          setMessages((prev) => [...prev, { speaker: 'tool', text: `Calling tool: ${msg.data.name}`, isFinal: true }]);
        } else if (msg.event === 'tool_result') {
          setMessages((prev) => [...prev, { speaker: 'tool', text: `Tool ${msg.data.name} finished`, isFinal: true }]);
        } else if (msg.event === 'end') {
          ws.close();
        }
      } catch (e) {
        console.error('Bad WS message', e);
      }
    };

    ws.onclose = cleanup;
    ws.onerror = cleanup;
  }, [cleanup, playChunk, upsertMessage]);

  const endCall = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'stop' }));
      ws.close();
    }
    cleanup();
  }, [cleanup]);

  useEffect(() => () => endCall(), [endCall]);

  return { status, messages, startCall, endCall };
}

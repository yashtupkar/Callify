import { useState, useRef, useCallback } from 'react';

export function useVoiceSession(serverUrl) {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [usage, setUsage] = useState(null);
  const [cost, setCost] = useState(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  // Pending frontend tool calls keyed by toolCallId — so the UI can present
  // them and the user can submit a result back to the server.
  const [pendingToolCalls, setPendingToolCalls] = useState({});
  
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const nextStartTimeRef = useRef(0);

  const endSession = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'session.ended' }));
      wsRef.current.close();
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Stop background noise playback
    if (window.bgAudio) {
      window.bgAudio.pause();
      window.bgAudio.currentTime = 0;
      window.bgAudio = null;
    }
    
    setIsConnected(false);
    setIsAgentSpeaking(false);
  }, []);

  const startSession = useCallback(async (config) => {
    try {
      // Clear previous states
      setTranscript([]);
      setPendingToolCalls({});
      setUsage(null);
      setCost(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;
      
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      nextStartTimeRef.current = audioContextRef.current.currentTime;

      // Play realistic background noise from an MP3 file
      window.bgAudio = new Audio('/audios/Calm_office_ambience_noise.mp3');
      window.bgAudio.loop = true;
      window.bgAudio.volume = 0.1; // Set low volume for background ambiance
      window.bgAudio.play().catch(e => console.error("Could not play background noise:", e));

      ws.onopen = () => {
        setIsConnected(true);
        // Start protocol
        ws.send(JSON.stringify({
          type: 'session.start',
          config: config
        }));

        // Send audio to server every 250ms
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            const buffer = await e.data.arrayBuffer();
            // Send raw audio buffer (or wrap in protocol if browser adapter prefers base64)
            // Note: Our browser adapter handles raw binary natively!
            ws.send(buffer);
          }
        };
        mediaRecorder.start(250);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.event === 'transcript') {
            const now = Date.now();
            setTranscript(prev => {
              const newTranscript = [...prev];
              // Only consolidate into the last *text* message, never into a
              // tool_call entry (which has type === 'tool_call' and no isFinal flag).
              const last = newTranscript[newTranscript.length - 1];
              const isConsolidatable = last && !last.type && !last.isFinal && last.speaker === msg.data.speaker;
              if (isConsolidatable) {
                newTranscript[newTranscript.length - 1] = {
                  speaker: msg.data.speaker,
                  text: msg.data.text,
                  isFinal: msg.data.isFinal,
                  timestamp: now
                };
              } else {
                newTranscript.push({
                  speaker: msg.data.speaker,
                  text: msg.data.text,
                  isFinal: msg.data.isFinal,
                  timestamp: now
                });
              }
              return newTranscript;
            });
          }
          else if (msg.event === 'audio') {
            setIsAgentSpeaking(true);
            playAudioData(msg.data);
            // Hide agent speaking animation after 500ms of no audio
            clearTimeout(window.speakingTimeout);
            window.speakingTimeout = setTimeout(() => setIsAgentSpeaking(false), 500);
          }
          else if (msg.event === 'clear_audio') {
            // User barge-in
            if (audioContextRef.current) {
              audioContextRef.current.close();
              audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
              nextStartTimeRef.current = audioContextRef.current.currentTime;
            }
            setIsAgentSpeaking(false);
          }
          else if (msg.type === 'usage.updated') {
            setUsage(msg.usage);
            setCost(msg.cost);
          }
          else if (msg.event === 'stop') {
            endSession();
          }
          else if (msg.event === 'tool_call_started') {
            const now = Date.now();
            setPendingToolCalls(prev => ({
              ...prev,
              [msg.toolCallId]: {
                toolName: msg.toolName,
                args: msg.args,
                isFrontend: msg.isFrontend,
                startTime: msg.timestamp || now
              }
            }));
            setTranscript(prev => {
              const existing = prev.findIndex(t => t.toolCallId === msg.toolCallId && t.type === 'tool_call');
              const entry = {
                type: 'tool_call',
                speaker: 'agent',
                toolName: msg.toolName,
                args: msg.args,
                toolCallId: msg.toolCallId,
                timestamp: msg.timestamp || now,
                startTime: msg.timestamp || now,
                completed: false,
                isFrontend: msg.isFrontend,
                result: null
              };
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = entry;
                return next;
              }
              return [...prev, entry];
            });
          }
          else if (msg.event === 'tool_call_completed') {
            setTranscript(prev => prev.map(t => {
              if (t.toolCallId === msg.toolCallId && t.type === 'tool_call') {
                const serverDuration = msg.timestamp ? msg.timestamp - t.startTime : 0;
                return {
                  ...t,
                  completed: true,
                  result: msg.result,
                  duration: serverDuration > 0 ? serverDuration : (Date.now() - t.startTime)
                };
              }
              return t;
            }));
            setPendingToolCalls(prev => {
              const next = { ...prev };
              delete next[msg.toolCallId];
              return next;
            });
          }
        } catch (err) {
          console.error("Failed to parse websocket message", err);
        }
      };

      ws.onclose = () => endSession();
      ws.onerror = () => endSession();

    } catch (err) {
      console.error("Failed to access microphone or connect:", err);
      endSession();
    }
  }, [serverUrl, endSession]);

  const playAudioData = (base64) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    // decode base64 to array buffer
    const binary = window.atob(base64);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    
    // We assume 16000Hz 16-bit PCM for ElevenLabs/FishAudio
    const audioBuffer = ctx.createBuffer(1, buffer.length / 2, 16000);
    const channelData = audioBuffer.getChannelData(0);
    
    let offset = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = (buffer[i] | (buffer[i + 1] << 8));
      const signedSample = sample >= 0x8000 ? sample - 0x10000 : sample;
      channelData[offset++] = signedSample / 0x8000;
    }
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;
  };

  const sendTextMessage = useCallback((text) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text.input',
        text: text
      }));
    }
  }, []);

  const completeToolCall = useCallback((toolCallId, result) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'tool.completed',
        toolName: pendingToolCalls[toolCallId]?.toolName,
        result,
        toolCallId
      }));
    }
    setPendingToolCalls(prev => {
      const next = { ...prev };
      delete next[toolCallId];
      return next;
    });
  }, [pendingToolCalls]);

  return {
    isConnected,
    isAgentSpeaking,
    transcript,
    usage,
    cost,
    startSession,
    endSession,
    sendTextMessage,
    pendingToolCalls,
    completeToolCall
  };
}

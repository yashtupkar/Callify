import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Mic, MicOff } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export function WebDialer({ agentId, agentConfig }) {
  const [status, setStatus] = useState('idle'); // idle, connecting, connected
  const [transcript, setTranscript] = useState([]);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const audioQueueRef = useRef([]);
  const activeSourcesRef = useRef([]);

  const cleanup = () => {
    setStatus('idle');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    audioQueueRef.current = [];
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  };

  useEffect(() => {
    return cleanup;
  }, []);

  const playNextAudio = () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) return;
    
    if (nextPlayTimeRef.current < audioContextRef.current.currentTime + 0.05) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime + 0.05;
    }
    
    const buffer = audioQueueRef.current.shift();
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
    };
    
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
    
    if (audioQueueRef.current.length > 0) {
      playNextAudio();
    }
  };

  const handleStart = async () => {
    if (!agentId) return;
    cleanup();
    setStatus('connecting');
    setTranscript([]);
    
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      const wsUrl = `ws://localhost:8083/?agentId=${agentId}&protocol=web`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        try {
          setStatus('connected');
          ws.send(JSON.stringify({ 
            event: 'start', 
            config: agentConfig 
          }));

          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true } 
          });
          
          // Let the browser choose the supported MIME type
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                ws.send(JSON.stringify({ event: 'audio', data: base64data }));
              };
              reader.readAsDataURL(event.data);
            }
          };
          
          mediaRecorder.start(250);
        } catch (err) {
          console.error("Error in WebDialer onopen:", err);
          cleanup();
        }
      };

      ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.event === 'clear_audio') {
              audioQueueRef.current = [];
              nextPlayTimeRef.current = 0;
              activeSourcesRef.current.forEach(source => {
                try { source.stop(); } catch(e) {}
              });
              activeSourcesRef.current = [];
            } else if (msg.event === 'transcript' && msg.data.isFinal) {
              setTranscript(prev => [...prev, { speaker: msg.data.speaker, text: msg.data.text }]);
            } else if (msg.event === 'audio') {
              const audioData = atob(msg.data);
              const evenLength = Math.floor(audioData.length / 2) * 2;
              const arrayBuffer = new ArrayBuffer(evenLength);
              const view = new Uint8Array(arrayBuffer);
              
              for (let i = 0; i < evenLength; i++) {
                view[i] = audioData.charCodeAt(i);
              }
              
              const int16Array = new Int16Array(arrayBuffer);
              const float32Array = new Float32Array(int16Array.length);
              for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0;
              }
              
              const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 16000);
              audioBuffer.getChannelData(0).set(float32Array);
              
              audioQueueRef.current.push(audioBuffer);
              playNextAudio();
            }
          } catch (e) {
            console.error("Error parsing message", e);
          }
        }
      };

      ws.onclose = () => {
        cleanup();
      };
    } catch (err) {
      console.error(err);
      cleanup();
    }
  };

  const handleStop = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'stop' }));
    }
    cleanup();
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold flex items-center gap-2">
          {status === 'connected' ? <Mic className="text-emerald-500 w-4 h-4 animate-pulse" /> : <MicOff className="text-muted-foreground w-4 h-4" />}
          Web Dialer Test
        </span>
        <div className="flex items-center gap-2">
          {status === 'idle' ? (
            <Button size="sm" onClick={handleStart} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8">
              <Play className="w-4 h-4 mr-1" /> Talk
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={handleStop} className="h-8">
              <Square className="w-4 h-4 mr-1" /> End
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 p-4 overflow-auto min-h-[200px] flex flex-col gap-3">
        {transcript.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
            {status === 'idle' ? "Click Talk to start chatting with your agent" : "Listening..."}
          </div>
        )}
        {transcript.map((t, i) => (
          <div key={i} className={`flex flex-col max-w-[80%] ${t.speaker === 'agent' ? 'items-start self-start' : 'items-end self-end'}`}>
            <span className="text-[10px] text-muted-foreground mb-1 ml-1">{t.speaker === 'agent' ? 'Agent' : 'You'}</span>
            <div className={`px-3 py-2 rounded-lg text-sm ${t.speaker === 'agent' ? 'bg-accent text-foreground' : 'bg-primary text-primary-foreground'}`}>
              {t.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

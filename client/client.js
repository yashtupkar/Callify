let ws = null;
let mediaRecorder = null;
let audioContext = null;
let audioQueue = [];
let isPlaying = false;
let activeSources = [];

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptLog = document.getElementById('transcriptLog');

function appendLog(speaker, text) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const speakerSpan = document.createElement('span');
    speakerSpan.className = speaker === 'agent' ? 'speaker-agent' : 'speaker-user';
    speakerSpan.textContent = `${speaker === 'agent' ? 'Agent' : 'You'}: `;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    
    entry.appendChild(speakerSpan);
    entry.appendChild(textSpan);
    transcriptLog.appendChild(entry);
    transcriptLog.scrollTop = transcriptLog.scrollHeight;
}

startBtn.addEventListener('click', async () => {
    transcriptLog.innerHTML = '';
    
    // Initialize Web Audio API for playback
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Connect to backend WebSocket
    const wsUrl = `ws://${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = async () => {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Tell the server to start the conversation
        ws.send(JSON.stringify({ 
            event: 'start', 
            config: { systemPrompt: "You are a friendly and professional dental clinic receptionist. You can help users check availability and book dental appointments. Always use the provided tools to check availability and book appointments when requested. Keep your answers brief and natural." }
        }));

        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        
        // We use MediaRecorder to capture audio chunks and send to WS
        // Note: Deepgram linear16 expects raw PCM. 
        // For browser MediaRecorder, it usually outputs webm/opus.
        // Deepgram handles webm/opus if configured correctly, but we set it to linear16 in the backend. 
        // We should adjust backend to 'webm' if we send webm, or use a ScriptProcessor to extract raw PCM.
        // For simplicity of this demo, we'll send standard browser audio (webm) and assume backend deepgram config is updated to match.
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
                // Send raw binary
                ws.send(event.data);
            }
        };
        
        // Capture audio chunks every 250ms
        mediaRecorder.start(250);
    };

    ws.onmessage = async (event) => {
        // If data is JSON, it's a control message (transcript)
        if (typeof event.data === 'string') {
            try {
                const msg = JSON.parse(event.data);
                if (msg.event === 'clear_audio') {
                    // Stop playback immediately
                    audioQueue = [];
                    nextPlayTime = 0;
                    activeSources.forEach(source => {
                        try { source.stop(); } catch(e) {}
                    });
                    activeSources = [];
                } else if (msg.event === 'transcript' && msg.data.isFinal) {
                    appendLog(msg.data.speaker, msg.data.text);
                } else if (msg.event === 'audio') {
                    // Base64 encoded raw PCM from ElevenLabs (16kHz 16-bit)
                    const audioData = atob(msg.data);
                    
                    // Ensure the byte length is even to prevent Int16Array from throwing a RangeError
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
                    
                    const audioBuffer = audioContext.createBuffer(1, float32Array.length, 16000);
                    audioBuffer.getChannelData(0).set(float32Array);
                    
                    audioQueue.push(audioBuffer);
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
});

let nextPlayTime = 0;

function playNextAudio() {
    if (audioQueue.length === 0) return;
    
    // Ensure nextPlayTime is not in the past. Add 0.05s buffer to prevent cracking/underruns.
    if (nextPlayTime < audioContext.currentTime + 0.05) {
        nextPlayTime = audioContext.currentTime + 0.05;
    }
    
    const buffer = audioQueue.shift();
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    
    activeSources.push(source);
    source.onended = () => {
        activeSources = activeSources.filter(s => s !== source);
    };
    
    source.start(nextPlayTime);
    nextPlayTime += buffer.duration;
    
    // Continue processing the queue
    if (audioQueue.length > 0) {
        playNextAudio();
    }
}

stopBtn.addEventListener('click', () => {
    if (ws) {
        ws.send(JSON.stringify({ event: 'stop' }));
        ws.close();
    }
    cleanup();
});

function cleanup() {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    ws = null;
    audioQueue = [];
    isPlaying = false;
    nextPlayTime = 0;
}

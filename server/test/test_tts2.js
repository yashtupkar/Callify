require('dotenv').config();
const WebSocket = require('ws');
const apiKey = process.env.ELEVENLABS_API_KEY;
console.log('API Key exists:', !!apiKey);

const url = `wss://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream-input?model_id=eleven_turbo_v2_5&output_format=pcm_16000`;
const ws = new WebSocket(url);

ws.on('open', () => {
    console.log('Connected');
    ws.send(JSON.stringify({ text: " ", xi_api_key: apiKey }));
    ws.send(JSON.stringify({ text: "Hello world this is a test", try_trigger_generation: true }));
    ws.send(JSON.stringify({ text: "" })); // End of stream
});

ws.on('message', (data) => {
    console.log('Message:', data.toString().substring(0, 50));
});

ws.on('close', (code, reason) => {
    console.log('Closed', code, reason.toString());
});

ws.on('error', (err) => {
    console.log('Error', err);
});

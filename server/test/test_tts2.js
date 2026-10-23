/**
 * Test ElevenLabs Real Usage (WebSocket & REST API Response)
 *
 * Demonstrates:
 * 1. REST Generation: extracts `character-cost` and `request-id` directly from API response headers.
 * 2. WebSocket Stream: captures real audio chunks and normalized alignment character breakdown.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const WebSocket = require('ws');

async function testTTSRealUsage() {
    console.log('\n========================================');
    console.log('   TESTING REAL TTS (ELEVENLABS) USAGE');
    console.log('========================================\n');

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
    const modelId = 'eleven_turbo_v2_5';
    const testText = "Hello world this is a test of real usage tracking.";

    console.log('API Key exists:', !!apiKey);
    console.log('Voice ID:', voiceId);
    console.log('Model ID:', modelId);
    console.log('Input Text:', `"${testText}" (${testText.length} raw characters)\n`);

    if (!apiKey) {
        console.error('❌ Error: Missing ELEVENLABS_API_KEY in .env');
        return;
    }

    // --- Part 1: REST API Response Headers (Real character-cost) ---
    console.log('--- 1. REST API Response Usage (Headers) ---');
    try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: testText,
                model_id: modelId
            })
        });

        console.log('Response Status:', res.status, res.statusText);

        const realCharCost = res.headers.get('character-cost');
        const requestId = res.headers.get('request-id');
        const maxConcurrent = res.headers.get('maximum-concurrent-requests');
        const currentConcurrent = res.headers.get('current-concurrent-requests');

        console.log('\n🔍 REAL USAGE FROM ELEVENLABS API HEADERS:');
        console.log('-------------------------------------------');
        console.log('  Request ID           :', requestId);
        console.log('  Real Character Cost  :', realCharCost, '(debited by ElevenLabs for this model)');
        console.log('  Raw Input Characters :', testText.length);
        console.log('  Max Concurrency      :', maxConcurrent);
        console.log('  Current Concurrency  :', currentConcurrent);

        const audioBuffer = await res.arrayBuffer();
        console.log('  Audio Output Size    :', audioBuffer.byteLength, 'bytes\n');
    } catch (err) {
        console.error('❌ REST TTS error:', err.message);
    }

    // --- Part 2: WebSocket Streaming Alignment & Chunks ---
    console.log('--- 2. WebSocket Real-Time Stream & Alignment ---');
    await new Promise((resolve) => {
        const url = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${modelId}&output_format=pcm_16000`;
        const ws = new WebSocket(url);

        let totalAudioBytes = 0;
        let alignmentChars = [];

        ws.on('open', () => {
            console.log('WebSocket Connected to ElevenLabs.');
            ws.send(JSON.stringify({
                text: " ",
                voice_settings: { stability: 0.5, similarity_boost: 0.8 },
                xi_api_key: apiKey
            }));
            ws.send(JSON.stringify({ text: testText, try_trigger_generation: true }));
            ws.send(JSON.stringify({ text: "" })); // End of stream
        });

        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                if (parsed.audio) {
                    const chunk = Buffer.from(parsed.audio, 'base64');
                    totalAudioBytes += chunk.length;
                }
                if (parsed.normalizedAlignment?.chars) {
                    alignmentChars = parsed.normalizedAlignment.chars;
                }
                if (parsed.isFinal) {
                    console.log('\n🔍 REAL USAGE FROM WEBSOCKET STREAM:');
                    console.log('------------------------------------');
                    console.log('  Stream Finalized     : true');
                    console.log('  Total Audio Received :', totalAudioBytes, 'bytes (PCM 16kHz)');
                    console.log('  Aligned Character Count:', alignmentChars.filter(c => c.trim()).length, 'non-space characters');
                    console.log('  Aligned Character Sample:', alignmentChars.slice(0, 15).join(''), '...');
                }
            } catch (err) {
                console.error('WS parse error:', err);
            }
        });

        ws.on('close', (code, reason) => {
            console.log('WebSocket Closed with code:', code);
            console.log('✅ ElevenLabs TTS Test Completed.\n');
            resolve();
        });

        ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            resolve();
        });
    });
}

if (require.main === module) {
    testTTSRealUsage();
}

module.exports = { testTTSRealUsage };

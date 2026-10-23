/**
 * Test STT Real Usage from API Response
 * 
 * Intercepts Deepgram's real Metadata & Results frames to get the exact
 * audio duration processed by the API, request_id, and model info
 * rather than relying on estimated wall-clock calculations.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const WebSocket = require('ws');

async function testSTTUsage() {
  return new Promise((resolve, reject) => {
    console.log('\n========================================');
    console.log('   TESTING REAL STT (DEEPGRAM) API USAGE');
    console.log('========================================\n');

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error('❌ Error: Missing DEEPGRAM_API_KEY in .env');
      return resolve();
    }

    const sampleRate = 16000;
    const channels = 1;
    const testAudioDurationSec = 2.5; // Simulate 2.5 seconds of PCM audio
    const totalBytes = Math.floor(sampleRate * 2 * channels * testAudioDurationSec); // 16-bit = 2 bytes/sample

    const url = `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&encoding=linear16&sample_rate=${sampleRate}&channels=${channels}`;
    console.log(`📡 Connecting to Deepgram WebSocket...`);
    console.log(`🎙️ Sending simulated ${testAudioDurationSec}s audio buffer (${totalBytes} bytes at ${sampleRate}Hz)...\n`);

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Token ${apiKey}`
      }
    });

    let initialMetadata = null;
    let finalMetadata = null;
    let totalSpeechDuration = 0;

    ws.on('open', () => {
      console.log('✅ Deepgram WebSocket Connected.');

      // Chunk audio in 100ms packets (3200 bytes each)
      const chunkSize = 3200;
      let offset = 0;

      // Generate simulated audio buffer (tone + noise to avoid total silence rejection)
      const audioBuffer = Buffer.alloc(totalBytes);
      for (let i = 0; i < totalBytes / 2; i++) {
        const val = Math.floor(Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 1000);
        audioBuffer.writeInt16LE(val, i * 2);
      }

      const interval = setInterval(() => {
        if (offset < totalBytes) {
          const chunk = audioBuffer.subarray(offset, Math.min(offset + chunkSize, totalBytes));
          ws.send(chunk);
          offset += chunkSize;
        } else {
          clearInterval(interval);
          console.log('📤 Finished sending audio. Sending `CloseStream` to receive final usage metadata...');
          // Tell Deepgram to finalize and output summary metadata
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
      }, 50);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'Results') {
          if (msg.duration !== undefined) {
            totalSpeechDuration += msg.duration;
            const transcript = msg.channel?.alternatives?.[0]?.transcript || '';
            console.log(`  [Results Frame] start: ${msg.start}s, duration: ${msg.duration}s, text: "${transcript}"`);
          }
        } else if (msg.type === 'Metadata') {
          if (msg.duration === 0 && !initialMetadata) {
            initialMetadata = msg;
            console.log(`  [Initial Handshake] Request ID: ${msg.request_id}`);
          } else {
            finalMetadata = msg;
            console.log('\n🔍 REAL USAGE DIRECTLY FROM DEEPGRAM API METADATA:');
            console.log('--------------------------------------------------');
            console.log('  Request ID           :', msg.request_id);
            console.log('  Exact Duration (sec) :', msg.duration, 'seconds (Billed by Deepgram)');
            console.log('  Channels Processed   :', msg.channels);
            console.log('  Model Used           :', msg.models?.join(', ') || 'nova-2');
            if (msg.model_info) {
              const info = Object.values(msg.model_info)[0];
              console.log('  Model Details        :', `${info?.name} (arch: ${info?.arch}, ver: ${info?.version})`);
            }
            console.log('\n📦 Full Raw `Metadata` Object From Deepgram Response:');
            console.log(JSON.stringify(msg, null, 2));
            ws.close();
          }
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`\n🔒 Connection Closed (Code: ${code}).`);
      if (!finalMetadata && initialMetadata) {
        console.log('⚠️ Notice: Final Metadata was not received before close; initial request ID was:', initialMetadata.request_id);
      }
      console.log('✅ STT Usage Test Completed.\n');
      resolve();
    });

    ws.on('error', (err) => {
      console.error('❌ STT WebSocket Error:', err.message);
      reject(err);
    });
  });
}

if (require.main === module) {
  testSTTUsage().catch(console.error);
}

module.exports = { testSTTUsage };

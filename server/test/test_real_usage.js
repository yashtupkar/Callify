/**
 * All-In-One Real Usage Test Suite (LLM, STT, TTS)
 * 
 * Fetches the ACTUAL usage, duration, character-costs, and billing metrics
 * directly from provider API responses (OpenRouter/OpenAI, Deepgram, ElevenLabs, Fish, Sarvam)
 * rather than locally estimated rates.
 * 
 * Usage:
 *   node test/test_real_usage.js         # Runs all tests
 *   node test/test_real_usage.js --llm   # Tests only LLM
 *   node test/test_real_usage.js --stt   # Tests only STT
 *   node test/test_real_usage.js --tts   # Tests only TTS
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { OpenAI } = require('openai');
const WebSocket = require('ws');

// Summary container for final report
const usageReport = [];

// ==========================================
// 1. LLM REAL USAGE (OpenRouter / OpenAI)
// ==========================================
async function runLLMTest() {
  console.log('\n======================================================');
  console.log(' [1/3] LLM REAL USAGE TEST (OpenRouter / OpenAI)');
  console.log('======================================================');

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined;
  const model = process.env.AI_MODEL_PRIMARY || process.env.VOICE_LLM_MODEL || 'openai/gpt-oss-120b';

  if (!apiKey) {
    console.error('❌ Skipped: No OPENROUTER_API_KEY or OPENAI_API_KEY found in .env');
    return;
  }

  const client = new OpenAI({ baseURL, apiKey });

  try {
    console.log(`📡 Sending test prompt to model: "${model}"...`);
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a fast customer service voice agent.' },
        { role: 'user', content: 'Confirm in 5 words that our call is connected.' }
      ],
      temperature: 0.5,
      stream: false
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    const usage = completion.usage || {};

    console.log(`💬 Model Reply: "${reply}"\n`);
    console.log('🔍 ACTUAL API RESPONSE USAGE FIELDS:');
    console.log('  • Prompt Tokens        :', usage.prompt_tokens);
    console.log('  • Completion Tokens    :', usage.completion_tokens);
    console.log('  • Total Tokens         :', usage.total_tokens);
    if (usage.cost !== undefined) {
      console.log('  • Exact Cost (USD)     : $' + usage.cost.toFixed(6), '(Returned directly by OpenRouter API)');
    }
    if (usage.prompt_tokens_details?.cached_tokens) {
      console.log('  • Cached Tokens        :', usage.prompt_tokens_details.cached_tokens);
    }
    if (usage.completion_tokens_details?.reasoning_tokens) {
      console.log('  • Reasoning Tokens     :', usage.completion_tokens_details.reasoning_tokens);
    }

    usageReport.push({
      service: 'LLM',
      provider: baseURL ? 'OpenRouter' : 'OpenAI',
      model,
      metric: 'Tokens & Direct USD Cost',
      realApiValue: `${usage.total_tokens} tokens (Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}) | Cost: $${(usage.cost || 0).toFixed(6)}`,
      rawResponseSnippet: {
        id: completion.id,
        usage: completion.usage
      }
    });

  } catch (err) {
    console.error('❌ LLM Test Error:', err.message);
  }
}

// ==========================================
// 2. STT REAL USAGE (Deepgram WebSocket)
// ==========================================
async function runSTTTest() {
  console.log('\n======================================================');
  console.log(' [2/3] STT REAL USAGE TEST (Deepgram)');
  console.log('======================================================');

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error('❌ Skipped: No DEEPGRAM_API_KEY found in .env');
    return;
  }

  return new Promise((resolve) => {
    const sampleRate = 16000;
    const testSeconds = 2.0;
    const totalBytes = sampleRate * 2 * testSeconds;

    const url = `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&encoding=linear16&sample_rate=${sampleRate}`;
    console.log(`📡 Connecting to Deepgram WebSocket and streaming ${testSeconds}s audio (${totalBytes} bytes)...`);

    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${apiKey}` }
    });

    const audioBuffer = Buffer.alloc(totalBytes);
    for (let i = 0; i < totalBytes / 2; i++) {
      const val = Math.floor(Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 1000);
      audioBuffer.writeInt16LE(val, i * 2);
    }

    ws.on('open', () => {
      const chunkSize = 3200;
      let offset = 0;

      const interval = setInterval(() => {
        if (offset < totalBytes) {
          const chunk = audioBuffer.subarray(offset, Math.min(offset + chunkSize, totalBytes));
          ws.send(chunk);
          offset += chunkSize;
        } else {
          clearInterval(interval);
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
      }, 40);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'Metadata' && msg.duration > 0) {
          console.log('\n🔍 ACTUAL DEEPGRAM API METADATA USAGE:');
          console.log('  • Request ID           :', msg.request_id);
          console.log('  • Exact Duration       :', msg.duration, 'seconds (Deepgram billable duration)');
          console.log('  • Channels             :', msg.channels);
          console.log('  • Models Active        :', msg.models?.join(', '));
          if (msg.model_info) {
            const info = Object.values(msg.model_info)[0];
            console.log('  • Model Name/Arch      :', `${info?.name} (${info?.arch})`);
          }

          usageReport.push({
            service: 'STT',
            provider: 'Deepgram',
            model: 'nova-2',
            metric: 'Audio Duration Processed',
            realApiValue: `${msg.duration} seconds (Request: ${msg.request_id})`,
            rawResponseSnippet: msg
          });

          ws.close();
        }
      } catch (err) {
        console.error('Error parsing STT message:', err);
      }
    });

    ws.on('close', () => {
      resolve();
    });

    ws.on('error', (err) => {
      console.error('❌ STT Test Error:', err.message);
      resolve();
    });
  });
}

// ==========================================
// 3. TTS REAL USAGE (ElevenLabs, Fish, Sarvam)
// ==========================================
async function runTTSTest() {
  console.log('\n======================================================');
  console.log(' [3/3] TTS REAL USAGE TEST (ElevenLabs, Fish, Sarvam)');
  console.log('======================================================');

  const testText = "Callify real usage audit test.";

  // --- ElevenLabs ---
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const elevenVoice = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
  if (elevenKey) {
    try {
      console.log('📡 Testing ElevenLabs TTS API Response Headers...');
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoice}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: testText,
          model_id: 'eleven_turbo_v2_5'
        })
      });

      const realCost = res.headers.get('character-cost');
      const reqId = res.headers.get('request-id');
      const maxConc = res.headers.get('maximum-concurrent-requests');

      console.log('  • ElevenLabs Real Character Cost  :', realCost, '(returned in `character-cost` header)');
      console.log('  • ElevenLabs Raw Input Length     :', testText.length, 'characters');
      console.log('  • ElevenLabs Request ID           :', reqId);
      console.log('  • ElevenLabs Max Concurrency      :', maxConc);

      usageReport.push({
        service: 'TTS',
        provider: 'ElevenLabs',
        model: 'eleven_turbo_v2_5',
        metric: 'Character Cost (Header)',
        realApiValue: `${realCost} characters billed (Raw text: ${testText.length} chars) | Request: ${reqId}`,
        rawResponseSnippet: {
          'character-cost': realCost,
          'request-id': reqId,
          'maximum-concurrent-requests': maxConc
        }
      });
    } catch (err) {
      console.error('❌ ElevenLabs error:', err.message);
    }
  }

  // --- Fish Audio ---
  const fishKey = process.env.FISH_API_KEY;
  if (fishKey) {
    try {
      console.log('\n📡 Testing Fish Audio Wallet/Credit API...');
      const creditRes = await fetch('https://api.fish.audio/wallet/self/api-credit', {
        headers: { Authorization: `Bearer ${fishKey}` }
      });
      if (creditRes.ok) {
        const wallet = await creditRes.json();
        console.log('  • Fish Audio Real Account Credit  :', wallet.credit, 'credits');
        console.log('  • Fish Audio User ID              :', wallet.user_id);

        usageReport.push({
          service: 'TTS',
          provider: 'Fish Audio',
          model: 's2.1-pro-free',
          metric: 'Real Wallet Credit Balance',
          realApiValue: `${wallet.credit} credits available (User: ${wallet.user_id})`,
          rawResponseSnippet: wallet
        });
      }
    } catch (err) {
      console.error('❌ Fish Audio error:', err.message);
    }
  }

  // --- Sarvam AI ---
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (sarvamKey) {
    try {
      console.log('\n📡 Testing Sarvam AI TTS Request...');
      const sarvamText = "नमस्ते, यह यूसेज टेस्ट है।";
      const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'api-subscription-key': sarvamKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: [sarvamText],
          target_language_code: 'hi-IN',
          speaker: 'ishita',
          model: 'bulbul:v3'
        })
      });

      const body = await sarvamRes.json();
      const xReqId = sarvamRes.headers.get('x-request-id');

      console.log('  • Sarvam Request ID               :', body.request_id || xReqId);
      console.log('  • Sarvam Audio Chunks             :', body.audios?.length || 0);

      usageReport.push({
        service: 'TTS',
        provider: 'Sarvam AI',
        model: 'bulbul:v3',
        metric: 'Request Tracking & Chunks',
        realApiValue: `Request ID: ${body.request_id || xReqId} (${sarvamText.length} input chars)`,
        rawResponseSnippet: {
          request_id: body.request_id,
          audios_count: body.audios?.length
        }
      });
    } catch (err) {
      console.error('❌ Sarvam error:', err.message);
    }
  }
}

// ==========================================
// MAIN RUNNER & DASHBOARD
// ==========================================
async function main() {
  const args = process.argv.slice(2);
  const runOnlyLLM = args.includes('--llm');
  const runOnlySTT = args.includes('--stt');
  const runOnlyTTS = args.includes('--tts');
  const runAll = !runOnlyLLM && !runOnlySTT && !runOnlyTTS;

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        CALLIFY REAL API USAGE VERIFICATION SUITE       ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  if (runAll || runOnlyLLM) await runLLMTest();
  if (runAll || runOnlySTT) await runSTTTest();
  if (runAll || runOnlyTTS) await runTTSTest();

  console.log('\n======================================================');
  console.log('           📊 FINAL USAGE COMPARISON SUMMARY          ');
  console.log('======================================================');
  console.table(usageReport.map(item => ({
    Service: item.service,
    Provider: item.provider,
    Model: item.model,
    'Metric Type': item.metric,
    'Real API Response Value': item.realApiValue
  })));

  console.log('\n💡 Note: All values above are extracted directly from provider API responses');
  console.log('   (response bodies, headers, and metadata frames), completely bypassing');
  console.log('   local rate estimates.\n');
}

main().catch(console.error);

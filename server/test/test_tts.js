/**
 * Multi-Provider TTS Real Usage Test
 * 
 * Tests real API responses and usage for all configured TTS providers:
 * 1. ElevenLabs: real `character-cost` and `request-id` response headers.
 * 2. Fish Audio: real account credit balance and inference response headers.
 * 3. Sarvam AI: real request ID and character conversion metrics.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testAllTTSUsage() {
  console.log('\n========================================');
  console.log('   TESTING MULTI-PROVIDER TTS USAGE');
  console.log('========================================\n');

  const testText = "Welcome to Callify. Testing real TTS provider usage metrics.";

  // 1. ElevenLabs
  console.log('--- 1. ElevenLabs TTS Real Usage ---');
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const elevenVoice = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
  if (elevenKey) {
    try {
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

      console.log('  Status Code          :', res.status, res.statusText);
      console.log('  Request ID           :', res.headers.get('request-id'));
      console.log('  Real Character Cost  :', res.headers.get('character-cost'), '(debited by ElevenLabs)');
      console.log('  Raw Text Characters  :', testText.length);
      console.log('  Max Concurrency      :', res.headers.get('maximum-concurrent-requests'));
      console.log('  Current Concurrency  :', res.headers.get('current-concurrent-requests'));
    } catch (err) {
      console.error('  ❌ ElevenLabs error:', err.message);
    }
  } else {
    console.log('  ⚠️ ELEVENLABS_API_KEY not configured.');
  }

  // 2. Fish Audio
  console.log('\n--- 2. Fish Audio TTS Real Usage ---');
  const fishKey = process.env.FISH_API_KEY;
  if (fishKey) {
    try {
      // Query account wallet credits
      const creditRes = await fetch('https://api.fish.audio/wallet/self/api-credit', {
        headers: { Authorization: `Bearer ${fishKey}` }
      });
      if (creditRes.ok) {
        const wallet = await creditRes.json();
        console.log('  User ID              :', wallet.user_id);
        console.log('  Real Available Credit:', wallet.credit, 'credits');
        console.log('  Cumulative Top-up    :', wallet.cumulative_top_up);
      }

      // Convert TTS
      const ttsRes = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fishKey}`,
          'Content-Type': 'application/json',
          model: 's2.1-pro-free'
        },
        body: JSON.stringify({
          text: testText,
          format: 'pcm'
        })
      });
      console.log('  TTS Status Code      :', ttsRes.status);
      console.log('  Concurrency Limit    :', ttsRes.headers.get('ratelimit-limit-concurrency'));
      console.log('  Current Concurrency  :', ttsRes.headers.get('ratelimit-current-concurrency'));
    } catch (err) {
      console.error('  ❌ Fish Audio error:', err.message);
    }
  } else {
    console.log('  ⚠️ FISH_API_KEY not configured.');
  }

  // 3. Sarvam AI
  console.log('\n--- 3. Sarvam AI TTS Real Usage ---');
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (sarvamKey) {
    try {
      const sarvamText = "नमस्ते, यह कैलिफ़ाई की रियल यूसेज ट्रैकिंग है।";
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

      console.log('  Status Code          :', sarvamRes.status);
      console.log('  X-Request-ID         :', sarvamRes.headers.get('x-request-id'));
      const body = await sarvamRes.json();
      console.log('  Payload Request ID   :', body.request_id);
      console.log('  Input Text Characters:', sarvamText.length);
      console.log('  Audio Chunks Returned:', body.audios?.length || 0);
    } catch (err) {
      console.error('  ❌ Sarvam AI error:', err.message);
    }
  } else {
    console.log('  ⚠️ SARVAM_API_KEY not configured.');
  }

  console.log('\n✅ Multi-Provider TTS Test Completed.\n');
}

if (require.main === module) {
  testAllTTSUsage();
}

module.exports = { testAllTTSUsage };

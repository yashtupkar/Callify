/**
 * Test LLM Real Usage from API Response
 * 
 * Fetches the real token usage, caching details, and exact USD cost
 * directly from the API response (OpenRouter / OpenAI), NOT calculated locally.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { OpenAI } = require('openai');

async function testLLMUsage() {
  console.log('\n========================================');
  console.log('   TESTING REAL LLM API USAGE');
  console.log('========================================\n');

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined;
  const model = process.env.AI_MODEL_PRIMARY || process.env.VOICE_LLM_MODEL || 'openai/gpt-oss-120b';

  if (!apiKey) {
    console.error('❌ Error: Missing OPENROUTER_API_KEY or OPENAI_API_KEY in .env');
    return;
  }

  console.log(`📡 Connecting to: ${baseURL || 'https://api.openai.com/v1'}`);
  console.log(`🤖 Model: ${model}\n`);

  const client = new OpenAI({ baseURL, apiKey });

  // 1. Non-Streaming Test
  console.log('--- 1. Testing Non-Streaming Chat Completion ---');
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a concise voice assistant.' },
        { role: 'user', content: 'In one short sentence, describe why real API usage tracking is better than estimates.' }
      ],
      temperature: 0.5,
      stream: false
    });

    console.log('💬 Agent Response:', response.choices[0]?.message?.content?.trim());
    console.log('\n🔍 REAL USAGE DIRECTLY FROM API RESPONSE:');
    console.log('-----------------------------------------');
    console.log('  Request ID           :', response.id);
    console.log('  Model Used           :', response.model);
    console.log('  Prompt Tokens        :', response.usage?.prompt_tokens);
    console.log('  Completion Tokens    :', response.usage?.completion_tokens);
    console.log('  Total Tokens         :', response.usage?.total_tokens);

    if (response.usage?.cost !== undefined) {
      console.log('  Exact Cost (USD)     : $' + response.usage.cost.toFixed(6));
    }
    if (response.usage?.prompt_tokens_details?.cached_tokens) {
      console.log('  Cached Tokens        :', response.usage.prompt_tokens_details.cached_tokens);
    }
    if (response.usage?.completion_tokens_details?.reasoning_tokens) {
      console.log('  Reasoning Tokens     :', response.usage.completion_tokens_details.reasoning_tokens);
    }
    if (response.usage?.cost_details) {
      console.log('  Upstream Cost Details:', JSON.stringify(response.usage.cost_details));
    }

    console.log('\n📦 Full Raw `usage` Object From Response:');
    console.log(JSON.stringify(response.usage, null, 2));
  } catch (err) {
    console.error('❌ Non-streaming test failed:', err.message);
  }

  // 2. Streaming Test (with stream_options.include_usage = true)
  console.log('\n--- 2. Testing Streaming Chat Completion (stream_options: { include_usage: true }) ---');
  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a concise voice assistant.' },
        { role: 'user', content: 'Say "Hello, real-time usage tracking is active!" in 7 words.' }
      ],
      temperature: 0.5,
      stream: true,
      stream_options: { include_usage: true }
    });

    let streamedText = '';
    let streamUsage = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) streamedText += delta;
      if (chunk.usage) {
        streamUsage = chunk.usage;
      }
    }

    console.log('💬 Streamed Response:', streamedText.trim());
    console.log('\n🔍 REAL USAGE FROM STREAM FINAL CHUNK:');
    console.log('-----------------------------------------');
    if (streamUsage) {
      console.log('  Prompt Tokens        :', streamUsage.prompt_tokens);
      console.log('  Completion Tokens    :', streamUsage.completion_tokens);
      console.log('  Total Tokens         :', streamUsage.total_tokens);
      if (streamUsage.cost !== undefined) {
        console.log('  Exact Cost (USD)     : $' + streamUsage.cost.toFixed(6));
      }
      console.log('\n📦 Full Raw `chunk.usage` Object:');
      console.log(JSON.stringify(streamUsage, null, 2));
    } else {
      console.log('⚠️ No usage chunk received in stream.');
    }
  } catch (err) {
    console.error('❌ Streaming test failed:', err.message);
  }

  console.log('\n✅ LLM Usage Test Completed.\n');
}

if (require.main === module) {
  testLLMUsage();
}

module.exports = { testLLMUsage };

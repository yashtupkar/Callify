require('dotenv').config();
const { SarvamAIClient } = require('sarvamai');

async function test() {
  const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });
  const response = await client.textToSpeech.convertStream({
      text: 'hello',
      target_language_code: "hi-IN",
      speaker: "ishita",
      model: "bulbul:v3",
      pace: 1,
      speech_sample_rate: 16000,
      output_audio_codec: "linear16",
  });
  
  if (typeof response.stream === 'function') {
    const stream = response.stream();
    const reader = stream.getReader();
    const { value } = await reader.read();
    console.log('First chunk length:', value.length);
    console.log('First 50 bytes:', Buffer.from(value).toString('hex').substring(0, 100));
    console.log('First 50 bytes ASCII:', Buffer.from(value).toString('ascii').substring(0, 50));
  }
}
test();

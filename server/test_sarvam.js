const { SarvamAIClient } = require('sarvamai');

async function test() {
  const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY || 'dummy' });
  const response = await client.textToSpeech.convertStream({
      text: 'hello',
      target_language_code: "hi-IN",
      speaker: "ishita",
      model: "bulbul:v3",
      pace: 1,
      speech_sample_rate: 16000,
  });
}
console.log('Type of client.textToSpeech.convertStream', typeof SarvamAIClient.prototype.textToSpeech);

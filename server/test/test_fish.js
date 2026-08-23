require('dotenv').config();
const fs = require('fs');

async function test() {
  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) {
    console.log('No FISH_API_KEY');
    return;
  }
  
  console.log('Fetching from fish...');
  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify({
      text: "Hello world, this is a test of the audio format.",
      reference_id: "933563129e564b19a115bedd57b7406a",
      format: "pcm",
      sample_rate: 16000
    }),
  });

  if (!response.ok) {
    console.error('Error:', await response.text());
    return;
  }
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync('out.pcm', Buffer.from(buffer));
  console.log('Wrote out.pcm, size:', buffer.byteLength);
  
  // also test mp3
  const response2 = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify({
      text: "Hello world, this is a test of the audio format.",
      reference_id: "933563129e564b19a115bedd57b7406a",
      format: "mp3",
    }),
  });
  const buffer2 = await response2.arrayBuffer();
  fs.writeFileSync('out.mp3', Buffer.from(buffer2));
  console.log('Wrote out.mp3, size:', buffer2.byteLength);
}

test();

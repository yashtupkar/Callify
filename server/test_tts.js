require('dotenv').config();
const { TTSProvider } = require('./src/integrations/tts/ttsProvider.js');

const tts = new TTSProvider();

tts.on('audio', (buffer) => {
    console.log('Received audio chunk of size:', buffer.length);
});

tts.feedText("Hello world this is a test.");

setTimeout(() => {
    console.log('Test complete');
    process.exit(0);
}, 5000);
